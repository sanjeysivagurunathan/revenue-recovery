/**
 * apps/web/src/app/api/webhooks/razorpay/route.ts
 *
 * Razorpay webhook endpoint (§10).
 *
 * Security: Every request is HMAC-SHA256 signature verified against the
 * RAZORPAY_WEBHOOK_SECRET before any processing occurs. Unsigned requests
 * are immediately rejected with 401.
 *
 * ⚠️  STUB — signature verification wired; job enqueue in Module 2.
 */

import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDetectQueue } from "@/lib/queues";
import { type RazorpayWebhookPayload, LeakType } from "@revenue-recovery/types";

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
  // For checkout abandonment, we'd poll or use order events.
  // We'll capture all relevant events, and let the Detect worker filter out unknown ones.
  return null;
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

  /* ── 4. Enqueue detect job based on event type ── */
  const leakType = mapEventToLeakType(event);
  
  // Extract sourceRef based on event payload
  let sourceRef = "";
  if (payload.payload.payment) {
    sourceRef = payload.payload.payment.entity.id;
  } else if (payload.payload.subscription) {
    sourceRef = payload.payload.subscription.entity.id;
  } else if (payload.payload.order) {
    sourceRef = payload.payload.order.entity.id;
  }

  // Push to BullMQ detect queue for the worker to normalize
  if (leakType && sourceRef) {
    await getDetectQueue().add("webhook", {
      sourceRef,
      leakType,
      rawPayload: payload,
      receivedAt: new Date().toISOString(),
    });
    console.log(`[Webhook] Enqueued case:detect job for ${sourceRef}`);
  } else {
    // If we don't handle this event, just log it but don't queue
    console.log(`[Webhook] Unmapped event type: ${event} or missing sourceRef`);
  }

  /* Acknowledge immediately — Razorpay expects a 200 within 5 seconds */
  return NextResponse.json({ received: true });
}
