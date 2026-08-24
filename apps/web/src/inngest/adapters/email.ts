/**
 * apps/web/src/inngest/adapters/email.ts
 *
 * Resend email channel adapter with demo override for hackathons.
 */

import { Resend } from "resend";

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
  paymentLink?: string;
  caseId: string;
}

export async function sendRecoveryEmail(payload: EmailPayload): Promise<void> {
  const { to, customerName, amountAtRisk, currency, paymentLink, caseId } = payload;

  const subject = paymentLink
    ? `Action Required: Complete your payment of ${currency} ${amountAtRisk}`
    : `Payment reminder for your recent transaction`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #111827; margin-top: 0; font-size: 20px;">Hello ${customerName},</h2>
      <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
        We noticed an issue with your recent payment of <strong>${currency} ${amountAtRisk}</strong>.
      </p>
      ${
        paymentLink
          ? `
          <div style="margin: 28px 0;">
            <a href="${paymentLink}" 
               style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Complete Payment &rarr;
            </a>
          </div>
          <p style="color: #6b7280; font-size: 13px; word-break: break-all;">
            Direct payment link: <a href="${paymentLink}" style="color: #2563eb;">${paymentLink}</a>
          </p>`
          : `<p style="color: #4b5563;">Please try your payment again through your checkout or contact support.</p>`
      }
      <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 28px 0;" />
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">Case Reference: ${caseId}</p>
    </div>
  `;

  const resend = getResendClient();
  const from = process.env["RESEND_FROM_EMAIL"] ?? "onboarding@resend.dev";
  const actualTo = process.env["TEST_EMAIL"] || "sanjudote45@gmail.com";

  const { error } = await resend.emails.send({
    from,
    to: actualTo,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend email failed: ${error.message}`);
  }

  console.log(`[EmailAdapter] Recovery email sent for case ${caseId} to ${actualTo}`);
}
