/**
 * apps/worker/src/lib/logger.ts
 *
 * Pino structured logger — shared by all pipeline stages.
 *
 * Why Pino (not console.log):
 *   - JSON output in production is machine-parseable by log aggregators.
 *   - Pretty-print in development for human readability.
 *   - Structured fields (caseId, leakType, etc.) are indexable.
 */

import pino from "pino";

const isDev = process.env["NODE_ENV"] !== "production";

export const logger = pino({
  /* Minimum log level — override with LOG_LEVEL env var */
  level: process.env["LOG_LEVEL"] ?? "info",

  /* Base fields added to every log line */
  base: {
    service: "revenue-recovery-worker",
    env: process.env["NODE_ENV"] ?? "development",
  },
  
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});
