/**
 * apps/web/src/app/api/cases/route.ts
 *
 * GET /api/cases — list cases with optional filters.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@revenue-recovery/db";
import { CaseStatus, LeakType } from "@revenue-recovery/types";
import type { ApiResponse } from "@revenue-recovery/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as CaseStatus | null;
  const leakType = searchParams.get("leakType") as LeakType | null;
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  try {
    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (leakType) whereClause.leakType = leakType;

    const [cases, total] = await Promise.all([
      prisma.revenueCase.findMany({
        where: whereClause,
        include: {
          customer: true,
          interventions: {
            orderBy: { sentAt: "desc" },
          },
          auditEntries: {
            orderBy: { createdAt: "desc" },
          },
          events: {
            orderBy: { occurredAt: "desc" },
          },
        },
        orderBy: { detectedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.revenueCase.count({ where: whereClause }),
    ]);

    const response: ApiResponse<{ cases: any[]; total: number }> = {
      success: true,
      data: {
        cases,
        total,
      },
    };
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message ?? "Database error" },
      { status: 500 }
    );
  }
}
