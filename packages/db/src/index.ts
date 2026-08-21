/**
 * packages/db/src/index.ts
 *
 * Singleton Prisma client — re-exported for use by both the Next.js app
 * and the standalone worker process.
 *
 * Why singleton pattern:
 *   - In development, Next.js hot-reload creates a new module context on
 *     every reload. Without the global singleton guard, each reload would
 *     open a new DB connection pool, exhausting Postgres connections.
 *   - In production (worker), there is only one process so this is a no-op.
 */

import { PrismaClient } from "../generated/client/index.js";

// ── Development hot-reload guard ──────────────────────────────────────────────
// Use a global variable so the PrismaClient instance survives hot-module
// replacement in Next.js development mode.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

// ── Re-export generated types so consumers don't need to import from two places ──
export type {
  Customer,
  RevenueCase,
  CaseEvent,
  Intervention,
  RecoveryPolicy,
  AuditEntry,
  Prisma,
} from "../generated/client/index.js";

export {
  LeakType,
  CaseStatus,
  InterventionChannel,
  InterventionStatus,
} from "../generated/client/index.js";
