/**
 * apps/web/src/lib/redis.ts
 *
 * IORedis connection shared by Next.js API routes (e.g. for enqueuing jobs).
 * Uses a global singleton pattern to survive Next.js hot reloads in dev.
 */

import { Redis, type RedisOptions } from "ioredis";

function buildRedisOptions(): RedisOptions {
  const url = process.env["REDIS_URL"];
  if (!url) {
    throw new Error("REDIS_URL environment variable is not set");
  }

  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
  };
}

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis = globalForRedis.redis ?? new Redis(REDIS_URL, buildRedisOptions());

if (process.env["NODE_ENV"] !== "production") {
  globalForRedis.redis = redis;
}
