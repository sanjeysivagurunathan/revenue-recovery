/**
 * apps/worker/src/index.ts
 *
 * Worker entrypoint — bootstraps the BullMQ workers for every pipeline stage.
 *
 * Architecture note (§2):
 *   This process is intentionally SEPARATE from the Next.js app.
 *   It never handles HTTP requests. It only:
 *     1. Consumes jobs from Redis queues.
 *     2. Writes state to PostgreSQL.
 *     3. Calls external APIs (Anthropic, Razorpay, Resend, Twilio).
 *
 * Queue topology (one queue per pipeline stage):
 *   case:detect   → DetectWorker
 *   case:diagnose → DiagnoseWorker
 *   case:decide   → DecideWorker
 *   case:act      → ActWorker
 *   case:verify   → VerifyWorker
 *
 * Workers are registered in Modules 2–5 as stubs and filled in progressively.
 */

import "dotenv/config";                       // load .env before anything else
import { logger } from "./lib/logger.js";
import { getRedisConnection } from "./lib/redis.js";
import { registerDetectWorker } from "./workers/detect.worker.js";
import { registerDiagnoseWorker } from "./workers/diagnose.worker.js";
import { registerDecideWorker } from "./workers/decide.worker.js";
import { registerActWorker } from "./workers/act.worker.js";
import { registerVerifyWorker } from "./workers/verify.worker.js";

async function main() {
  logger.info("🚀 Revenue Recovery Worker starting...");

  /* Verify Redis connection before registering workers */
  const redis = getRedisConnection();
  await redis.ping();
  logger.info("✅ Redis connected");

  /* Register all pipeline stage workers */
  const workers = [
    registerDetectWorker(),
    registerDiagnoseWorker(),
    registerDecideWorker(),
    registerActWorker(),
    registerVerifyWorker(),
  ];

  logger.info(
    { workerCount: workers.length },
    "✅ All pipeline workers registered"
  );

  /* ── Graceful shutdown ── */
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down workers gracefully...");
    await Promise.all(workers.map((w) => w.close()));
    await redis.quit();
    logger.info("Worker shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info("✅ Worker is listening for jobs. Press Ctrl+C to stop.");
}

main().catch((err) => {
  logger.error({ err }, "Fatal error in worker entrypoint");
  process.exit(1);
});
