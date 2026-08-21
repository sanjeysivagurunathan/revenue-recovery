/**
 * apps/web/src/lib/queues.ts
 *
 * BullMQ queue instances used by the web app to enqueue jobs for the worker.
 * Uses a lazy getter so the Redis client is only created on first request —
 * this prevents build-time errors when REDIS_URL is not set during `next build`.
 */

import { Queue } from "bullmq";
import { getRedis } from "./redis";

/** Lazily-created Queue singleton to prevent build-time Redis connection */
let _detectQueue: Queue | null = null;
let _diagnoseQueue: Queue | null = null;

export function getDetectQueue(): Queue {
  if (!_detectQueue) {
    _detectQueue = new Queue("case-detect", { connection: getRedis() });
  }
  return _detectQueue;
}

export function getDiagnoseQueue(): Queue {
  if (!_diagnoseQueue) {
    _diagnoseQueue = new Queue("case-diagnose", { connection: getRedis() });
  }
  return _diagnoseQueue;
}
