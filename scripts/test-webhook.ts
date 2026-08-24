/**
 * scripts/test-webhook.ts
 *
 * Simulates incoming Razorpay webhooks (payment.failed OR subscription.charged.failed)
 * with a valid HMAC-SHA256 signature.
 * Triggers the live autonomous pipeline: DETECT -> DIAGNOSE -> DECIDE -> ACT -> VERIFY.
 *
 * Usage:
 *   # Standard payment failure (PAYMENT_DEGRADATION)
 *   npx tsx scripts/test-webhook.ts --email kopykatqueryonline@gmail.com --error card_blocked
 *
 *   # Subscription recurring mandate failure (SUBSCRIPTION_FAILURE)
 *   npx tsx scripts/test-webhook.ts --type subscription --email kopykatqueryonline@gmail.com --error upi_mandate_failed
 */

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

async function simulateWebhook() {
  const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"] || "Sanjey@45";
  const args = process.argv.slice(2);

  const typeIndex = args.indexOf("--type");
  const leakTypeArg = typeIndex !== -1 ? args[typeIndex + 1]?.toLowerCase() : "payment";
  const isSubscription = leakTypeArg === "subscription" || leakTypeArg === "subscription_failure";

  const paymentIndex = args.indexOf("--paymentId");
  const paymentId = paymentIndex !== -1 ? args[paymentIndex + 1] : `pay_${Math.random().toString(36).substring(2, 12)}`;

  const subIndex = args.indexOf("--subId");
  const subId = subIndex !== -1 ? args[subIndex + 1] : `sub_${Math.random().toString(36).substring(2, 12)}`;

  const emailIndex = args.indexOf("--email");
  const phoneIndex = args.indexOf("--phone");

  const targetEmail = emailIndex !== -1 ? args[emailIndex + 1] : process.env["TEST_EMAIL"] || "kopykatqueryonline@gmail.com";
  const targetPhone = phoneIndex !== -1 ? args[phoneIndex + 1] : process.env["TEST_PHONE"] || "+919790317406";

  const errorIndex = args.indexOf("--error");
  const errorCode = errorIndex !== -1 ? args[errorIndex + 1] : (isSubscription ? "upi_mandate_failed" : "insufficient_funds");

  let errorDesc = "Payment was declined by the bank due to insufficient funds in customer account.";
  if (errorCode === "card_blocked") {
    errorDesc = "Payment was declined because the card has been permanently blocked by the issuing bank.";
  } else if (errorCode === "upi_mandate_failed" || errorCode === "mandate_decline") {
    errorDesc = "Recurring debit failed: UPI Autopay mandate could not be executed due to customer bank limit or mandate expiry.";
  } else if (errorCode === "card_expired") {
    errorDesc = "Recurring subscription charge failed because the card linked to the recurring mandate has expired.";
  }

  let payload: any;

  if (isSubscription) {
    payload = {
      entity: "event",
      account_id: "acc_mock123",
      event: "subscription.charged.failed",
      contains: ["subscription", "payment"],
      payload: {
        subscription: {
          entity: {
            id: subId,
            plan_id: "plan_pro_monthly_1999",
            customer_id: `cust_${subId.slice(-8)}`,
            status: "halted",
            current_start: Math.floor(Date.now() / 1000) - 86400 * 30,
            current_end: Math.floor(Date.now() / 1000),
            charge_at: Math.floor(Date.now() / 1000),
            current_billing_amount: 199900, // INR 1,999.00
            total_count: 12,
            paid_count: 3,
            remaining_count: 9,
            notes: {
              customer_name: "Sanjey",
              email: targetEmail,
              contact: targetPhone,
            },
          },
        },
        payment: {
          entity: {
            id: paymentId,
            amount: 199900,
            currency: "INR",
            status: "failed",
            subscription_id: subId,
            method: "upi",
            description: "Recurring subscription renewal for Pro Plan",
            email: targetEmail,
            contact: targetPhone,
            notes: {
              customer_name: "Sanjey",
              subscription_id: subId,
            },
            error_code: errorCode,
            error_description: errorDesc,
            error_source: "mandate_service",
            error_step: "recurring_debit",
            error_reason: "mandate_failure",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };
  } else {
    payload = {
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
            email: targetEmail,
            contact: targetPhone,
            notes: {
              customer_name: "Sanjey",
            },
            error_code: errorCode,
            error_description: errorDesc,
            error_source: "bank",
            error_step: "payment_authorization",
            error_reason: "payment_failed",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  const bodyString = JSON.stringify(payload);

  // Compute valid HMAC SHA-256 signature using the configured webhook secret
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(bodyString)
    .digest("hex");

  console.log("\n=======================================================");
  console.log(`⚡ Injecting Simulated Razorpay Webhook: ${payload.event}`);
  console.log(`🏷️ Leak Type: ${isSubscription ? "SUBSCRIPTION_FAILURE" : "PAYMENT_DEGRADATION"}`);
  console.log(`🔑 Reference ID: ${isSubscription ? subId : paymentId}`);
  console.log(`👤 Customer: Sanjey (${targetEmail} | ${targetPhone})`);
  console.log(`⚠️ Reason: ${errorCode} — ${errorDesc}`);
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
      console.log("\n✅ Webhook accepted and dispatched to Inngest pipeline!");
      console.log("👉 Watch your Inngest UI (http://localhost:8288) or terminal: DETECT -> DIAGNOSE -> DECIDE -> ACT");
      console.log("👉 Open http://localhost:3000/cases to see the new case and its live AI timeline.\n");
    } else {
      console.error("\n❌ Webhook failed:", json);
    }
  } catch (err: any) {
    console.error("\n❌ Error connecting to web app. Ensure `npm run dev` is running on http://localhost:3000:", err.message);
  }
}

simulateWebhook().catch(console.error);
