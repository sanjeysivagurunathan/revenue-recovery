/**
 * apps/worker/src/workers/decide.worker.ts
 *
 * BullMQ worker for the DECIDE stage (§5.3) — Claude call #2.
 * ⚠️  STUB — full implementation in Module 3.
 */

import { Worker, type Job } from "bullmq";
import type { CaseJobData } from "@revenue-recovery/types";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export const DECIDE_QUEUE = "case:decide";

export function registerDecideWorker(): Worker {
  const worker = new Worker<CaseJobData>(
    DECIDE_QUEUE,
    async (job: Job<CaseJobData>) => {
      logger.info({ jobId: job.id, caseId: job.data.caseId }, "[DECIDE] Processing job (stub)");
      /* TODO: Module 3 — call Claude API for policy-constrained action selection */
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
