/**
 * scripts/test-payment-success.ts
 * 
 * Simulates a Razorpay payment_link.paid webhook to test the RECOVERED flow.
 * Pass --caseId to specify which case to mark recovered.
 * 
 * Usage:
 *   npx tsx scripts/test-payment-success.ts --caseId <caseId>
 */

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

async function simulatePaymentSuccess() {
  const args = process.argv.slice(2);
  const caseIndex = args.indexOf("--caseId");
  const caseId = (caseIndex !== -1 && args[caseIndex + 1]) ? args[caseIndex + 1]! : null;

  if (!caseId) {
    console.error("❌ Usage: npx tsx scripts/test-payment-success.ts --caseId <caseId>");
    process.exit(1);
  }

  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"] || "Sanjey@45";
  const paymentId = `pay_recovered_${Math.random().toString(36).substring(2, 10)}`;

  const payload = {
    entity: "event",
    account_id: "acc_mock123",
    event: "payment_link.paid",
    contains: ["payment_link", "payment"],
    payload: {
      payment_link: {
        entity: {
          id: `plink_${Math.random().toString(36).substring(2, 10)}`,
          description: `Recovery for failed payment (case ${caseId})`,
          amount: 499900,
          currency: "INR",
          status: "paid",
        },
      },
      payment: {
        entity: {
          id: paymentId,
          amount: 499900,
          currency: "INR",
          status: "captured",
          order_id: `order_${Math.random().toString(36).substring(2, 10)}`,
          email: "test@example.com",
          contact: "+919790317406",
          description: `Recovery for failed payment (case ${caseId})`,
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };

  const body = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");

  console.log("\n=======================================================");
  console.log("✅ Simulating Razorpay: payment_link.paid");
  console.log(`📋 Case ID: ${caseId}`);
  console.log(`💳 Payment ID: ${paymentId}`);
  console.log("=======================================================\n");

  const res = await fetch("http://localhost:3000/api/webhooks/razorpay", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": sig,
    },
    body,
  });

  const json = await res.json();
  console.log(`HTTP Status: ${res.status}`);
  console.log("Response:", json);

  if (res.ok) {
    console.log("\n✅ Success webhook sent! Check your dashboard — case should now show RECOVERED 🎉");
  } else {
    console.error("\n❌ Webhook failed:", json);
  }
}

simulatePaymentSuccess().catch(console.error);
