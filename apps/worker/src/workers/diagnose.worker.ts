/**
 * apps/worker/src/workers/diagnose.worker.ts
 *
 * BullMQ worker for the DIAGNOSE stage (§5.2) — Claude call #1.
 * ⚠️  STUB — full implementation in Module 3.
 */

import { Worker, type Job } from "bullmq";
import type { CaseJobData } from "@revenue-recovery/types";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export const DIAGNOSE_QUEUE = "case:diagnose";

export function registerDiagnoseWorker(): Worker {
  const worker = new Worker<CaseJobData>(
    DIAGNOSE_QUEUE,
    async (job: Job<CaseJobData>) => {
      logger.info({ jobId: job.id, caseId: job.data.caseId }, "[DIAGNOSE] Processing job (stub)");
      /* TODO: Module 3 — call Claude API for root-cause classification */
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
