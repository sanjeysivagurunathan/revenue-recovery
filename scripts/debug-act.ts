/**
 * scripts/debug-act.ts
 * Debug the ACT stage for a stuck intervention
 */
import dotenv from "dotenv";
dotenv.config({ path: "apps/worker/.env" });

const args = process.argv.slice(2);
const caseIdIndex = args.indexOf("--caseId");
const caseId = caseIdIndex !== -1 ? args[caseIdIndex + 1] : "cmt2v593m0002utjm824xijf6";

async function run() {
  const { prisma } = await import("@revenue-recovery/db");

  const revenueCase = await prisma.revenueCase.findUnique({
    where: { id: caseId },
    include: { customer: true },
  });

  if (!revenueCase) {
    console.error("Case not found:", caseId);
    process.exit(1);
  }

  console.log("Case:", revenueCase.id, "status:", revenueCase.status);
  console.log("Customer:", revenueCase.customer.name, revenueCase.customer.phone);

  console.log("\n--- Testing Razorpay Payment Link ---");
  try {
    const Razorpay = (await import("razorpay")).default;
    const rzp = new Razorpay({
      key_id: process.env["RAZORPAY_KEY_ID"]!,
      key_secret: process.env["RAZORPAY_KEY_SECRET"]!,
    });

    const link = await (rzp.paymentLink as any).create({
      amount: Math.round(Number(revenueCase.amountAtRisk) * 100),
      currency: revenueCase.currency,
      description: `Payment reminder (case ${caseId})`,
      customer: {
        name: revenueCase.customer.name,
        email: revenueCase.customer.email,
        contact: revenueCase.customer.phone ?? "",
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { case_id: caseId },
      expire_by: Math.floor(Date.now() / 1000) + 60 * 60 * 48,
    });
    console.log("✅ Payment link created:", (link as any).short_url);

    console.log("\n--- Testing Twilio WhatsApp ---");
    try {
      const twilio = (await import("twilio")).default;
      const client = twilio(
        process.env["TWILIO_ACCOUNT_SID"]!,
        process.env["TWILIO_AUTH_TOKEN"]!
      );
      const msg = await client.messages.create({
        from: process.env["TWILIO_WHATSAPP_NUMBER"]!,
        to: `whatsapp:${revenueCase.customer.phone}`,
        body: `Hi ${revenueCase.customer.name}, your payment of ${revenueCase.currency} ${revenueCase.amountAtRisk} could not be processed. Complete it here: ${(link as any).short_url}`,
      });
      console.log("✅ WhatsApp sent! SID:", msg.sid, "Status:", msg.status);
    } catch (err: any) {
      console.error("❌ Twilio error:", err.message);
      console.error("   Code:", err.code, "| Status:", err.status);
    }
  } catch (err: any) {
    console.error("❌ Razorpay error:", err.message);
    if (err.error) console.error("   Details:", JSON.stringify(err.error, null, 2));
  }

  await prisma.$disconnect();
}

run().catch(console.error);
