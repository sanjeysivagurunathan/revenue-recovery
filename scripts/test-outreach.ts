/**
 * scripts/test-outreach.ts
 *
 * Standalone test script to verify Email (Resend) and WhatsApp (Twilio Sandbox) connectivity.
 *
 * Usage:
 *   npx tsx scripts/test-outreach.ts --email your_email@domain.com --phone +919876543210
 */

import dotenv from "dotenv";
dotenv.config();

import { sendRecoveryEmail } from "../apps/worker/src/adapters/email.adapter.js";
import { sendSms } from "../apps/worker/src/adapters/sms.adapter.js";

async function runTest() {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  const phoneIndex = args.indexOf("--phone");

  const targetEmail = emailIndex !== -1 ? args[emailIndex + 1] : process.env["TEST_EMAIL"] || "onboarding@resend.dev";
  const targetPhone = phoneIndex !== -1 ? args[phoneIndex + 1] : process.env["TEST_PHONE"];

  console.log("\n=======================================================");
  console.log("🚀 Testing AI Revenue Recovery Outbound Adapters");
  console.log("=======================================================\n");

  // 1. Test Resend Email
  console.log(`📧 [1/2] Testing Resend Email to: ${targetEmail}...`);
  try {
    await sendRecoveryEmail({
      to: targetEmail,
      customerName: "Sanjey",
      amountAtRisk: "2,499.00",
      currency: "INR",
      paymentLink: "https://rzp.io/i/mock_recovery_link",
      caseId: "case_test_email_001",
    });
    console.log("✅ Email sent successfully via Resend!\n");
  } catch (err: any) {
    console.error("❌ Email failed:", err.message, "\n");
    if (err.message.includes("domain is not verified")) {
      console.log("💡 Tip: On the free Resend plan, you can only send emails to the email address registered on your Resend account, or you must verify a domain.\n");
    }
  }

  // 2. Test Twilio WhatsApp Sandbox
  if (targetPhone) {
    console.log(`💬 [2/2] Testing Twilio WhatsApp Sandbox to: ${targetPhone}...`);
    try {
      await sendSms({
        to: targetPhone,
        customerName: "Sanjey",
        amountAtRisk: "2,499.00",
        currency: "INR",
        paymentLink: "https://rzp.io/i/mock_recovery_link",
        caseId: "case_test_whatsapp_001",
        channel: "WHATSAPP",
      });
      console.log("✅ WhatsApp message sent successfully via Twilio Sandbox!\n");
    } catch (err: any) {
      console.error("❌ WhatsApp failed:", err.message, "\n");
      console.log("💡 Tip: Ensure your phone number is connected to the Twilio WhatsApp Sandbox by sending the sandbox join code (e.g. 'join <code>') to +1 415 523 8886 on WhatsApp.\n");
    }
  } else {
    console.log("💬 [2/2] Skipping WhatsApp test (no --phone provided).");
    console.log("👉 Run with: npx tsx scripts/test-outreach.ts --phone +91XXXXXXXXXX\n");
  }

  console.log("=======================================================\n");
}

runTest().catch(console.error);
