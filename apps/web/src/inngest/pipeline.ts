/**
 * apps/web/src/inngest/pipeline.ts
 *
 * Full multi-stage autonomous Revenue Recovery Agent pipeline as an Inngest durable function.
 *
 * Flow:
 *  Step 1: detect-and-record     — Ingests webhook, deduplicates, creates Customer + RevenueCase + Audit
 *  Step 2: diagnose-root-cause   — Pure LLM diagnosis (Groq / Claude) with structured schema
 *  Step 3: decide-recovery-action — Pure LLM decision selecting optimal action & channel
 *  Step 4: execute-action        — Deterministic execution with guardrails, Razorpay & outreach
 *  Step 5: wait-for-payment      — Durable wait for customer payment (or retry cadence timeout)
 *  Step 6: follow-up / escalate  — Retries outreach if unpaid or stops/escalates
 */

import { inngest } from "./client";
import { prisma, CaseStatus, InterventionChannel, InterventionStatus, LeakType } from "@revenue-recovery/db";
import { generateDiagnosis, generateDecision } from "./adapters/llm";
import { runGuardrails } from "./adapters/guardrails";
import { sendRecoveryEmail } from "./adapters/email";
import { sendSms } from "./adapters/sms";
import { retryPayment, createPaymentLink } from "./adapters/razorpay";

const TERMINAL_STATUSES: CaseStatus[] = [
  CaseStatus.ESCALATED,
  CaseStatus.STOPPED,
  CaseStatus.RECOVERED,
  CaseStatus.FAILED,
];

