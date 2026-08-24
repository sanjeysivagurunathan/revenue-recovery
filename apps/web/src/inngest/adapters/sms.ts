/**
 * apps/web/src/inngest/adapters/sms.ts
 *
 * Twilio SMS / WhatsApp channel adapter with template variables and email fallback.
 */

import { sendRecoveryEmail } from "./email";

export interface SmsPayload {
  to: string;
  customerName: string;
  customerEmail?: string;
  amountAtRisk: string;
  currency: string;
  paymentLink?: string;
  caseId: string;
  channel: "SMS" | "WHATSAPP";
}

function buildMessage(payload: SmsPayload): string {
  const { customerName, currency, amountAtRisk, paymentLink } = payload;
  if (paymentLink) {
    return `Hi ${customerName}, your payment of ${currency} ${amountAtRisk} could not be processed. Complete it here: ${paymentLink}`;
  }
  return `Hi ${customerName}, we noticed an issue with your recent payment of ${currency} ${amountAtRisk}. Please retry or contact support.`;
}

export async function sendSms(payload: SmsPayload): Promise<void> {
  const isWhatsApp = payload.channel === "WHATSAPP";
  const fromNumber = process.env["TWILIO_FROM_NUMBER"];
  const whatsappNumber = process.env["TWILIO_WHATSAPP_NUMBER"] ?? "whatsapp:+14155238886";
  const message = buildMessage(payload);

  // MOCK MODE for SMS only if no number purchased
  if (!isWhatsApp && !fromNumber) {
    console.log(`[SmsAdapter] 🔇 MOCK MODE (SMS) — ${payload.to}: ${message}`);
    return;
  }

  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }

  const twilio = (await import("twilio")).default;
  const client = twilio(accountSid, authToken);

  const from = payload.channel === "WHATSAPP" ? whatsappNumber : fromNumber!;
  const to = payload.channel === "WHATSAPP" ? `whatsapp:${payload.to}` : payload.to;
  const contentSid = process.env["TWILIO_WHATSAPP_CONTENT_SID"];

  try {
    const createParams: any = { from, to };

    if (payload.channel === "WHATSAPP" && contentSid) {
      createParams.contentSid = contentSid;
      createParams.contentVariables = JSON.stringify({
        "1": `${payload.currency} ${payload.amountAtRisk}`,
        "2": payload.paymentLink || "https://dashboard.razorpay.com",
      });
    } else {
      createParams.body = message;
    }

    await client.messages.create(createParams);
    console.log(`[SmsAdapter] WhatsApp message sent via Twilio to ${payload.to}`);
  } catch (err: any) {
    console.warn(`[SmsAdapter] ⚠️ WhatsApp send failed (${err.message}) — falling back to email`);
    await sendRecoveryEmail({
      to: payload.customerEmail || payload.to,
      customerName: payload.customerName,
      amountAtRisk: payload.amountAtRisk,
      currency: payload.currency,
      paymentLink: payload.paymentLink,
      caseId: payload.caseId,
    });
    console.log(`[SmsAdapter] ✅ Email fallback sent for case ${payload.caseId}`);
  }
}

export interface PaymentSuccessSmsPayload {
  to: string;
  customerName: string;
  customerEmail?: string;
  amountPaid: string;
  currency: string;
  caseId: string;
  channel?: "SMS" | "WHATSAPP";
}

export async function sendPaymentSuccessSms(payload: PaymentSuccessSmsPayload): Promise<void> {
  const isWhatsApp = (payload.channel ?? "WHATSAPP") === "WHATSAPP";
  const fromNumber = process.env["TWILIO_FROM_NUMBER"];
  const whatsappNumber = process.env["TWILIO_WHATSAPP_NUMBER"] ?? "whatsapp:+14155238886";
  const message = `✅ Payment Received! Hello ${payload.customerName}, we received your payment of ${payload.currency} ${payload.amountPaid}. Your account is now active and in good standing. Thank you! (Ref: ${payload.caseId})`;

  if (!isWhatsApp && !fromNumber) {
    console.log(`[SmsAdapter] 🔇 MOCK MODE (SMS) — ${payload.to}: ${message}`);
    return;
  }

  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];

  if (!accountSid || !authToken) {
    return;
  }

  const twilio = (await import("twilio")).default;
  const client = twilio(accountSid, authToken);

  const from = isWhatsApp ? whatsappNumber : fromNumber!;
  const to = isWhatsApp ? `whatsapp:${payload.to}` : payload.to;
  const contentSid = process.env["TWILIO_WHATSAPP_CONTENT_SID"];

  try {
    const createParams: any = { from, to };

    if (isWhatsApp && contentSid) {
      createParams.contentSid = contentSid;
      createParams.contentVariables = JSON.stringify({
        "1": `Paid: ${payload.currency} ${payload.amountPaid}`,
        "2": "https://dashboard.razorpay.com",
      });
    } else {
      createParams.body = message;
    }

    await client.messages.create(createParams);
    console.log(`[SmsAdapter] ✅ Payment success WhatsApp receipt sent via Twilio to ${payload.to}`);
  } catch (err: any) {
    console.warn(`[SmsAdapter] ⚠️ Payment success WhatsApp notice warning: ${err.message}`);
  }
}
