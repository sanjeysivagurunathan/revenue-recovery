/**
 * apps/worker/src/workers/decide.worker.ts
 *
 * BullMQ worker for the DECIDE stage (§5.3) — Claude call #2.
 */

import { Worker, type Job } from "bullmq";
import type { CaseJobData } from "@revenue-recovery/types";
import { CaseStatus, InterventionChannel, prisma } from "@revenue-recovery/db";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { actQueue } from "../lib/queues.js";
import { generateDecision } from "../lib/llm.js";

export const DECIDE_QUEUE = "case-decide";

export function registerDecideWorker(): Worker {
  const worker = new Worker<CaseJobData>(
    DECIDE_QUEUE,
    async (job: Job<CaseJobData>) => {
      const { caseId } = job.data;
      logger.info({ jobId: job.id, caseId }, "[DECIDE] Processing job");

      const revenueCase = await prisma.revenueCase.findUnique({
        where: { id: caseId },
        include: { customer: true },
      });

      if (!revenueCase) {
        throw new Error(`Case ${caseId} not found`);
      }

      if (revenueCase.status !== CaseStatus.DIAGNOSED) {
        logger.info({ caseId, status: revenueCase.status }, "[DECIDE] Case is not DIAGNOSED, skipping decision");
        return;
      }

      // Mocking a strict RecoveryPolicy for now
      const allowedActions = ["retry_payment", "send_payment_link", "send_reminder", "offer_promise_to_pay", "escalate_human"];
      const allowedChannels = ["EMAIL", "SMS", "WHATSAPP", "PAYMENT_RETRY", "HUMAN_HANDOFF"];
      
      const diagnosisPayload = revenueCase.diagnosisPayload as any;

      // 1. Construct Prompt
      const prompt = `
Decide the best recovery action for a failed payment. Be concise — max 1 sentence for reasoning.

Amount: ${revenueCase.amountAtRisk.toString()} ${revenueCase.currency}
Previous Attempts: ${revenueCase.attemptsUsed} / ${revenueCase.maxAttempts}
Root Cause: ${revenueCase.rootCause}
Urgency: ${diagnosisPayload?.recommended_urgency}

Constraints (no exceptions):
- Allowed Actions: ${allowedActions.join(", ")}
- Allowed Channels: ${allowedChannels.join(", ")}
- If attempts >= max attempts, MUST choose "escalate_human" + "HUMAN_HANDOFF".
- If reasoning mentions "permanently blocked" or "card blocked", MUST NOT choose "retry_payment" — choose "send_reminder" via "WHATSAPP" or "EMAIL".
- If root_cause is "insufficient_funds" and attempts < max, prefer "retry_payment".
- Otherwise first contact: prefer "send_reminder" via "WHATSAPP" if phone available, else "EMAIL".

Respond with action, channel, and 1 short sentence reasoning.
`;

      // 2. Call Claude
      const decision = await generateDecision(prompt);
      logger.info({ caseId, action: decision.action, channel: decision.channel }, "[DECIDE] Claude decision received");

      // 3. Create Intervention record
      const intervention = await prisma.intervention.create({
        data: {
          caseId,
          channel: decision.channel as InterventionChannel,
          action: decision.action,
        },
      });

      // 4. Update Case status
      await prisma.revenueCase.update({
        where: { id: caseId },
        data: {
          status: CaseStatus.INTERVENING,
        },
      });

      // 5. Audit Log
      await prisma.auditEntry.create({
        data: {
          caseId,
          actor: "agent:claude-3.5-sonnet",
          action: "decision",
          fromStatus: CaseStatus.DIAGNOSED,
          toStatus: CaseStatus.INTERVENING,
          reasoning: decision.reasoning,
          metadata: { action: decision.action, channel: decision.channel, interventionId: intervention.id },
        },
      });

      // 6. Enqueue to ACT
      await actQueue.add("act", { caseId, interventionId: intervention.id });
      logger.info({ caseId, interventionId: intervention.id }, "[DECIDE] Passed case to ACT queue");
    },
    { connection: createRedisConnection(), concurrency: 3 }
  );

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "[DECIDE] Job completed")
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "[DECIDE] Job failed")
  );

  return worker;
}
