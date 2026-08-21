/**
 * apps/worker/src/workers/act.worker.ts
 *
 * BullMQ worker for the ACT stage (§5.4) — deterministic executors.
 * ⚠️  STUB — full implementation in Module 4.
 */

import { Worker, type Job } from "bullmq";
import type { CaseJobData } from "@revenue-recovery/types";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export const ACT_QUEUE = "case:act";

export function registerActWorker(): Worker {
  const worker = new Worker<CaseJobData>(
    ACT_QUEUE,
    async (job: Job<CaseJobData>) => {
      logger.info({ jobId: job.id, caseId: job.data.caseId }, "[ACT] Processing job (stub)");
      /* TODO: Module 4 — run guardrail checks, dispatch channel adapter */
    },
    { connection: createRedisConnection(), concurrency: 5 }
  );

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "[ACT] Job completed")
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "[ACT] Job failed")
  );

  return worker;
}
