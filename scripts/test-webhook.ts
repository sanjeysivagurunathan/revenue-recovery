/**
 * scripts/test-webhook.ts
 *
 * Simulates an incoming Razorpay webhook (payment.failed) with valid HMAC signature.
 * Triggers the entire live pipeline: DETECT -> DIAGNOSE -> DECIDE -> ACT -> VERIFY.
 *
 * Usage:
 *   npx tsx scripts/test-webhook.ts
 */

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

async function simulateWebhook() {
  const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"] || "Sanjey@45";
  const paymentId = `pay_${Math.random().toString(36).substring(2, 12)}`;

  const payload = {
    entity: "event",
    account_id: "acc_mock123",
    event: "payment.failed",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount: 499900, // INR 4,999.00
          currency: "INR",
          status: "failed",
          order_id: `order_${Math.random().toString(36).substring(2, 10)}`,
          invoice_id: null,
          international: false,
          method: "upi",
          amount_refunded: 0,
          refund_status: null,
          captured: false,
          description: "Payment for Order #1042",
          card_id: null,
          bank: null,
          wallet: null,
          vpa: "sanjey@okhdfcbank",
          email: process.env["TEST_EMAIL"] || "sanjudote45@gmail.com",
          contact: process.env["TEST_PHONE"] || "+919790317406",
          notes: {
            customer_name: "Sanjey",
          },
          error_code: "BAD_REQUEST_PAYMENT_DECLINED_INSUFFICIENT_FUNDS",
          error_description: "Payment was declined by the bank due to insufficient funds in customer account.",
          error_source: "bank",
          error_step: "payment_authorization",
          error_reason: "payment_failed",
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };

  const bodyString = JSON.stringify(payload);

  // Compute valid HMAC SHA-256 signature using the configured webhook secret
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(bodyString)
    .digest("hex");

  console.log("\n=======================================================");
  console.log("⚡ Injecting Simulated Razorpay Webhook: payment.failed");
  console.log(`💳 Payment ID: ${paymentId}`);
  console.log(`👤 Customer: ${payload.payload.payment.entity.notes.customer_name} (${payload.payload.payment.entity.email})`);
  console.log("=======================================================\n");

  const webhookUrl = "http://localhost:3000/api/webhooks/razorpay";
  console.log(`POSTing to ${webhookUrl}...`);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
      },
      body: bodyString,
    });

    const json = await res.json();
    console.log(`HTTP Status: ${res.status}`);
    console.log("Response:", json);

    if (res.ok && (json.received || json.success)) {
      console.log("\n✅ Webhook accepted and queued!");
      console.log("👉 Watch your worker terminal: DETECT -> DIAGNOSE -> DECIDE -> ACT will execute automatically!");
      console.log("👉 Open http://localhost:3000/cases to see the new case and its live AI timeline.\n");
    } else {
      console.error("\n❌ Webhook failed:", json);
    }
  } catch (err: any) {
    console.error("\n❌ Error connecting to web app. Ensure `npm run dev` is running on http://localhost:3000:", err.message);
  }
}

simulateWebhook().catch(console.error);
