/**
 * apps/worker/src/lib/redis.ts
 *
 * Singleton IORedis connection used by all BullMQ workers and schedulers.
 *
 * Why singleton:
 *   BullMQ recommends a separate connection per worker, but the connection
 *   CONFIG object (host, port, password) should come from one place.
 *   We export a factory that BullMQ can call to get its own connection
 *   instance, while keeping the raw client for health checks.
 */

import { Redis, type RedisOptions } from "ioredis";
import { logger } from "./logger.js";

/** Parses the REDIS_URL env var into IORedis-compatible options */
function buildRedisOptions(): RedisOptions {
  const url = process.env["REDIS_URL"];
  if (!url) {
    throw new Error("REDIS_URL environment variable is not set");
  }

  /* IORedis accepts a URL string directly; also set common prod options */
  return {
    /* Re-connect automatically with exponential backoff */
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,    // required by BullMQ
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      logger.warn({ attempt: times, delayMs: delay }, "Redis reconnecting...");
      return delay;
    },
  };
}

/** The REDIS_URL string (singleton) */
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

/** Raw client used for health pings and direct commands outside BullMQ */
let _redis: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!_redis) {
    _redis = new Redis(REDIS_URL, buildRedisOptions());

    _redis.on("connect", () => logger.info("Redis connection established"));
    _redis.on("error", (err) => logger.error({ err }, "Redis error"));
    _redis.on("close", () => logger.warn("Redis connection closed"));
  }
  return _redis;
}

/**
 * Factory for creating new IORedis instances — used when BullMQ needs
 * its own dedicated connection per worker (required for BullMQ v5).
 */
export function createRedisConnection(): Redis {
  return new Redis(REDIS_URL, buildRedisOptions());
}
