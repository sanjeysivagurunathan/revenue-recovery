/**
 * apps/worker/src/lib/queues.ts
 *
 * BullMQ Queue instances for the worker to publish jobs to the next pipeline stage.
 * These reuse the main Redis connection factory.
 */

import { Queue } from "bullmq";
import { getRedisConnection } from "./redis.js";

const connection = getRedisConnection();

export const diagnoseQueue = new Queue("case:diagnose", { connection });
export const decideQueue = new Queue("case:decide", { connection });
export const actQueue = new Queue("case:act", { connection });
export const verifyQueue = new Queue("case:verify", { connection });
