/**
 * seed/synthetic-cases.ts
 *
 * Minimal seeder to populate the database with exactly one realistic recovery case per status.
 * Perfect for a clean hackathon demo presentation.
 *
 * Usage:
 *   npx tsx seed/synthetic-cases.ts
 */

import { prisma, Prisma, LeakType, CaseStatus, InterventionChannel } from "@revenue-recovery/db";

async function main() {
  console.log("🌱 Seeding database...");

  // ── 1. Clear database ──
  await prisma.auditEntry.deleteMany({});
  await prisma.intervention.deleteMany({});
  await prisma.caseEvent.deleteMany({});
  await prisma.revenueCase.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.recoveryPolicy.deleteMany({});
  console.log("🧹 Cleared existing database records");

  // ── 2. Create Recovery Policies ──
  const policies = await Promise.all([
    prisma.recoveryPolicy.create({
      data: {
        name: "Standard Payment Degradation Guardrails",
        leakType: LeakType.PAYMENT_DEGRADATION,
        maxAttempts: 3,
        cooldownHours: 24,
        allowedChannels: [InterventionChannel.PAYMENT_RETRY, InterventionChannel.EMAIL],
        quietHoursStart: 22,
        quietHoursEnd: 8,
      },
    }),
    prisma.recoveryPolicy.create({
      data: {
        name: "Checkout Drop-off Recovery",
        leakType: LeakType.CHECKOUT_ABANDONMENT,
        maxAttempts: 2,
        cooldownHours: 12,
        allowedChannels: [InterventionChannel.EMAIL, InterventionChannel.SMS, InterventionChannel.WHATSAPP],
        quietHoursStart: 20,
        quietHoursEnd: 9,
      },
    }),
  ]);
  console.log(`✅ Created ${policies.length} recovery policies`);

  // ── 3. Define the minimal presentation cases (One of each type) ──
  const caseDefinitions = [
    { name: "Kunal", email: "sanjeyingames@gmail.com", status: CaseStatus.DETECTED, amount: 2500, type: LeakType.PAYMENT_DEGRADATION },
    { name: "Arjun R", email: "sanjeyinlinkedin@gmail.com", status: CaseStatus.DIAGNOSED, amount: 4999, type: LeakType.CHECKOUT_ABANDONMENT },
    { name: "Priya Menon", email: "sanjeyincareers@gmail.com", status: CaseStatus.INTERVENING, amount: 15000, type: LeakType.PAYMENT_DEGRADATION },
    { name: "Karan Johar", email: "sanjudote45@gmail.com", status: CaseStatus.ESCALATED, amount: 75000, type: LeakType.PAYMENT_DEGRADATION },
    { name: "Devakan N", email: "sanboy444666@gmail.com", status: CaseStatus.RECOVERED, amount: 3500, type: LeakType.CHECKOUT_ABANDONMENT },
    { name: "Rahul S", email: "sanjeyinutube@gmail.com", status: CaseStatus.FAILED, amount: 12000, type: LeakType.PAYMENT_DEGRADATION },
    { name: "Krish E", email: "tamilpoeticvibes@gmail.com", status: CaseStatus.STOPPED, amount: 6000, type: LeakType.CHECKOUT_ABANDONMENT }
  ];

  console.log(`👥 Seeding ${caseDefinitions.length} presentation cases...`);

  for (let i = 0; i < caseDefinitions.length; i++) {
    const { name, email, status, amount, type } = caseDefinitions[i];
    const phone = `+919900000${100 + i}`;

    const customer = await prisma.customer.create({
      data: {
        externalId: `cust_${Math.random().toString(36).substring(2, 9)}`,
        name,
        email,
        phone,
        riskScore: 0.15,
      },
    });

    const policy = policies.find((p) => p.leakType === type) ?? policies[0];
    const sourceRef = `pay_${Math.random().toString(36).substring(2, 12)}`;
    const hasDiagnosis = status !== CaseStatus.DETECTED;

    const rc = await prisma.revenueCase.create({
      data: {
        customerId: customer.id,
        leakType: type,
        status,
        amountAtRisk: amount,
        currency: "INR",
        amountRecovered: status === CaseStatus.RECOVERED ? amount : 0,
        sourceRef,
        policyId: policy.id,
        attemptsUsed: (status === CaseStatus.RECOVERED || status === CaseStatus.FAILED) ? policy.maxAttempts : 0,
        maxAttempts: policy.maxAttempts,
        rootCause: hasDiagnosis ? "insufficient_funds" : null,
        diagnosisPayload: hasDiagnosis
          ? {
              root_cause: "insufficient_funds",
              confidence: 0.95,
              recommended_urgency: "high",
              reasoning: "The payment failed due to insufficient funds in the customer's account.",
            }
          : Prisma.JsonNull,
        resolvedAt: (status === CaseStatus.RECOVERED || status === CaseStatus.FAILED) ? new Date() : null,
      },
    });

    // ── Create Events & Audit Entries ──
    if (hasDiagnosis) {
      await prisma.caseEvent.create({
        data: {
          caseId: rc.id,
          type: "webhook.payment.failed",
          payload: {
            event: "payment.failed",
            payload: {
              payment: {
                entity: {
                  id: sourceRef,
                  amount: amount * 100,
                  currency: "INR",
                  error_code: "BAD_REQUEST_PAYMENT_DECLINED_INSUFFICIENT_FUNDS",
                  error_description: "Insufficient funds in account",
                },
              },
            },
          },
        },
      });

      await prisma.auditEntry.create({
        data: {
          caseId: rc.id,
          actor: "system:webhook",
          action: "state_transition",
          fromStatus: null,
          toStatus: CaseStatus.DETECTED,
          reasoning: "New leak detected via Razorpay webhook (payment.failed)",
        },
      });

      await prisma.auditEntry.create({
        data: {
          caseId: rc.id,
          actor: "system:diagnose-worker",
          action: "diagnosis",
          fromStatus: CaseStatus.DETECTED,
          toStatus: CaseStatus.DIAGNOSED,
          reasoning: "Groq gpt-oss-120b classified root cause as 'insufficient_funds' with 95% confidence.",
        },
      });
    }

    if (status === CaseStatus.RECOVERED) {
      await prisma.intervention.create({
        data: {
          caseId: rc.id,
          channel: InterventionChannel.WHATSAPP,
          action: "send_payment_link",
          status: "EXECUTED",
          outcome: "delivered",
          costUnits: 0.05,
        },
      });
      await prisma.auditEntry.create({
        data: {
          caseId: rc.id,
          actor: "system:verify-worker",
          action: "state_transition",
          fromStatus: CaseStatus.INTERVENING,
          toStatus: CaseStatus.RECOVERED,
          reasoning: `Payment captured: ₹${amount}. Case recovered successfully.`,
        },
      });
    } else if (status === CaseStatus.ESCALATED) {
      await prisma.caseEvent.create({
        data: {
          caseId: rc.id,
          type: "guardrail.high_value_threshold",
          payload: { amountAtRisk: amount, threshold: 50000 },
        },
      });
      await prisma.auditEntry.create({
        data: {
          caseId: rc.id,
          actor: "system:act-worker",
          action: "execution",
          fromStatus: CaseStatus.DIAGNOSED,
          toStatus: CaseStatus.ESCALATED,
          reasoning: `Amount at risk (₹${amount}) exceeds the high-value threshold (₹50,000). Human approval required before first outbound action.`,
        },
      });
    } else if (status === CaseStatus.STOPPED) {
      await prisma.auditEntry.create({
        data: {
          caseId: rc.id,
          actor: "system:guardrails",
          action: "state_transition",
          fromStatus: CaseStatus.INTERVENING,
          toStatus: CaseStatus.STOPPED,
          reasoning: "Case halted: customer requested opt-out from marketing communications.",
        },
      });
    } else if (status === CaseStatus.FAILED) {
      await prisma.auditEntry.create({
        data: {
          caseId: rc.id,
          actor: "system:verify-worker",
          action: "state_transition",
          fromStatus: CaseStatus.INTERVENING,
          toStatus: CaseStatus.FAILED,
          reasoning: `Max attempts (${policy.maxAttempts}) exhausted with no payment captured. Case failed.`,
        },
      });
    }
  }

  console.log(`✅ Seeded ${caseDefinitions.length} presentation cases`);
  console.log("🌱 Database seeded successfully!");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
