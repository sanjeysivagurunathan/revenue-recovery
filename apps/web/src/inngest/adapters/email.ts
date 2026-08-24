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
  const actualTo = process.env["TEST_EMAIL"] || to || "sanjudote45@gmail.com";

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

export interface PaymentSuccessEmailPayload {
  to: string;
  customerName: string;
  amountPaid: string;
  currency: string;
  caseId: string;
}

export async function sendPaymentSuccessEmail(payload: PaymentSuccessEmailPayload): Promise<void> {
  const { to, customerName, amountPaid, currency, caseId } = payload;

  const subject = `✅ Payment Receipt: ${currency} ${amountPaid} received successfully`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
      <div style="display: inline-block; background: #ecfdf5; color: #059669; padding: 6px 12px; border-radius: 9999px; font-weight: 600; font-size: 13px; margin-bottom: 16px;">
        ✓ Payment Confirmed
      </div>
      <h2 style="color: #111827; margin-top: 0; font-size: 22px;">Payment Successful!</h2>
      <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
        Hello ${customerName}, we have successfully received and processed your payment of <strong>${currency} ${amountPaid}</strong>.
      </p>
      
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="color: #6b7280; padding: 6px 0;">Amount Paid:</td>
            <td style="color: #111827; font-weight: 600; text-align: right; padding: 6px 0;">${currency} ${amountPaid}</td>
          </tr>
          <tr>
            <td style="color: #6b7280; padding: 6px 0;">Status:</td>
            <td style="color: #059669; font-weight: 600; text-align: right; padding: 6px 0;">PAID & SETTLED</td>
          </tr>
          <tr>
            <td style="color: #6b7280; padding: 6px 0;">Case Reference:</td>
            <td style="color: #111827; font-family: monospace; font-size: 12px; text-align: right; padding: 6px 0;">${caseId}</td>
          </tr>
        </table>
      </div>

      <p style="color: #4b5563; font-size: 14px;">
        Your account and services are now fully active and in good standing. Thank you for your payment!
      </p>
      <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 28px 0;" />
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">Autonomous Revenue Recovery Agent</p>
    </div>
  `;

  const resend = getResendClient();
  const from = process.env["RESEND_FROM_EMAIL"] ?? "onboarding@resend.dev";
  const actualTo = process.env["TEST_EMAIL"] || to || "sanjudote45@gmail.com";

  const { error } = await resend.emails.send({
    from,
    to: actualTo,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend payment success email failed: ${error.message}`);
  }

  console.log(`[EmailAdapter] ✅ Payment receipt email sent for case ${caseId} to ${actualTo}`);
}
