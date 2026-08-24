/**
 * scripts/clear-database.ts
 *
 * Clears all revenue cases, audit entries, interventions, and customer records
 * in foreign key order so you can start with a clean slate for demos.
 *
 * Usage:
 *   npm run db:clear
 *   OR
 *   npx tsx scripts/clear-database.ts
 */

import { prisma } from "@revenue-recovery/db";

async function clearAll() {
  console.log("\n🧹 Clearing all revenue cases and history from database...");

  const [audits, interventions, events, cases, customers] = await prisma.$transaction([
    prisma.auditEntry.deleteMany(),
    prisma.intervention.deleteMany(),
    prisma.caseEvent.deleteMany(),
    prisma.revenueCase.deleteMany(),
    prisma.customer.deleteMany(),
  ]);

  console.log(`✅ Deleted ${audits.count} audit entries`);
  console.log(`✅ Deleted ${interventions.count} interventions`);
  console.log(`✅ Deleted ${events.count} case events`);
  console.log(`✅ Deleted ${cases.count} revenue cases`);
  console.log(`✅ Deleted ${customers.count} customers`);
  console.log("\n🎉 Database is now completely clean and ready for a fresh demo run!\n");

  await prisma.$disconnect();
}

clearAll().catch((err) => {
  console.error("❌ Error clearing database:", err.message);
  process.exit(1);
});
