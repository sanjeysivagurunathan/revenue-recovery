/**
 * apps/web/src/app/api/seed/run-batch/route.ts
 *
 * POST /api/seed/run-batch — resets database, seeds cases, and starts the batch run.
 */

import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { prisma } from "@revenue-recovery/db";
import { CaseStatus } from "@revenue-recovery/types";
import { getDiagnoseQueue } from "@/lib/queues";
import type { ApiResponse } from "@revenue-recovery/types";

export async function POST() {
  try {
    // 1. Run seeder via shell sync
    console.log("[Batch] Running seeder script...");
    execSync("npx tsx seed/synthetic-cases.ts", {
      env: process.env,
    });
    console.log("[Batch] Seeder script executed successfully");

    // 2. Fetch all cases that are DETECTED
    const detectedCases = await prisma.revenueCase.findMany({
      where: { status: CaseStatus.DETECTED },
    });

    console.log(`[Batch] Enqueuing ${detectedCases.length} cases to DIAGNOSE queue`);

    // 3. Enqueue cases into the BullMQ diagnose queue
    const diagnoseQueue = getDiagnoseQueue();
    const enqueuePromises = detectedCases.map((c) =>
      diagnoseQueue.add("diagnose", { caseId: c.id })
    );
    await Promise.all(enqueuePromises);

    const response: ApiResponse<string> = {
      success: true,
      data: `Successfully seeded database and enqueued ${detectedCases.length} cases to the agent pipeline.`,
    };
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[Batch] Run failed:", error);
    return NextResponse.json(
      { success: false, error: error.message ?? "Batch run failed" },
      { status: 500 }
    );
  }
}
