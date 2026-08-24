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
  const isCheckout = leakTypeArg === "checkout" || leakTypeArg === "checkout_abandonment";
  const isInvoice = leakTypeArg === "invoice" || leakTypeArg === "receivable" || leakTypeArg === "receivable_overdue";

  const paymentIndex = args.indexOf("--paymentId");
  const paymentId = paymentIndex !== -1 ? args[paymentIndex + 1] : `pay_${Math.random().toString(36).substring(2, 12)}`;

  const subIndex = args.indexOf("--subId");
  const subId = subIndex !== -1 ? args[subIndex + 1] : `sub_${Math.random().toString(36).substring(2, 12)}`;

  const invIndex = args.indexOf("--invId");
  const invId = invIndex !== -1 ? args[invIndex + 1] : `inv_${Math.random().toString(36).substring(2, 12)}`;

  const orderId = `order_${Math.random().toString(36).substring(2, 12)}`;

  const emailIndex = args.indexOf("--email");
  const phoneIndex = args.indexOf("--phone");

  const targetEmail = emailIndex !== -1 ? args[emailIndex + 1] : process.env["TEST_EMAIL"] || "kopykatqueryonline@gmail.com";
  const targetPhone = phoneIndex !== -1 ? args[phoneIndex + 1] : process.env["TEST_PHONE"] || "+919790317406";

  const amountIndex = args.indexOf("--amount");
  const defaultAmount = isInvoice ? 1500000 : 299900; // Default ₹15,000 for B2B invoice, ₹2,999 for B2C
  const amountPaise = amountIndex !== -1 ? parseInt(args[amountIndex + 1]) * 100 : defaultAmount;

  const errorIndex = args.indexOf("--error");
  const errorCode = errorIndex !== -1 ? args[errorIndex + 1] : (
    isSubscription ? "upi_mandate_failed" : isCheckout ? "cart_price_shock" : isInvoice ? "invoice_dispute" : "insufficient_funds"
  );

  let errorDesc = "Payment was declined by the bank due to insufficient funds in customer account.";
  if (errorCode === "card_blocked") {
    errorDesc = "Payment was declined because the card has been permanently blocked by the issuing bank.";
  } else if (errorCode === "upi_mandate_failed" || errorCode === "mandate_decline") {
    errorDesc = "Recurring debit failed: UPI Autopay mandate could not be executed due to customer bank limit or mandate expiry.";
  } else if (errorCode === "card_expired") {
    errorDesc = "Recurring subscription charge failed because the card linked to the recurring mandate has expired.";
  } else if (errorCode === "cart_price_shock") {
    errorDesc = "Customer reached checkout but abandoned after seeing the final cart total (price too high).";
  } else if (errorCode === "shipping_cost_surprise") {
    errorDesc = "Customer abandoned cart after unexpected shipping fee was added at checkout.";
  } else if (errorCode === "payment_method_missing") {
    errorDesc = "Customer attempted checkout but had no saved payment method (card/UPI) available.";
  } else if (errorCode === "invoice_dispute") {
    errorDesc = "B2B client has raised a billing dispute regarding deliverables and requested revised invoice.";
  } else if (errorCode === "overdue_net30" || errorCode === "insufficient_funds") {
    errorDesc = "B2B Net-30 invoice is past due; corporate accounts payable team requests delayed settlement terms.";
  }

  let payload: any;

  if (isCheckout) {
    // Simulate an order.abandoned event — customer initiated checkout but never paid
    // We inject directly via the Inngest API rather than the webhook (no Razorpay signature needed for orders)
    const abandonedAtSec = Math.floor(Date.now() / 1000) - 20 * 60; // 20 minutes ago
    payload = {
      entity: "event",
      account_id: "acc_mock123",
      event: "order.abandoned",
      contains: ["order"],
      payload: {
        order: {
          entity: {
            id: orderId,
            entity: "order",
            amount: amountPaise,
            amount_paid: 0,
            amount_due: amountPaise,
            currency: "INR",
            receipt: `rcpt_${orderId.slice(-8)}`,
            offer_id: null,
            status: "created",
            attempts: 0,
            notes: {
              customer_name: "Sanjey",
              email: targetEmail,
              phone: targetPhone,
              cart_items: "2x Product A, 1x Product B",
              abandonment_reason: errorCode,
            },
            created_at: abandonedAtSec,
          },
        },
      },
      created_at: abandonedAtSec,
      // Pass extra fields for pipeline extraction
      email: targetEmail,
      name: "Sanjey",
      phone: targetPhone,
    };
  } else if (isSubscription) {
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
  } else if (isInvoice) {
    const invNumber = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
    payload = {
      entity: "event",
      account_id: "acc_mock123",
      event: "invoice.past_due",
      contains: ["invoice"],
      payload: {
        invoice: {
          entity: {
            id: invId,
            entity: "invoice",
            invoice_number: invNumber,
            customer_id: `cust_${invId.slice(-8)}`,
            customer_details: {
              name: "Acme Corp (Attn: Sanjey)",
              email: targetEmail,
              contact: targetPhone,
            },
            order_id: `order_${Math.random().toString(36).substring(2, 10)}`,
            amount: amountPaise,
            amount_paid: 0,
            amount_due: amountPaise,
            currency: "INR",
            status: "past_due",
            type: "invoice",
            date: Math.floor(Date.now() / 1000) - 86400 * 30, // Issued 30 days ago
            due_date: Math.floor(Date.now() / 1000) - 86400 * 5, // Due 5 days ago
            notes: {
              customer_name: "Acme Corp (Attn: Sanjey)",
              email: targetEmail,
              phone: targetPhone,
              project: "Enterprise SaaS License Q3",
              dispute_reason: errorCode,
            },
            created_at: Math.floor(Date.now() / 1000) - 86400 * 30,
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
      email: targetEmail,
      name: "Acme Corp (Attn: Sanjey)",
      phone: targetPhone,
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
  const leakTypeLabel = isCheckout
    ? "CHECKOUT_ABANDONMENT"
    : isInvoice
    ? "RECEIVABLE_OVERDUE"
    : isSubscription
    ? "SUBSCRIPTION_FAILURE"
    : "PAYMENT_DEGRADATION";
  const refId = isCheckout ? orderId : isInvoice ? invId : isSubscription ? subId : paymentId;

  // For CHECKOUT_ABANDONMENT: bypass the webhook (no signature needed) and inject directly into Inngest
  if (isCheckout) {
    console.log("\n=======================================================");
    console.log(`🛒 Injecting Simulated Checkout Abandonment: ${payload.event}`);
    console.log(`🏷️ Leak Type: ${leakTypeLabel}`);
    console.log(`🔑 Order ID: ${refId}`);
    console.log(`👤 Customer: Sanjey (${targetEmail} | ${targetPhone})`);
    console.log(`💰 Cart Value Abandoned: INR ${(amountPaise / 100).toFixed(2)}`);
    console.log(`⚠️ Abandonment Reason: ${errorCode} — ${errorDesc}`);
    console.log("=======================================================\n");

    // Directly fire abandonment via the Next.js API route (uses inngest.send internally)
    try {
      const inngestPayload = {
        email: targetEmail,
        name: "Sanjey",
        phone: targetPhone,
        sourceRef: orderId,
        amountPaise,
        currency: "INR",
        abandonmentReason: errorCode,
        cartItems: "2x Product A, 1x Product B",
      };

      const res = await fetch("http://localhost:3000/api/test-abandonment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inngestPayload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        console.log("✅ Checkout abandonment event dispatched to Inngest pipeline!");
        console.log("👉 Watch your Inngest UI (http://localhost:8288) or terminal: DETECT -> DIAGNOSE -> DECIDE -> ACT");
        console.log("👉 Open http://localhost:3000/cases to see the new CHECKOUT_ABANDONMENT case.\n");
      } else {
        console.error("❌ Abandonment dispatch failed:", json);
      }
    } catch (err: any) {
      console.error("\n❌ Error connecting to web app:", err.message);
      console.log("💡 Ensure: npm run dev is running on http://localhost:3000");
    }
    return;
  }

  // Compute valid HMAC SHA-256 signature using the configured webhook secret
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(bodyString)
    .digest("hex");

  console.log("\n=======================================================");
  console.log(`⚡ Injecting Simulated Razorpay Webhook: ${payload.event}`);
  console.log(`🏷️ Leak Type: ${leakTypeLabel}`);
  console.log(`🔑 Reference ID: ${refId}`);
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
