/**
 * apps/worker/src/adapters/sms.adapter.ts
 *
 * SMS / WhatsApp channel adapter using Twilio.
 * Falls back to MOCK mode when TWILIO_FROM_NUMBER is not configured —
 * this allows local dev and hackathon demos without spending credits.
 */

import { logger } from "../lib/logger.js";

export interface SmsPayload {
  to: string;
  customerName: string;
  amountAtRisk: string;
  currency: string;
  paymentLink?: string;
  caseId: string;
  channel: "SMS" | "WHATSAPP";
}

/**
 * Fixed message templates per action type.
 * No LLM copy is ever sent to customers — template library only.
 */
function buildMessage(payload: SmsPayload): string {
  const { customerName, currency, amountAtRisk, paymentLink } = payload;
  if (paymentLink) {
    return `Hi ${customerName}, your payment of ${currency} ${amountAtRisk} could not be processed. Complete it here: ${paymentLink}`;
  }
  return `Hi ${customerName}, we noticed an issue with your recent payment of ${currency} ${amountAtRisk}. Please retry or contact support.`;
}

/**
 * Sends an SMS or WhatsApp message via Twilio.
 * If TWILIO_FROM_NUMBER is blank (i.e., dev/mock mode), just logs the message
 * and marks it as delivered — no actual message is sent.
 */
export async function sendSms(payload: SmsPayload): Promise<void> {
  const isWhatsApp = payload.channel === "WHATSAPP";
  const fromNumber = process.env["TWILIO_FROM_NUMBER"];
  const whatsappNumber = process.env["TWILIO_WHATSAPP_NUMBER"] ?? "whatsapp:+14155238886";
  const message = buildMessage(payload);

  // ── MOCK MODE FOR SMS ONLY (when no Twilio SMS number is purchased) ───────
  if (!isWhatsApp && !fromNumber) {
    logger.info(
      { to: payload.to, channel: payload.channel, message, caseId: payload.caseId },
      "[SmsAdapter] 🔇 MOCK MODE (SMS) — message logged (no TWILIO_FROM_NUMBER configured)"
    );
    return;
  }

  // ── LIVE MODE (Twilio credentials present) ────────────────────────────────
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }

  // Lazy-import Twilio to avoid startup errors in mock mode
  const twilio = (await import("twilio")).default;
  const client = twilio(accountSid, authToken);

  const from = payload.channel === "WHATSAPP" ? whatsappNumber : fromNumber!;
  const to = payload.channel === "WHATSAPP" ? `whatsapp:${payload.to}` : payload.to;
  const contentSid = process.env["TWILIO_WHATSAPP_CONTENT_SID"];

  const createParams: any = { from, to, body: message };

  await client.messages.create(createParams);
  logger.info({ to: payload.to, channel: payload.channel, caseId: payload.caseId }, "[SmsAdapter] Message sent via Twilio");
}
