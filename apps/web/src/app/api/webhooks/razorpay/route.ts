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
import { inngest } from "@/inngest/client";
import { type RazorpayWebhookPayload, LeakType } from "@revenue-recovery/types";
import { prisma, CaseStatus } from "@revenue-recovery/db";
import { sendPaymentSuccessEmail } from "@/inngest/adapters/email";
import { sendPaymentSuccessSms } from "@/inngest/adapters/sms";

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
  if (
    event.startsWith("subscription.charged.failed") ||
    event.startsWith("subscription.halted") ||
    event.startsWith("subscription.pending") ||
    event.startsWith("subscription.paused")
  ) {
    return LeakType.SUBSCRIPTION_FAILURE;
  }
  return null;
}

/**
 * Handle a successful payment event — mark the linked case as RECOVERED.
 * Razorpay fires: order.paid, payment.captured, payment_link.paid, subscription.charged
 */
async function handlePaymentSuccess(payload: any): Promise<void> {
  const payment = payload.payload?.payment?.entity;
  const order = payload.payload?.order?.entity;
  const paymentLink = payload.payload?.payment_link?.entity;
  const subscription = payload.payload?.subscription?.entity;
  const invoice = payload.payload?.invoice?.entity;

  let matchedCaseId: string | null = null;

  // 1. Direct check: case_id stored inside Razorpay notes object
  const noteCaseId =
    payment?.notes?.case_id ||
    order?.notes?.case_id ||
    paymentLink?.notes?.case_id ||
    subscription?.notes?.case_id;

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
    if (payment?.subscription_id) possibleRefs.push(payment.subscription_id);
    if (order?.id) possibleRefs.push(order.id);
    if (paymentLink?.id) possibleRefs.push(paymentLink.id);
    if (subscription?.id) possibleRefs.push(subscription.id);
    if (invoice?.subscription_id) possibleRefs.push(invoice.subscription_id);

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
    const description =
      paymentLink?.description ?? payment?.description ?? order?.description ?? "";
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

  const amountPaise =
    payment?.amount ??
    order?.amount ??
    paymentLink?.amount ??
    subscription?.current_billing_amount ??
    0;
  const amountRecovered = amountPaise > 0 ? amountPaise / 100 : 0;

  const updatedCase = await prisma.revenueCase.findUnique({
    where: { id: matchedCaseId },
    include: { customer: true },
  });

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
        reasoning: `Payment successfully captured via Razorpay live webhook (${payload.event}). INR ${amountRecovered} recovered. (Ref: ${payment?.id ?? subscription?.id ?? "N/A"})`,
      },
    }),
  ]);

  // Dispatch payment success confirmation notifications (Email + WhatsApp)
  if (updatedCase) {
    const finalAmount =
      amountRecovered > 0 ? amountRecovered.toString() : updatedCase.amountAtRisk.toString();

    const receiptTasks: Promise<any>[] = [];

    if (updatedCase.customer.email) {
      receiptTasks.push(
        sendPaymentSuccessEmail({
          to: updatedCase.customer.email,
          customerName: updatedCase.customer.name,
          amountPaid: finalAmount,
          currency: updatedCase.currency,
          caseId: matchedCaseId,
        }).catch((err) => console.warn("[Webhook:SuccessEmail] Warning:", err.message))
      );
    }

    if (updatedCase.customer.phone || updatedCase.customer.email) {
      receiptTasks.push(
        sendPaymentSuccessSms({
          to: updatedCase.customer.phone || updatedCase.customer.email,
          customerName: updatedCase.customer.name,
          customerEmail: updatedCase.customer.email,
          amountPaid: finalAmount,
          currency: updatedCase.currency,
          caseId: matchedCaseId,
          channel: "WHATSAPP",
        }).catch((err) => console.warn("[Webhook:SuccessWhatsApp] Warning:", err.message))
      );
    }

    await Promise.allSettled(receiptTasks);
  }

  // Wake up Inngest waiting workflow immediately
  await inngest.send({
    name: "revenue/case.recovered",
    data: { caseId: matchedCaseId, amountRecovered },
  });

  console.log(`[Webhook] ✅ Case ${matchedCaseId} marked as RECOVERED & confirmation receipts sent — INR ${amountRecovered} recovered`);
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
  const successEvents = [
    "order.paid",
    "payment.captured",
    "payment_link.paid",
    "subscription.charged",
    "subscription.activated",
  ];
  if (successEvents.includes(event)) {
    await handlePaymentSuccess(payload);
    return NextResponse.json({ received: true });
  }

  /* ── 4b. Handle FAILURE events → send Inngest event ── */
  const leakType = mapEventToLeakType(event);

  let sourceRef = "";
  if (payload.payload.subscription) {
    sourceRef = payload.payload.subscription.entity.id;
  } else if (payload.payload.payment) {
    sourceRef = payload.payload.payment.entity.id;
  } else if (payload.payload.order) {
    sourceRef = payload.payload.order.entity.id;
  }

  if (leakType && sourceRef) {
    await inngest.send({
      name: "revenue/leak.detected",
      data: {
        sourceRef,
        leakType,
        rawPayload: payload,
        receivedAt: new Date().toISOString(),
      },
    });
    console.log(`[Webhook] Dispatched revenue/leak.detected Inngest event for ${sourceRef}`);
  } else {
    console.log(`[Webhook] Unmapped event type: ${event} or missing sourceRef`);
  }

  /* Acknowledge immediately — Razorpay expects a 200 within 5 seconds */
  return NextResponse.json({ received: true });
}
