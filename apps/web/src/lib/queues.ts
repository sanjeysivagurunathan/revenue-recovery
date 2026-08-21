/**
 * apps/web/src/lib/queues.ts
 *
 * BullMQ queue instances used by the web app to enqueue jobs for the worker.
 */

import { Queue } from "bullmq";
import { redis } from "./redis";

/** 
 * Queue for the DETECT stage.
 * The Next.js API route pushes Razorpay webhooks here for the worker to process.
 */
export const detectQueue = new Queue("case:detect", { connection: redis });
