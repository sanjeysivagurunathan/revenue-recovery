/**
 * apps/web/src/app/api/webhooks/razorpay/route.ts
 *
 * Razorpay webhook endpoint (§10).
 *
 * Security: Every request is HMAC-SHA256 signature verified against the
 * RAZORPAY_WEBHOOK_SECRET before any processing occurs. Unsigned requests
 * are immediately rejected with 401.
 */

import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDetectQueue } from "@/lib/queues";
import { type RazorpayWebhookPayload, LeakType } from "@revenue-recovery/types";
import { prisma, CaseStatus } from "@revenue-recovery/db";

/** Verify the Razorpay webhook signature (HMAC-SHA256) */
function verifyRazorpaySignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expectedSig),
    Buffer.from(signature)
  );
}

/** Map Razorpay events to our internal LeakType enum */
function mapEventToLeakType(event: string): string | null {
  if (event.startsWith("payment.failed")) {
    return LeakType.PAYMENT_DEGRADATION;
  }
  if (event.startsWith("subscription.charged.failed") || event.startsWith("subscription.halted")) {
    return LeakType.SUBSCRIPTION_FAILURE;
  }
  return null;
}

/**
 * Handle a successful payment event — mark the linked case as RECOVERED.
 * Razorpay fires: order.paid, payment.captured, payment_link.paid, payment.authorized
 */
async function handlePaymentSuccess(payload: any): Promise<void> {
  const payment = payload.payload?.payment?.entity;
  const order = payload.payload?.order?.entity;
  const paymentLink = payload.payload?.payment_link?.entity;

  let matchedCaseId: string | null = null;

  // 1. Direct check: case_id stored inside Razorpay notes object
  const noteCaseId = payment?.notes?.case_id || order?.notes?.case_id || paymentLink?.notes?.case_id;
  if (noteCaseId) {
    const caseByNote = await prisma.revenueCase.findUnique({ where: { id: noteCaseId } });
    if (caseByNote) {
      matchedCaseId = caseByNote.id;
    }
  }

  // 2. Matching possible sourceRefs
  if (!matchedCaseId) {
    const possibleRefs: string[] = [];
    if (payment?.id) possibleRefs.push(payment.id);
    if (payment?.order_id) possibleRefs.push(payment.order_id);
    if (order?.id) possibleRefs.push(order.id);
    if (paymentLink?.id) possibleRefs.push(paymentLink.id);

    if (possibleRefs.length > 0) {
      const matchedCase = await prisma.revenueCase.findFirst({
        where: {
          sourceRef: { in: possibleRefs },
          status: { notIn: [CaseStatus.RECOVERED, CaseStatus.FAILED, CaseStatus.STOPPED] },
        },
      });
      if (matchedCase) matchedCaseId = matchedCase.id;
    }
  }

  // 3. Fallback: parse case ID from description if present
  if (!matchedCaseId) {
    const description = paymentLink?.description ?? payment?.description ?? order?.description ?? "";
    const caseIdMatch = description.match(/\(case ([a-z0-9]+)\)/i);
    if (caseIdMatch) {
      const caseById = await prisma.revenueCase.findUnique({ where: { id: caseIdMatch[1] } });
      if (caseById) matchedCaseId = caseById.id;
    }
  }

  if (!matchedCaseId) {
    console.log("[Webhook] No open case found for success event:", payload.event);
    return;
  }

  const amountPaise = payment?.amount ?? order?.amount ?? paymentLink?.amount ?? 0;
  const amountRecovered = amountPaise > 0 ? amountPaise / 100 : 0;

  await prisma.$transaction([
    prisma.revenueCase.update({
      where: { id: matchedCaseId },
      data: {
        status: CaseStatus.RECOVERED,
        amountRecovered: amountRecovered > 0 ? amountRecovered : undefined,
        resolvedAt: new Date(),
      },
    }),
    prisma.auditEntry.create({
      data: {
        caseId: matchedCaseId,
        actor: "system:razorpay-webhook",
        action: "state_transition",
        fromStatus: CaseStatus.INTERVENING,
        toStatus: CaseStatus.RECOVERED,
        reasoning: `Payment successfully captured via Razorpay live webhook (${payload.event}). INR ${amountRecovered} recovered. (Payment ID: ${payment?.id ?? "N/A"})`,
      },
    }),
  ]);

  console.log(`[Webhook] ✅ Case ${matchedCaseId} marked as RECOVERED — INR ${amountRecovered} recovered`);
}

export async function POST(req: NextRequest) {
  /* ── 1. Read raw body as text (required for HMAC verification) ── */
  const rawBody = await req.text();

  /* ── 2. Verify signature ── */
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];

  if (!secret) {
    console.error("RAZORPAY_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (!signature || !verifyRazorpaySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  /* ── 3. Parse body ── */
  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.event;
  console.log("[Webhook] Razorpay event received:", event);

  /* ── 4a. Handle SUCCESS events → mark case as RECOVERED ── */
  // Note: We only handle order.paid and payment_link.paid — NOT payment.authorized.
  // Razorpay fires payment.authorized before order.paid for the same transaction.
  // Acting on both would create duplicate RECOVERED audit entries.
  const successEvents = ["order.paid", "payment.captured", "payment_link.paid"];
  if (successEvents.includes(event)) {
    await handlePaymentSuccess(payload);
    return NextResponse.json({ received: true });
  }

  /* ── 4b. Handle FAILURE events → enqueue detect job ── */
  const leakType = mapEventToLeakType(event);

  let sourceRef = "";
  if (payload.payload.payment) {
    sourceRef = payload.payload.payment.entity.id;
  } else if (payload.payload.subscription) {
    sourceRef = payload.payload.subscription.entity.id;
  } else if (payload.payload.order) {
    sourceRef = payload.payload.order.entity.id;
  }

  if (leakType && sourceRef) {
    await getDetectQueue().add("webhook", {
      sourceRef,
      leakType,
      rawPayload: payload,
      receivedAt: new Date().toISOString(),
    });
    console.log(`[Webhook] Enqueued case:detect job for ${sourceRef}`);
  } else {
    console.log(`[Webhook] Unmapped event type: ${event} or missing sourceRef`);
  }

  /* Acknowledge immediately — Razorpay expects a 200 within 5 seconds */
  return NextResponse.json({ received: true });
}
