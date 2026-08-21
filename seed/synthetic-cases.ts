/**
 * seed/synthetic-cases.ts
 *
 * Demo dataset generator — creates realistic synthetic revenue cases
 * spanning all four leak types for the demo batch run (§12, step 7).
 *
 * ⚠️  STUB — full seeder implemented in Module 7.
 *
 * Usage:
 *   npx tsx seed/synthetic-cases.ts
 */

import { prisma, LeakType, CaseStatus } from "@revenue-recovery/db";

async function main() {
  console.log("🌱 Seeding synthetic cases (stub)...");
  /* TODO: Module 7 — generate 200 synthetic cases across all four LeakTypes */
  console.log("✅ Seed complete");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
