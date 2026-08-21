/**
 * apps/worker/src/workers/act.worker.ts
 *
 * BullMQ worker for the ACT stage (§5.4) — deterministic executors.
 *
 * Flow:
 *  1. Load the RevenueCase + Intervention from DB
 *  2. Run guardrail checks (§6) — may override the LLM's chosen action
 *  3. Route to the correct channel adapter (Email, SMS, Razorpay, etc.)
 *  4. Mark the Intervention as executed + write AuditEntry
 *  5. Enqueue to VERIFY queue
 *
 * No LLM is called here — execution is 100% deterministic code.
 */

import { Worker, type Job } from "bullmq";
import type { ActJobData } from "@revenue-recovery/types";
import { CaseStatus, InterventionStatus, prisma } from "@revenue-recovery/db";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { verifyQueue } from "../lib/queues.js";
import { runGuardrails } from "../adapters/guardrails.js";
import { sendRecoveryEmail } from "../adapters/email.adapter.js";
import { sendSms } from "../adapters/sms.adapter.js";
import { retryPayment, createPaymentLink } from "../adapters/razorpay.adapter.js";

export const ACT_QUEUE = "case-act";

export function registerActWorker(): Worker {
  const worker = new Worker<ActJobData>(
    ACT_QUEUE,
    async (job: Job<ActJobData>) => {
      const { caseId, interventionId } = job.data;
      logger.info({ jobId: job.id, caseId, interventionId }, "[ACT] Processing job");

      /* ── 1. Load case + intervention ─────────────────────────────────────── */
      const [revenueCase, intervention] = await Promise.all([
        prisma.revenueCase.findUnique({
          where: { id: caseId },
          include: { customer: true, events: true },
        }),
        prisma.intervention.findUnique({ where: { id: interventionId } }),
      ]);

      if (!revenueCase || !intervention) {
        throw new Error(`Case or Intervention not found (caseId=${caseId}, interventionId=${interventionId})`);
      }

      /* ── 2. Run guardrails ────────────────────────────────────────────────── */
      const verdict = runGuardrails(revenueCase);
      let actionToExecute = intervention.action;
      let overrideReason: string | null = null;

      if (!verdict.allowed) {
        logger.warn({ caseId, override: verdict.override, reason: verdict.reason }, "[ACT] Guardrail override triggered");
        actionToExecute = verdict.override;
        overrideReason = verdict.reason;
      }

      /* ── 3. Execute the (possibly overridden) action ─────────────────────── */
      let metadata: Record<string, unknown> = {};
      let newStatus: CaseStatus = CaseStatus.INTERVENING;
      let shouldIncrementAttempts = false;

      switch (actionToExecute) {

        // ── retry_payment: Create a new Razorpay order for the same amount ──
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

        // ── send_payment_link: Create a Razorpay link then send via email ──
        case "send_payment_link": {
          const shortUrl = await createPaymentLink({
            caseId,
            amountPaise: Math.round(Number(revenueCase.amountAtRisk) * 100),
            currency: revenueCase.currency,
            customerName: revenueCase.customer.name,
            customerEmail: revenueCase.customer.email,
            customerPhone: revenueCase.customer.phone,
            description: `Recovery for failed payment (case ${caseId})`,
          });

          await sendRecoveryEmail({
            to: revenueCase.customer.email,
            customerName: revenueCase.customer.name,
            amountAtRisk: revenueCase.amountAtRisk.toString(),
            currency: revenueCase.currency,
            paymentLink: shortUrl,
            caseId,
          });

          metadata = { payment_link_url: shortUrl };
          shouldIncrementAttempts = true;
          break;
        }

        // ── send_reminder: Templated email or SMS depending on channel ──────
        case "send_reminder": {
          const channel = intervention.channel;
          const shortUrl = await createPaymentLink({
            caseId,
            amountPaise: Math.round(Number(revenueCase.amountAtRisk) * 100),
            currency: revenueCase.currency,
            customerName: revenueCase.customer.name,
            customerEmail: revenueCase.customer.email,
            customerPhone: revenueCase.customer.phone,
            description: `Payment reminder (case ${caseId})`,
          });

          if (channel === "EMAIL") {
            await sendRecoveryEmail({
              to: revenueCase.customer.email,
              customerName: revenueCase.customer.name,
              amountAtRisk: revenueCase.amountAtRisk.toString(),
              currency: revenueCase.currency,
              paymentLink: shortUrl,
              caseId,
            });
          } else if (channel === "SMS" || channel === "WHATSAPP") {
            if (!revenueCase.customer.phone) {
              logger.warn({ caseId }, "[ACT] No phone number available, falling back to email");
              await sendRecoveryEmail({
                to: revenueCase.customer.email,
                customerName: revenueCase.customer.name,
                amountAtRisk: revenueCase.amountAtRisk.toString(),
                currency: revenueCase.currency,
                paymentLink: shortUrl,
                caseId,
              });
            } else {
              await sendSms({
                to: revenueCase.customer.phone,
                customerName: revenueCase.customer.name,
                amountAtRisk: revenueCase.amountAtRisk.toString(),
                currency: revenueCase.currency,
                paymentLink: shortUrl,
                caseId,
                channel: channel as "SMS" | "WHATSAPP",
              });
            }
          }
          metadata = { channel_used: channel, payment_link_url: shortUrl };
          shouldIncrementAttempts = true;
          break;
        }

        // ── offer_promise_to_pay: Email + schedule a follow-up verify ────────
        case "offer_promise_to_pay": {
          const shortUrl = await createPaymentLink({
            caseId,
            amountPaise: Math.round(Number(revenueCase.amountAtRisk) * 100),
            currency: revenueCase.currency,
            customerName: revenueCase.customer.name,
            customerEmail: revenueCase.customer.email,
            customerPhone: revenueCase.customer.phone,
            description: `Promise to pay link (case ${caseId})`,
          });

          await sendRecoveryEmail({
            to: revenueCase.customer.email,
            customerName: revenueCase.customer.name,
            amountAtRisk: revenueCase.amountAtRisk.toString(),
            currency: revenueCase.currency,
            paymentLink: shortUrl,
            caseId,
          });
          metadata = { follow_up_scheduled: true, payment_link_url: shortUrl };
          shouldIncrementAttempts = true;
          break;
        }

        // ── escalate_human: Mark case as ESCALATED; dashboard shows it ───────
        case "escalate_human": {
          newStatus = CaseStatus.ESCALATED;
          metadata = { override_reason: overrideReason };
          logger.info({ caseId }, "[ACT] Case escalated to human review");
          break;
        }

        // ── stop: Terminal action — write audit and halt ─────────────────────
        case "stop": {
          newStatus = CaseStatus.STOPPED;
          metadata = { override_reason: overrideReason };
          logger.info({ caseId }, "[ACT] Case stopped (terminal)");
          break;
        }

        default:
          logger.warn({ caseId, actionToExecute }, "[ACT] Unknown action — stopping case");
          newStatus = CaseStatus.STOPPED;
      }

      /* ── 4. Update Intervention + Case status + AuditEntry ──────────────── */
      const fromStatus = revenueCase.status;

      await prisma.$transaction([
        prisma.intervention.update({
          where: { id: interventionId },
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
            actor: "system:act-worker",
            action: "execution",
            fromStatus,
            toStatus: newStatus,
            reasoning: overrideReason ?? `Executed action: ${actionToExecute} via ${intervention.channel}`,
            metadata: { action: actionToExecute, ...metadata } as any,
          },
        }),
      ]);

      /* ── 5. Enqueue VERIFY (only for non-terminal states) ──────────────── */
      const terminalStatuses: CaseStatus[] = [
        CaseStatus.ESCALATED,
        CaseStatus.STOPPED,
        CaseStatus.RECOVERED,
        CaseStatus.FAILED,
      ];

      if (!terminalStatuses.includes(newStatus)) {
        await verifyQueue.add("verify", { caseId }, {
          delay: 60 * 60 * 1000, // Re-check after 1 hour
        });
        logger.info({ caseId }, "[ACT] Enqueued delayed VERIFY job (1hr)");
      }

      logger.info({ caseId, newStatus, actionToExecute }, "[ACT] Job completed");
    },
    { connection: createRedisConnection(), concurrency: 5 }
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "[ACT] Job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "[ACT] Job failed"));

  return worker;
}
