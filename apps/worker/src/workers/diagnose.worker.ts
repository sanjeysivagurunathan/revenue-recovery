/**
 * apps/worker/src/workers/diagnose.worker.ts
 *
 * BullMQ worker for the DIAGNOSE stage (§5.2) — Claude call #1.
 * ⚠️  STUB — full implementation in Module 3.
 */

import { Worker, type Job } from "bullmq";
import type { CaseJobData } from "@revenue-recovery/types";
import { CaseStatus, prisma } from "@revenue-recovery/db";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { decideQueue } from "../lib/queues.js";
import { generateDiagnosis } from "../lib/llm.js";

export const DIAGNOSE_QUEUE = "case-diagnose";

export function registerDiagnoseWorker(): Worker {
  const worker = new Worker<CaseJobData>(
    DIAGNOSE_QUEUE,
    async (job: Job<CaseJobData>) => {
      const { caseId } = job.data;
      logger.info({ jobId: job.id, caseId }, "[DIAGNOSE] Processing job");

      const revenueCase = await prisma.revenueCase.findUnique({
        where: { id: caseId },
        include: { customer: true, events: true },
      });

      if (!revenueCase) {
        throw new Error(`Case ${caseId} not found`);
      }

      // We only diagnose if it's in the DETECTED stage
      if (revenueCase.status !== CaseStatus.DETECTED) {
        logger.info({ caseId, status: revenueCase.status }, "[DIAGNOSE] Case is not DETECTED, skipping diagnosis");
        return;
      }

      // 1. Construct Prompt context
      const prompt = `
You are diagnosing a failed payment. Be concise — max 1 sentence for reasoning.

Amount: ${revenueCase.amountAtRisk.toString()} ${revenueCase.currency}
Leak Type: ${revenueCase.leakType}

Webhook error fields:
${JSON.stringify(revenueCase.events.map(e => {
  const p = (e.payload as any)?.payload?.payment?.entity;
  return p ? { error_code: p.error_code, error_description: p.error_description, error_reason: p.error_reason, error_step: p.error_step } : { type: e.type };
}), null, 2)}

Identify the root cause from allowed enum values. Keep reasoning to 1 short sentence. Provide confidence and recommended urgency.
`;

      // 2. Call Claude
      const diagnosis = await generateDiagnosis(prompt);
      logger.info({ caseId, rootCause: diagnosis.root_cause }, "[DIAGNOSE] Claude diagnosis received");

      // 3. Update Case
      await prisma.revenueCase.update({
        where: { id: caseId },
        data: {
          status: CaseStatus.DIAGNOSED,
          rootCause: diagnosis.root_cause,
          diagnosisPayload: diagnosis as any,
        },
      });

      // 4. Audit Log
      await prisma.auditEntry.create({
        data: {
          caseId,
          actor: "agent:claude-3.5-sonnet",
          action: "diagnosis",
          fromStatus: CaseStatus.DETECTED,
          toStatus: CaseStatus.DIAGNOSED,
          reasoning: diagnosis.reasoning,
          metadata: { confidence: diagnosis.confidence, recommended_urgency: diagnosis.recommended_urgency },
        },
      });

      // 5. Enqueue to next stage
      await decideQueue.add("decide", { caseId });
      logger.info({ caseId }, "[DIAGNOSE] Passed case to DECIDE queue");
    },
    { connection: createRedisConnection(), concurrency: 3 }
  );

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "[DIAGNOSE] Job completed")
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "[DIAGNOSE] Job failed")
  );

  return worker;
}
