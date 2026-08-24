/**
 * apps/worker/src/adapters/email.adapter.ts
 *
 * Email channel adapter using the Resend API.
 * Sends pre-defined templates — no LLM-generated copy is sent to customers.
 */

import { Resend } from "resend";
import { logger } from "../lib/logger.js";

function getResendClient(): Resend {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured in your .env file.");
  }
  return new Resend(apiKey);
}

export interface EmailPayload {
  to: string;
  customerName: string;
  amountAtRisk: string;
  currency: string;
  paymentLink?: string | undefined;
  caseId: string;
}

/**
 * Sends a payment failure reminder email with an optional payment link.
 * Uses a fixed template — prevents the agent from inventing outbound copy.
 */
export async function sendRecoveryEmail(payload: EmailPayload): Promise<void> {
  const { to, customerName, amountAtRisk, currency, paymentLink, caseId } = payload;

  const subject = paymentLink
    ? `Action Required: Complete your payment of ${currency} ${amountAtRisk}`
    : `Payment reminder for your recent transaction`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a1a1a;">Hello ${customerName},</h2>
      <p>We noticed an issue with your recent payment of <strong>${currency} ${amountAtRisk}</strong>.</p>
      ${paymentLink
      ? `<p>To complete your payment, please click the button below:</p>
         <a href="${paymentLink}" 
            style="display:inline-block;background:#2563EB;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">
           Complete Payment
         </a>
         <p style="color:#666;font-size:14px;">Or copy this link: ${paymentLink}</p>`
      : `<p>Please try your payment again through the original checkout or contact our support team.</p>`
    }
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="color:#999;font-size:12px;">Case Reference: ${caseId}</p>
    </div>
  `;

  const resend = getResendClient();
  const from = process.env["RESEND_FROM_EMAIL"] ?? "onboarding@resend.dev";
  
  // ── HACKATHON DEMO OVERRIDE ──
  // Resend free tier only allows sending to the registered account email.
  // We override the destination here so you can test live delivery for all cases 
  // without needing to verify a custom domain, but the dashboard UI will still show the fake emails!
  const actualTo = process.env["TEST_EMAIL"] || "sanjudote45@gmail.com";

  const { error } = await resend.emails.send({ 
    from, 
    to: actualTo, 
    subject, 
    html 
  });

  if (error) {
    throw new Error(`Resend email failed: ${error.message}`);
  }

  logger.info({ originalTo: to, actualTo, caseId }, "[EmailAdapter] Recovery email sent");
}
