/**
 * apps/web/src/inngest/adapters/razorpay.ts
 *
 * Razorpay channel adapter — handles retry orders and hosted payment links.
 */

import Razorpay from "razorpay";

function getRazorpayClient(): Razorpay {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export interface RazorpayRetryPayload {
  caseId: string;
  attemptNumber: number;
  amountPaise: number;
  currency: string;
  customerEmail: string;
  customerPhone: string | null;
  sourceRef: string;
}

export async function retryPayment(payload: RazorpayRetryPayload): Promise<string> {
  const rzp = getRazorpayClient();
  const receipt = `rcv_${payload.caseId.slice(-10)}_${payload.attemptNumber}`;

  const order = await rzp.orders.create({
    amount: payload.amountPaise,
    currency: payload.currency,
    receipt,
    notes: {
      source_ref: payload.sourceRef,
      case_id: payload.caseId,
      recovery_attempt: String(payload.attemptNumber),
    },
  });

  console.log(`[RazorpayAdapter] Payment retry order created: ${order.id}`);
  return order.id as string;
}

export interface PaymentLinkPayload {
  caseId: string;
  amountPaise: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  description: string;
}

export async function createPaymentLink(payload: PaymentLinkPayload): Promise<string> {
  const rzp = getRazorpayClient();

  const link = await (rzp.paymentLink as any).create({
    amount: payload.amountPaise,
    currency: payload.currency,
    description: payload.description,
    customer: {
      name: payload.customerName,
      email: payload.customerEmail,
      contact: payload.customerPhone ?? "",
    },
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: { case_id: payload.caseId },
    expire_by: Math.floor(Date.now() / 1000) + 60 * 60 * 48, // 48h expiry
  });

  const shortUrl = (link as any).short_url as string;
  console.log(`[RazorpayAdapter] Payment link created: ${shortUrl} for case ${payload.caseId}`);
  return shortUrl;
}
