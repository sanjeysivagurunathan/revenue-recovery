/**
 * scripts/test-outreach.ts
 *
 * Standalone test script to verify Email (Resend) and WhatsApp (Twilio) connectivity
 * with a REAL, live Razorpay Test Payment Link!
 *
 * Usage:
 *   npx tsx scripts/test-outreach.ts --email your_email@domain.com --phone +919876543210
 */

import dotenv from "dotenv";
dotenv.config();

import { sendRecoveryEmail } from "../apps/web/src/inngest/adapters/email";
import { sendSms } from "../apps/web/src/inngest/adapters/sms";
import { createPaymentLink } from "../apps/web/src/inngest/adapters/razorpay";

async function runTest() {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  const phoneIndex = args.indexOf("--phone");

  const targetEmail = (emailIndex !== -1 && args[emailIndex + 1]) ? args[emailIndex + 1]! : process.env["TEST_EMAIL"] || "sanjudote45@gmail.com";
  const targetPhone = (phoneIndex !== -1 && args[phoneIndex + 1]) ? args[phoneIndex + 1]! : process.env["TEST_PHONE"] || "+919790317406";

  console.log("\n=======================================================");
  console.log("🚀 Testing AI Revenue Recovery Outbound Adapters");
  console.log("=======================================================\n");

  // Generate a real live Razorpay test payment link
  let paymentLink = "https://rzp.io/i/mock_recovery_link";
  try {
    console.log("💳 Creating real Razorpay Test Payment Link...");
    paymentLink = await createPaymentLink({
      caseId: `case_demo_${Date.now()}`,
      amountPaise: 249900, // INR 2,499.00
      currency: "INR",
      customerName: "Sanjey",
      customerEmail: targetEmail,
      customerPhone: targetPhone || null,
      description: "Recovery Payment for Order #1042",
    });
    console.log(`🔗 Live Razorpay Payment URL: ${paymentLink}\n`);
  } catch (err: any) {
    console.warn(`⚠️ Could not create live Razorpay link: ${err.message}. Using fallback.\n`);
  }

  // 1. Test Resend Email
  console.log(`📧 [1/2] Testing Resend Email to: ${targetEmail}...`);
  try {
    await sendRecoveryEmail({
      to: targetEmail,
      customerName: "Sanjey",
      amountAtRisk: "2,499.00",
      currency: "INR",
      paymentLink,
      caseId: "case_test_email_001",
    });
    console.log("✅ Email sent successfully via Resend!\n");
  } catch (err: any) {
    console.error("❌ Email failed:", err.message, "\n");
    if (err.message.includes("domain is not verified")) {
      console.log("💡 Tip: On the free Resend plan, you can only send emails to the email address registered on your Resend account, or you must verify a domain.\n");
    }
  }

  // 2. Test Twilio WhatsApp
  if (targetPhone) {
    console.log(`💬 [2/2] Testing Twilio WhatsApp to: ${targetPhone}...`);
    try {
      await sendSms({
        to: targetPhone,
        customerName: "Sanjey",
        amountAtRisk: "2,499.00",
        currency: "INR",
        paymentLink,
        caseId: "case_test_whatsapp_001",
        channel: "WHATSAPP",
      });
      console.log("✅ WhatsApp message sent successfully via Twilio!\n");
    } catch (err: any) {
      console.error("❌ WhatsApp failed:", err.message, "\n");
    }
  } else {
    console.log("💬 [2/2] Skipping WhatsApp test (no --phone provided).");
    console.log("👉 Run with: npx tsx scripts/test-outreach.ts --phone +91XXXXXXXXXX\n");
  }

  console.log("=======================================================\n");
}

runTest().catch(console.error);
