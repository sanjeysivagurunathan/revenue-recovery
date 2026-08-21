/**
 * apps/web/src/lib/redis.ts
 *
 * IORedis connection shared by Next.js API routes (e.g. for enqueuing jobs).
 * Uses a global singleton pattern to survive Next.js hot reloads in dev.
 */

import { Redis, type RedisOptions } from "ioredis";

function buildRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
  };
}

const REDIS_URL = () => {
  const url = process.env["REDIS_URL"];
  if (!url) throw new Error("REDIS_URL environment variable is not set");
  return url;
};

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(REDIS_URL(), buildRedisOptions());
  }
  return globalForRedis.redis;
}

/** @deprecated use getRedis() — kept for backward compat in tests */
export const redis = new Proxy({} as Redis, {
  get(_t, prop) {
    return (getRedis() as any)[prop as string];
  },
});