export const recoveryPipelineFunction = inngest.createFunction(
  {
    id: "revenue-recovery-pipeline",
    name: "Autonomous Revenue Recovery Pipeline",
    triggers: [{ event: "revenue/leak.detected" }],
  },
  async ({ event, step }: any) => {
    const { sourceRef, leakType, rawPayload, receivedAt } = event.data as {
      sourceRef: string;
      leakType: LeakType | string;
      rawPayload: any;
      receivedAt: string;
    };

    /* ── STEP 1: DETECT & RECORD ────────────────────────────────────────── */
    const detectResult = await step.run("detect-and-record", async () => {
      console.log(`[Inngest:DETECT] Processing leak event for ${sourceRef}`);

      const paymentEntity = rawPayload.payload?.payment?.entity;
      const orderEntity = rawPayload.payload?.order?.entity;
      const subEntity = rawPayload.payload?.subscription?.entity;

      const customerEmail =
        paymentEntity?.email ||
        subEntity?.notes?.email ||
        subEntity?.customer_email ||
        rawPayload.email ||
        "subscriber@example.com";

      const customerPhone =
        paymentEntity?.contact ||
        subEntity?.notes?.contact ||
        subEntity?.notes?.phone ||
        subEntity?.customer_contact ||
        rawPayload.phone ||
        null;

      const customerName =
        subEntity?.notes?.customer_name ||
        subEntity?.notes?.name ||
        paymentEntity?.notes?.customer_name ||
        paymentEntity?.notes?.name ||
        customerEmail.split("@")[0];

      const amountPaise =
        paymentEntity?.amount ||
        orderEntity?.amount ||
        subEntity?.current_billing_amount ||
        (subEntity?.plan?.item?.amount ? subEntity.plan.item.amount : 0) ||
        199900;

      const amountAtRisk = amountPaise / 100;
      const currency = paymentEntity?.currency || subEntity?.currency || "INR";

      // 1. Find or create Customer
      let customer = await prisma.customer.findFirst({
        where: { email: customerEmail },
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            externalId: `cust_${sourceRef.slice(-8)}`,
            email: customerEmail,
            phone: customerPhone,
            name: customerName,
            timezone: "Asia/Kolkata",
            riskScore: 0.0,
          },
        });
      }

      // 2. Idempotency check: see if case already exists for this sourceRef
      const existingCase = await prisma.revenueCase.findFirst({
        where: { sourceRef },
      });

      if (existingCase) {
        console.log(`[Inngest:DETECT] Existing case found: ${existingCase.id}`);

        await prisma.caseEvent.create({
          data: {
            caseId: existingCase.id,
            type: rawPayload.event ?? "webhook.duplicate",
            payload: rawPayload,
            occurredAt: new Date(receivedAt),
          },
        });

        if (existingCase.status !== CaseStatus.DETECTED) {
          return { caseId: existingCase.id, isNew: false, shouldProceed: false };
        }

        return { caseId: existingCase.id, isNew: false, shouldProceed: true };
      }

      // 3. Create new RevenueCase
      const newCase = await prisma.revenueCase.create({
        data: {
          customerId: customer.id,
          leakType: leakType as LeakType,
          status: CaseStatus.DETECTED,
          amountAtRisk,
          currency,
          sourceRef,
          maxAttempts: 3,
          attemptsUsed: 0,
          detectedAt: new Date(receivedAt),
          events: {
            create: {
              type: rawPayload.event ?? "webhook.payment.failed",
              payload: rawPayload,
              occurredAt: new Date(receivedAt),
            },
          },
          auditEntries: {
            create: {
              actor: "system:inngest-detect",
              action: "state_transition",
              toStatus: CaseStatus.DETECTED,
              reasoning: `New leak detected via Razorpay webhook (${rawPayload.event ?? "payment.failed"})`,
              metadata: { sourceRef, leakType, amountAtRisk, currency },
            },
          },
        },
      });

      console.log(`[Inngest:DETECT] Created new case: ${newCase.id}`);
      return { caseId: newCase.id, isNew: true, shouldProceed: true };
    });

    if (!detectResult.shouldProceed) {
      return { status: "skipped_existing_case", caseId: detectResult.caseId };
    }

    const { caseId } = detectResult;

    /* ── STEP 2: DIAGNOSE ROOT CAUSE ───────────────────────────────────── */
    const diagnosis = await step.run("diagnose-root-cause", async () => {
      console.log(`[Inngest:DIAGNOSE] Diagnosing case ${caseId}`);

      const revenueCase = await prisma.revenueCase.findUnique({
        where: { id: caseId },
        include: { customer: true, events: true },
      });

      if (!revenueCase) throw new Error(`Case ${caseId} not found`);

      const prompt = `
You are diagnosing a failed payment or recurring subscription renewal. Be concise — max 1 sentence for reasoning.

Amount: ${revenueCase.amountAtRisk.toString()} ${revenueCase.currency}
Leak Type: ${revenueCase.leakType}

Webhook error & subscription details:
${JSON.stringify(
  revenueCase.events.map((e) => {
    const p = (e.payload as any)?.payload?.payment?.entity;
    const s = (e.payload as any)?.payload?.subscription?.entity;
    return {
      event_type: e.type,
      ...(p
        ? {
            error_code: p.error_code,
            error_description: p.error_description,
            error_reason: p.error_reason,
            error_step: p.error_step,
          }
        : {}),
      ...(s
        ? {
            subscription_id: s.id,
            subscription_status: s.status,
            plan_id: s.plan_id,
            charge_at: s.charge_at,
          }
        : {}),
    };
  }),
  null,
  2
)}

Identify the root cause from allowed enum values (e.g. upi_mandate_failed, insufficient_funds, card_expired, bank_decline_soft, unknown). Keep reasoning to 1 short sentence. Provide confidence and recommended urgency.
`;

      const diagOutput = await generateDiagnosis(prompt);

      await prisma.revenueCase.update({
        where: { id: caseId },
        data: {
          status: CaseStatus.DIAGNOSED,
          rootCause: diagOutput.root_cause,
          diagnosisPayload: diagOutput as any,
        },
      });

      await prisma.auditEntry.create({
        data: {
          caseId,
          actor: "agent:ai-diagnosis",
          action: "diagnosis",
          fromStatus: CaseStatus.DETECTED,
          toStatus: CaseStatus.DIAGNOSED,
          reasoning: diagOutput.reasoning,
          metadata: {
            confidence: diagOutput.confidence,
            recommended_urgency: diagOutput.recommended_urgency,
          },
        },
      });

      return diagOutput;
    });

    /* ── STEP 3: DECIDE RECOVERY ACTION ────────────────────────────────── */
    const decision = await step.run("decide-recovery-action", async () => {
      console.log(`[Inngest:DECIDE] Deciding recovery action for case ${caseId}`);

      const revenueCase = await prisma.revenueCase.findUnique({
        where: { id: caseId },
        include: { customer: true },
      });

      if (!revenueCase) throw new Error(`Case ${caseId} not found`);

      const allowedActions = [
        "retry_payment",
        "send_payment_link",
        "send_reminder",
        "offer_promise_to_pay",
        "escalate_human",
      ];
      const allowedChannels = [
        "EMAIL",
        "SMS",
        "WHATSAPP",
        "PAYMENT_RETRY",
        "HUMAN_HANDOFF",
      ];

      const prompt = `
Decide the best recovery action for a failed payment or recurring subscription. Be concise — max 1 sentence for reasoning.

Amount: ${revenueCase.amountAtRisk.toString()} ${revenueCase.currency}
Leak Type: ${revenueCase.leakType}
Previous Attempts: ${revenueCase.attemptsUsed} / ${revenueCase.maxAttempts}
Root Cause: ${revenueCase.rootCause}
Urgency: ${diagnosis.recommended_urgency}

Constraints (no exceptions):
- Allowed Actions: ${allowedActions.join(", ")}
- Allowed Channels: ${allowedChannels.join(", ")}
- If attempts >= max attempts, MUST choose "escalate_human" + "HUMAN_HANDOFF".
- If reasoning mentions "permanently blocked" or "card blocked", MUST NOT choose "retry_payment" — choose "send_reminder" via "WHATSAPP" or "EMAIL".
- If leakType is "SUBSCRIPTION_FAILURE" and root_cause is "upi_mandate_failed" or "card_expired", choose "send_reminder" via "WHATSAPP" or "EMAIL" so the subscriber can update their mandate or clear renewal dues with the payment link.
- If root_cause is "insufficient_funds" and attempts < max, prefer "retry_payment" or "send_reminder" via "WHATSAPP".
- Otherwise first contact: prefer "send_reminder" via "WHATSAPP" if phone available, else "EMAIL".

Respond with action, channel, and 1 short sentence reasoning.
`;

      const decOutput = await generateDecision(prompt);

      const intervention = await prisma.intervention.create({
        data: {
          caseId,
          channel: decOutput.channel as InterventionChannel,
          action: decOutput.action,
        },
      });

      await prisma.revenueCase.update({
        where: { id: caseId },
        data: { status: CaseStatus.INTERVENING },
      });

      await prisma.auditEntry.create({
        data: {
          caseId,
          actor: "agent:ai-decision",
          action: "decision",
          fromStatus: CaseStatus.DIAGNOSED,
          toStatus: CaseStatus.INTERVENING,
          reasoning: decOutput.reasoning,
          metadata: {
            action: decOutput.action,
            channel: decOutput.channel,
            interventionId: intervention.id,
          },
        },
      });

      return { ...decOutput, interventionId: intervention.id };
    });

    /* ── STEP 4: EXECUTE ACTION ────────────────────────────────────────── */
    const execution = await step.run("execute-action", async () => {
      console.log(`[Inngest:ACT] Executing action for case ${caseId}`);

      const [revenueCase, intervention] = await Promise.all([
        prisma.revenueCase.findUnique({
          where: { id: caseId },
          include: { customer: true, events: true },
        }),
        prisma.intervention.findUnique({ where: { id: decision.interventionId } }),
      ]);

      if (!revenueCase || !intervention) {
        throw new Error(`Case or Intervention not found (caseId=${caseId})`);
      }

      // Guardrails check
      const verdict = runGuardrails(revenueCase);
      let actionToExecute = intervention.action;
      let overrideReason: string | null = null;

      if (!verdict.allowed) {
        console.warn(`[Inngest:ACT] Guardrail override triggered: ${verdict.override}`);
        actionToExecute = verdict.override;
        overrideReason = verdict.reason;
      }

      let metadata: Record<string, unknown> = {};
      let newStatus: CaseStatus = CaseStatus.INTERVENING;
      let shouldIncrementAttempts = false;

      switch (actionToExecute) {
        case "retry_payment": {
          const orderId = await retryPayment({
            caseId,
            attemptNumber: revenueCase.attemptsUsed,
            amountPaise: Math.round(Number(revenueCase.amountAtRisk) * 100),
            currency: revenueCase.currency,
            customerEmail: revenueCase.customer.email,
            customerPhone: revenueCase.customer.phone,
            sourceRef: revenueCase.sourceRef,
          });
          metadata = { razorpay_order_id: orderId };
          shouldIncrementAttempts = true;
          break;
        }

        case "send_payment_link":
        case "send_reminder": {
          const itemDescription =
            revenueCase.leakType === LeakType.SUBSCRIPTION_FAILURE
              ? `Subscription renewal dues (case ${caseId})`
              : `Payment reminder (case ${caseId})`;

          const shortUrl = await createPaymentLink({
            caseId,
            amountPaise: Math.round(Number(revenueCase.amountAtRisk) * 100),
            currency: revenueCase.currency,
            customerName: revenueCase.customer.name,
            customerEmail: revenueCase.customer.email,
            customerPhone: revenueCase.customer.phone,
            description: itemDescription,
          });

          // Concurrently dispatch BOTH Email AND WhatsApp by default
          const outreachTasks: Promise<any>[] = [];

          if (revenueCase.customer.email) {
            outreachTasks.push(
              sendRecoveryEmail({
                to: revenueCase.customer.email,
                customerName: revenueCase.customer.name,
                amountAtRisk: revenueCase.amountAtRisk.toString(),
                currency: revenueCase.currency,
                paymentLink: shortUrl,
                caseId,
              }).catch((err) => console.warn("[Outreach:Email] Warning:", err.message))
            );
          }

          if (revenueCase.customer.phone || revenueCase.customer.email) {
            outreachTasks.push(
              sendSms({
                to: revenueCase.customer.phone || revenueCase.customer.email,
                customerName: revenueCase.customer.name,
                customerEmail: revenueCase.customer.email,
                amountAtRisk: revenueCase.amountAtRisk.toString(),
                currency: revenueCase.currency,
                paymentLink: shortUrl,
                caseId,
                channel: "WHATSAPP",
              }).catch((err) => console.warn("[Outreach:WhatsApp] Warning:", err.message))
            );
          }

          await Promise.all(outreachTasks);

          metadata = {
            channels_used: ["EMAIL", "WHATSAPP"],
            payment_link_url: shortUrl,
          };
          shouldIncrementAttempts = true;
          break;
        }

        case "escalate_human": {
          newStatus = CaseStatus.ESCALATED;
          metadata = { override_reason: overrideReason };
          break;
        }

        case "stop": {
          newStatus = CaseStatus.STOPPED;
          metadata = { override_reason: overrideReason };
          break;
        }

        default:
          newStatus = CaseStatus.STOPPED;
      }

      await prisma.$transaction([
        prisma.intervention.update({
          where: { id: decision.interventionId },
          data: {
            status: InterventionStatus.EXECUTED,
            executedAt: new Date(),
            metadata: metadata as any,
          },
        }),
        prisma.revenueCase.update({
          where: { id: caseId },
          data: {
            status: newStatus,
            ...(shouldIncrementAttempts ? { attemptsUsed: { increment: 1 } } : {}),
          },
        }),
        prisma.auditEntry.create({
          data: {
            caseId,
            actor: "system:inngest-act",
            action: "execution",
            fromStatus: CaseStatus.INTERVENING,
            toStatus: newStatus,
            reasoning: overrideReason ?? `Executed recovery outreach via EMAIL & WHATSAPP with live payment link`,
            metadata: { action: actionToExecute, ...metadata } as any,
          },
        }),
      ]);

      return { actionToExecute, newStatus, metadata };
    });

    /* ── STEP 5: WAIT FOR PAYMENT OR RETRY CADENCE ─────────────────────── */
    while (true) {
      // 1. Check if case is already terminal
      const currentCheck = await prisma.revenueCase.findUnique({ where: { id: caseId } });
      if (!currentCheck || TERMINAL_STATUSES.includes(currentCheck.status as CaseStatus)) {
        break;
      }

      // 2. Wait for incoming payment event (or timeout after dunning cadence, e.g. 1h)
      const paymentEvent = await step.waitForEvent("wait-for-customer-payment", {
        event: "revenue/case.recovered",
        timeout: "1h",
        if: `async.data.caseId == "${caseId}"`,
      });

      if (paymentEvent) {
        // Customer paid! Complete the workflow immediately
        await step.run("payment-confirmed-complete", async () => {
          console.log(`[Inngest:SUCCESS] Case ${caseId} payment confirmed via event!`);
          return { status: "RECOVERED", recoveredAt: new Date().toISOString() };
        });
        break;
      }

      // 3. Customer did NOT pay during timeout window — verify and send next attempt if allowed
      const retryResult = await step.run("verify-and-followup", async () => {
        const caseRecord = await prisma.revenueCase.findUnique({
          where: { id: caseId },
          include: { customer: true, events: true },
        });

        if (!caseRecord || TERMINAL_STATUSES.includes(caseRecord.status as CaseStatus)) {
          return { shouldStop: true };
        }

        // If attempts exhausted -> escalate to human review
        if (caseRecord.attemptsUsed >= caseRecord.maxAttempts) {
          await prisma.$transaction([
            prisma.revenueCase.update({
              where: { id: caseId },
              data: { status: CaseStatus.ESCALATED },
            }),
            prisma.auditEntry.create({
              data: {
                caseId,
                actor: "system:inngest-verify",
                action: "state_transition",
                fromStatus: CaseStatus.INTERVENING,
                toStatus: CaseStatus.ESCALATED,
                reasoning: `Max attempts (${caseRecord.maxAttempts}) reached without payment. Escalated to human review.`,
              },
            }),
          ]);
          return { shouldStop: true, escalated: true };
        }

        return { shouldStop: false, attemptNumber: caseRecord.attemptsUsed + 1 };
      });

      if (retryResult.shouldStop) {
        break;
      }

      // 4. Send follow-up reminder via BOTH Email & WhatsApp
      await step.run(`send-followup-attempt-${retryResult.attemptNumber}`, async () => {
        const caseRecord = await prisma.revenueCase.findUnique({
          where: { id: caseId },
          include: { customer: true },
        });
        if (!caseRecord) return;

        const followupDesc =
          caseRecord.leakType === LeakType.SUBSCRIPTION_FAILURE
            ? `Subscription renewal attempt ${retryResult.attemptNumber} (case ${caseId})`
            : `Payment reminder attempt ${retryResult.attemptNumber} (case ${caseId})`;

        const shortUrl = await createPaymentLink({
          caseId,
          amountPaise: Math.round(Number(caseRecord.amountAtRisk) * 100),
          currency: caseRecord.currency,
          customerName: caseRecord.customer.name,
          customerEmail: caseRecord.customer.email,
          customerPhone: caseRecord.customer.phone,
          description: followupDesc,
        });

        const followupTasks: Promise<any>[] = [];

        if (caseRecord.customer.email) {
          followupTasks.push(
            sendRecoveryEmail({
              to: caseRecord.customer.email,
              customerName: caseRecord.customer.name,
              amountAtRisk: caseRecord.amountAtRisk.toString(),
              currency: caseRecord.currency,
              paymentLink: shortUrl,
              caseId,
            }).catch((err) => console.warn("[Followup:Email] Warning:", err.message))
          );
        }

        if (caseRecord.customer.phone || caseRecord.customer.email) {
          followupTasks.push(
            sendSms({
              to: caseRecord.customer.phone || caseRecord.customer.email,
              customerName: caseRecord.customer.name,
              customerEmail: caseRecord.customer.email,
              amountAtRisk: caseRecord.amountAtRisk.toString(),
              currency: caseRecord.currency,
              paymentLink: shortUrl,
              caseId,
              channel: "WHATSAPP",
            }).catch((err) => console.warn("[Followup:WhatsApp] Warning:", err.message))
          );
        }

        await Promise.all(followupTasks);

        await prisma.$transaction([
          prisma.revenueCase.update({
            where: { id: caseId },
            data: { attemptsUsed: { increment: 1 } },
          }),
          prisma.auditEntry.create({
            data: {
              caseId,
              actor: "system:inngest-followup",
              action: "execution",
              reasoning: `Follow-up reminder sent via EMAIL & WHATSAPP (Attempt ${retryResult.attemptNumber}/${caseRecord.maxAttempts})`,
              metadata: { attempt: retryResult.attemptNumber, payment_link_url: shortUrl },
            },
          }),
        ]);
      });
    }

    return { success: true, caseId };
  }
);
