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
You must decide the best recovery action and channel for a revenue leak.

Customer Details:
Name: ${revenueCase.customer.name}
Amount at Risk: ${revenueCase.amountAtRisk.toString()} ${revenueCase.currency}
Risk Score: ${revenueCase.customer.riskScore}
Previous Attempts: ${revenueCase.attemptsUsed} / ${revenueCase.maxAttempts}

Diagnosis:
Root Cause: ${revenueCase.rootCause}
Confidence: ${diagnosisPayload?.confidence}
Urgency: ${diagnosisPayload?.recommended_urgency}
Reasoning: ${diagnosisPayload?.reasoning}

Constraints (Strictly enforce these):
- Allowed Actions: ${allowedActions.join(", ")}
- Allowed Channels: ${allowedChannels.join(", ")}
- You cannot choose an action or channel outside of the allowed lists above.
- If attempts used >= max attempts, you MUST choose "escalate_human" and "HUMAN_HANDOFF".

Analyze the diagnosis and constraints, and decide on the next best action and channel.
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
