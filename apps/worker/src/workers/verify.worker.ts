/**
 * apps/worker/src/workers/verify.worker.ts
 *
 * BullMQ worker for the VERIFY stage (§5.5) — payment confirmation listener.
 * ⚠️  STUB — full implementation in Module 5.
 */

import { Worker, type Job } from "bullmq";
import type { CaseJobData } from "@revenue-recovery/types";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export const VERIFY_QUEUE = "case:verify";

export function registerVerifyWorker(): Worker {
  const worker = new Worker<CaseJobData>(
    VERIFY_QUEUE,
    async (job: Job<CaseJobData>) => {
      logger.info({ jobId: job.id, caseId: job.data.caseId }, "[VERIFY] Processing job (stub)");
      /* TODO: Module 5 — check payment.captured webhook, update amountRecovered */
    },
    { connection: createRedisConnection(), concurrency: 5 }
  );

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "[VERIFY] Job completed")
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "[VERIFY] Job failed")
  );

  return worker;
}
