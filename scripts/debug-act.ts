import dotenv from "dotenv";
dotenv.config();

import { prisma } from "@revenue-recovery/db";
import Razorpay from "razorpay";
import twilio from "twilio";

const args = process.argv.slice(2);
const caseIdIndex = args.indexOf("--caseId");
const caseId = caseIdIndex !== -1 ? args[caseIdIndex + 1] : undefined;

async function run() {
  const targetCase = caseId
    ? await prisma.revenueCase.findUnique({
        where: { id: caseId },
        include: { customer: true },
      })
    : await prisma.revenueCase.findFirst({
        orderBy: { detectedAt: "desc" },
        include: { customer: true },
      });

  if (!targetCase) {
    console.error("No case found in database.");
    process.exit(1);
  }

  console.log("Case:", targetCase.id, "status:", targetCase.status);
  console.log("Customer:", targetCase.customer?.name, targetCase.customer?.phone);

  console.log("\n--- Testing Razorpay Payment Link ---");
  try {
    const rzp = new Razorpay({
      key_id: process.env["RAZORPAY_KEY_ID"] ?? "",
      key_secret: process.env["RAZORPAY_KEY_SECRET"] ?? "",
    });

    const link = await (rzp.paymentLink as any).create({
      amount: Math.round(Number(targetCase.amountAtRisk) * 100),
      currency: targetCase.currency,
      description: `Payment reminder (case ${targetCase.id})`,
      customer: {
        name: targetCase.customer?.name ?? "Customer",
        email: targetCase.customer?.email ?? "test@example.com",
        contact: targetCase.customer?.phone ?? "",
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { case_id: targetCase.id },
      expire_by: Math.floor(Date.now() / 1000) + 60 * 60 * 48,
    });
    console.log("✅ Payment link created:", (link as any).short_url);

    if (targetCase.customer?.phone) {
      console.log("\n--- Testing Twilio WhatsApp ---");
      try {
        const client = twilio(
          process.env["TWILIO_ACCOUNT_SID"],
          process.env["TWILIO_AUTH_TOKEN"]
        );
        const msg = await client.messages.create({
          from: process.env["TWILIO_WHATSAPP_NUMBER"] ?? "whatsapp:+14155238886",
          to: `whatsapp:${targetCase.customer.phone}`,
          body: `Hi ${targetCase.customer.name}, your payment of ${targetCase.currency} ${targetCase.amountAtRisk} could not be processed. Complete it here: ${(link as any).short_url}`,
        });
        console.log("✅ WhatsApp sent! SID:", msg.sid, "Status:", msg.status);
      } catch (err: any) {
        console.error("❌ Twilio error:", err.message);
      }
    }
  } catch (err: any) {
    console.error("❌ Razorpay error:", err.message);
  }

  await prisma.$disconnect();
}

run().catch(console.error);
