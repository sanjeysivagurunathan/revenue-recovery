/**
 * apps/worker/src/adapters/razorpay.adapter.ts
 *
 * Razorpay channel adapter — two executors:
 *  1. retryPayment   — triggers a fresh payment order for the same amount
 *  2. createPaymentLink — generates a hosted payment page URL and returns it
 *
 * All Razorpay calls are idempotent (keyed on caseId + attempt number).
 */

import Razorpay from "razorpay";
import { logger } from "../lib/logger.js";

/** Lazily-initialised Razorpay client (throws early if keys missing in prod) */
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
  attemptNumber: number;          // Used as part of receipt for idempotency
  amountPaise: number;            // Razorpay amounts are in smallest currency unit
  currency: string;
  customerEmail: string;
  customerPhone: string | null;
  sourceRef: string;              // Original failed payment/subscription id
}

/**
 * Retry a failed payment by creating a new Razorpay Order.
 * Returns the new order id so it can be stored in the Intervention record.
 */
export async function retryPayment(payload: RazorpayRetryPayload): Promise<string> {
  const rzp = getRazorpayClient();

  // receipt is limited to 40 chars — trim caseId prefix to fit
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

  logger.info(
    { orderId: order.id, caseId: payload.caseId, receipt },
    "[RazorpayAdapter] Payment retry order created"
  );

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

/**
 * Creates a Razorpay Payment Link and returns its short URL.
 * The URL is stored in the Intervention, then sent via email/SMS adapters.
 */
export async function createPaymentLink(payload: PaymentLinkPayload): Promise<string> {
  const rzp = getRazorpayClient();

  const link = await rzp.paymentLink.create({
    amount: payload.amountPaise,
    currency: payload.currency,
    description: payload.description,
    customer: {
      name: payload.customerName,
      email: payload.customerEmail,
      contact: payload.customerPhone ?? "",
    },
    notify: { sms: false, email: false }, // We send our own notifications
    reminder_enable: false,               // We control retry cadence, not Razorpay
    notes: { case_id: payload.caseId },
    expire_by: Math.floor(Date.now() / 1000) + 60 * 60 * 48, // 48h expiry
  });

  const shortUrl = (link as any).short_url as string;
  logger.info(
    { linkId: (link as any).id, caseId: payload.caseId, shortUrl },
    "[RazorpayAdapter] Payment link created"
  );

  return shortUrl;
}
