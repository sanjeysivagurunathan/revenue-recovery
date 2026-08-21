/**
 * apps/web/src/app/api/cases/[id]/approve/route.ts
 *
 * POST /api/cases/[id]/approve — Approve a case pending high-value verification.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@revenue-recovery/db";
import { CaseStatus } from "@revenue-recovery/types";
import { getDiagnoseQueue } from "@/lib/queues";
import type { ApiResponse } from "@revenue-recovery/types";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;

  try {
    const revenueCase = await prisma.revenueCase.findUnique({
      where: { id },
    });

    if (!revenueCase) {
      return NextResponse.json(
        { success: false, error: "Case not found" },
        { status: 404 }
      );
    }

    if (revenueCase.status !== CaseStatus.ESCALATED) {
      return NextResponse.json(
        { success: false, error: "Case is not in ESCALATED state" },
        { status: 400 }
      );
    }

    // ── 1. Create approval event and update case status back to DETECTED ──
    await prisma.$transaction([
      prisma.revenueCase.update({
        where: { id },
        data: {
          status: CaseStatus.DETECTED,
        },
      }),
      prisma.caseEvent.create({
        data: {
          caseId: id,
          type: "human_approved",
          payload: { approvedAt: new Date().toISOString(), approvedBy: "human:ops-console" },
        },
      }),
      prisma.auditEntry.create({
        data: {
          caseId: id,
          actor: "human:ops-console",
          action: "state_transition",
          fromStatus: CaseStatus.ESCALATED,
          toStatus: CaseStatus.DETECTED,
          reasoning: "Human operator approved outbound intervention for high-value case.",
        },
      }),
    ]);

    // ── 2. Enqueue back to DIAGNOSE stage ──
    await getDiagnoseQueue().add("diagnose", { caseId: id });

    const response: ApiResponse<string> = {
      success: true,
      data: "Case approved and enqueued for diagnosis",
    };
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message ?? "Failed to approve case" },
      { status: 500 }
    );
  }
}
