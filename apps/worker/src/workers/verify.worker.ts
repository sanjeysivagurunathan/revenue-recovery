/**
 * apps/worker/src/workers/verify.worker.ts
 *
 * BullMQ worker for the VERIFY stage (§5.5) — payment confirmation.
 *
 * This worker is triggered two ways:
 *  1. By the ACT worker with a 1-hour delay (polls Razorpay for payment status)
 *  2. Directly by the webhook route when a `payment.captured` / `order.paid`
 *     / `subscription.charged` event arrives for a case that is INTERVENING.
 *
 * Flow:
 *  1. Load the case from DB
 *  2. Check all Interventions to find one with a payment/order ID in metadata
 *  3. Poll Razorpay Orders API for the most recent attempt's status
 *  4. If captured → RECOVERED, if still failed → re-queue to DIAGNOSE for retry
 *  5. Write AuditEntry and update amountRecovered
 */

import { Worker, type Job } from "bullmq";
import type { CaseJobData } from "@revenue-recovery/types";
import { CaseStatus, InterventionStatus, prisma } from "@revenue-recovery/db";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { diagnoseQueue } from "../lib/queues.js";
import Razorpay from "razorpay";

export const VERIFY_QUEUE = "case:verify";

function getRazorpayClient(): Razorpay | null {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function registerVerifyWorker(): Worker {
  const worker = new Worker<CaseJobData>(
    VERIFY_QUEUE,
    async (job: Job<CaseJobData>) => {
      const { caseId } = job.data;
      logger.info({ jobId: job.id, caseId }, "[VERIFY] Processing job");

      /* ── 1. Load Case + Interventions ────────────────────────────────────── */
      const revenueCase = await prisma.revenueCase.findUnique({
        where: { id: caseId },
        include: { interventions: { orderBy: { sentAt: "desc" } } },
      });

      if (!revenueCase) {
        throw new Error(`Case ${caseId} not found`);
      }

      // Only verify cases that are currently being acted upon
      if (revenueCase.status !== CaseStatus.INTERVENING) {
        logger.info({ caseId, status: revenueCase.status }, "[VERIFY] Case is not INTERVENING, skipping");
        return;
      }

      /* ── 2. Find the most recent intervention with a Razorpay order_id ───── */
      const lastIntervention = revenueCase.interventions.find(
        (i) => i.status === InterventionStatus.EXECUTED
      );

      const orderId = (lastIntervention?.metadata as any)?.razorpay_order_id as string | undefined;

      /* ── 3. Poll Razorpay if we have an order ID ─────────────────────────── */
      let paymentCaptured = false;
      let capturedAmount = 0;

      if (orderId) {
        const rzp = getRazorpayClient();
        if (rzp) {
          try {
            const order = await rzp.orders.fetch(orderId);
            if ((order as any).status === "paid") {
              paymentCaptured = true;
              capturedAmount = Number((order as any).amount_paid) / 100;
              logger.info({ caseId, orderId, capturedAmount }, "[VERIFY] Razorpay order paid");
            } else {
              logger.info({ caseId, orderId, status: (order as any).status }, "[VERIFY] Payment not yet captured");
            }
          } catch (err) {
            logger.warn({ caseId, orderId, err }, "[VERIFY] Failed to fetch Razorpay order — will retry");
          }
        } else {
          // No Razorpay credentials — use MOCK: treat as not-yet-paid so the pipeline continues
          logger.info({ caseId }, "[VERIFY] MOCK MODE — no Razorpay credentials, assuming payment pending");
        }
      }

      /* ── 4. Update Case based on verification result ─────────────────────── */
      if (paymentCaptured) {
        // Mark as RECOVERED
        await prisma.$transaction([
          prisma.revenueCase.update({
            where: { id: caseId },
            data: {
              status: CaseStatus.RECOVERED,
              amountRecovered: capturedAmount,
              resolvedAt: new Date(),
            },
          }),
          prisma.auditEntry.create({
            data: {
              caseId,
              actor: "system:verify-worker",
              action: "state_transition",
              fromStatus: CaseStatus.INTERVENING,
              toStatus: CaseStatus.RECOVERED,
              reasoning: `Payment captured: ₹${capturedAmount}. Case recovered successfully.`,
              metadata: { orderId, capturedAmount } as any,
            },
          }),
        ]);
        logger.info({ caseId, capturedAmount }, "[VERIFY] Case marked as RECOVERED ✅");

      } else {
        // Not yet paid — check if we can retry or should escalate
        const hasRemainingAttempts = revenueCase.attemptsUsed < revenueCase.maxAttempts;

        if (hasRemainingAttempts) {
          // Re-queue to DIAGNOSE to pick a new recovery action
          await prisma.revenueCase.update({
            where: { id: caseId },
            data: { status: CaseStatus.DETECTED }, // reset to allow re-diagnosis
          });

          await diagnoseQueue.add("diagnose", { caseId }, {
            delay: 24 * 60 * 60 * 1000, // Wait 24h before next attempt
          });

          logger.info({ caseId }, "[VERIFY] Re-queued case for next attempt (24h delay)");
        } else {
          // Max attempts exhausted and no payment — mark FAILED
          await prisma.$transaction([
            prisma.revenueCase.update({
              where: { id: caseId },
              data: { status: CaseStatus.FAILED, resolvedAt: new Date() },
            }),
            prisma.auditEntry.create({
              data: {
                caseId,
                actor: "system:verify-worker",
                action: "state_transition",
                fromStatus: CaseStatus.INTERVENING,
                toStatus: CaseStatus.FAILED,
                reasoning: `Max attempts (${revenueCase.maxAttempts}) exhausted with no payment captured. Case failed.`,
              },
            }),
          ]);
          logger.warn({ caseId }, "[VERIFY] Case marked as FAILED ❌");
        }
      }
    },
    { connection: createRedisConnection(), concurrency: 5 }
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "[VERIFY] Job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "[VERIFY] Job failed"));

  return worker;
}
