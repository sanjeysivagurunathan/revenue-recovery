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
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload["event"] as string | undefined;
  console.log("[Webhook] Razorpay event received:", event);

  /* ── 4. TODO: Module 2 — enqueue detect job based on event type ── */
  // switch (event) {
  //   case "payment.failed": ...
  //   case "subscription.charged": ...
  // }

  /* Acknowledge immediately — Razorpay expects a 200 within 5 seconds */
  return NextResponse.json({ received: true });
}
