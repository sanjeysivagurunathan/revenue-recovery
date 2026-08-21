/**
 * apps/worker/src/workers/detect.worker.ts
 *
 * BullMQ worker for the DETECT pipeline stage (§5.1).
 *
 * Consumes jobs from the "case:detect" queue.
 * Each job carries a DetectJobData payload with the raw Razorpay webhook
 * or polling result. This worker normalises it into a RevenueCase row
 * and enqueues a "case:diagnose" job.
 *
 * ⚠️  STUB — full implementation in Module 2.
 *     The worker is registered here so the entrypoint compiles, and the
 *     queue plumbing is proven end-to-end before the logic is added.
 */

import { Worker, type Job } from "bullmq";
import type { DetectJobData } from "@revenue-recovery/types";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export const DETECT_QUEUE = "case:detect";

export function registerDetectWorker(): Worker {
  const worker = new Worker<DetectJobData>(
    DETECT_QUEUE,
    async (job: Job<DetectJobData>) => {
      logger.info(
        { jobId: job.id, sourceRef: job.data.sourceRef, leakType: job.data.leakType },
        "[DETECT] Processing job (stub)"
      );
      /* TODO: Module 2 — normalise webhook payload, create RevenueCase row */
    },
    {
      connection: createRedisConnection(),
      concurrency: 5, // process up to 5 detect jobs in parallel
    }
  );

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "[DETECT] Job completed")
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "[DETECT] Job failed")
  );

  return worker;
}
