/**
 * seed/synthetic-cases.ts
 *
 * Seeder to populate the database with realistic recovery cases.
 * Generates customers, recovery policies, and synthetic cases.
 */

import { prisma, LeakType, CaseStatus, InterventionChannel } from "@revenue-recovery/db";

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
    prisma.recoveryPolicy.create({
      data: {
        name: "Subscription Hard Churn Prevention",
        leakType: LeakType.SUBSCRIPTION_FAILURE,
        maxAttempts: 4,
        cooldownHours: 48,
        allowedChannels: [InterventionChannel.PAYMENT_RETRY, InterventionChannel.EMAIL, InterventionChannel.SMS],
        quietHoursStart: 21,
        quietHoursEnd: 8,
      },
    }),
    prisma.recoveryPolicy.create({
      data: {
        name: "B2B Receivables Chasing Policy",
        leakType: LeakType.OVERDUE_RECEIVABLES,
        maxAttempts: 5,
        cooldownHours: 72,
        allowedChannels: [InterventionChannel.EMAIL, InterventionChannel.SMS, InterventionChannel.HUMAN_HANDOFF],
        quietHoursStart: 18,
        quietHoursEnd: 9,
      },
    }),
  ]);
  console.log(`✅ Created ${policies.length} recovery policies`);

  // ── 3. Create Customers & Cases ──
  const customerCount = 25;
  console.log(`👥 Seeding ${customerCount} customers and cases...`);

  const leakTypes = Object.values(LeakType);
  const statuses = [
    CaseStatus.DETECTED,
    CaseStatus.DIAGNOSED,
    CaseStatus.INTERVENING,
    CaseStatus.RECOVERED,
    CaseStatus.FAILED,
    CaseStatus.STOPPED,
    CaseStatus.ESCALATED,
  ];

  const firstNames = ["Rahul", "Priya", "Amit", "Sneha", "Vikram", "Anjali", "Rohan", "Meera", "Karan", "Tanvi"];
  const lastNames = ["Sharma", "Verma", "Patel", "Mehta", "Iyer", "Nair", "Reddy", "Gupta", "Joshi", "Das"];

  for (let i = 0; i < customerCount; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    const name = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
    const phone = `+919900000${100 + i}`;

    const customer = await prisma.customer.create({
      data: {
        externalId: `cust_${Math.random().toString(36).substring(2, 9)}`,
        name,
        email,
        phone,
        riskScore: parseFloat((Math.random() * 0.8).toFixed(2)),
      },
    });

    const leakType = leakTypes[i % leakTypes.length];
    const policy = policies.find((p) => p.leakType === leakType)!;

    // Pick status: distribute them realistically
    // Most should be recovered, detected, or intervening for active demonstration
    let status = CaseStatus.DETECTED;
    if (i < 5) status = CaseStatus.RECOVERED;
    else if (i < 10) status = CaseStatus.INTERVENING;
    else if (i < 13) status = CaseStatus.ESCALATED; // For Approvals queue
    else if (i < 15) status = CaseStatus.STOPPED;
    else if (i < 17) status = CaseStatus.FAILED;
    else if (i < 20) status = CaseStatus.DIAGNOSED;

    // Create case with some variance in amountAtRisk
    // Make sure a few are high value (> 50,000 paise / INR 500) to test approval
    const amountAtRisk = status === CaseStatus.ESCALATED ? 75000 : Math.floor(Math.random() * 15000) + 1000;

    const sourceRef = `${leakType === LeakType.SUBSCRIPTION_FAILURE ? "sub" : "pay"}_${Math.random()
      .toString(36)
      .substring(2, 12)}`;

    const rc = await prisma.revenueCase.create({
      data: {
        customerId: customer.id,
        leakType,
        status,
        amountAtRisk,
        currency: "INR",
        amountRecovered: status === CaseStatus.RECOVERED ? amountAtRisk : 0,
        sourceRef,
        policyId: policy.id,
        attemptsUsed: status === CaseStatus.RECOVERED || status === CaseStatus.FAILED ? policy.maxAttempts : 0,
        maxAttempts: policy.maxAttempts,
        rootCause: status !== CaseStatus.DETECTED ? "insufficient_funds" : null,
        diagnosisPayload: status !== CaseStatus.DETECTED ? {
          root_cause: "insufficient_funds",
          confidence: 0.95,
          recommended_urgency: "high",
          reasoning: "The payment failed due to insufficient funds in the customer's account.",
        } : null,
      },
    });

    // ── Create Events/Interventions for active cases ──
    if (status !== CaseStatus.DETECTED) {
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
                  amount: amountAtRisk * 100,
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
    }

    if (status === CaseStatus.RECOVERED) {
      await prisma.intervention.create({
        data: {
          caseId: rc.id,
          channel: InterventionChannel.PAYMENT_RETRY,
          action: "retry_payment",
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
          reasoning: `Payment captured: ₹${amountAtRisk}. Case recovered successfully.`,
        },
      });
    } else if (status === CaseStatus.ESCALATED) {
      await prisma.auditEntry.create({
        data: {
          caseId: rc.id,
          actor: "system:act-worker",
          action: "execution",
          fromStatus: CaseStatus.DIAGNOSED,
          toStatus: CaseStatus.ESCALATED,
          reasoning: `Amount at risk (${amountAtRisk}) exceeds the high-value threshold. Human approval required before first outbound action.`,
        },
      });
    }
  }

  console.log("🌱 Database seeded successfully!");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
