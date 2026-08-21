/**
 * apps/web/src/app/api/metrics/summary/route.ts
 *
 * GET /api/metrics/summary — dashboard headline numbers.
 * ⚠️  STUB — returns zeros; full implementation in Module 6.
 */

import { NextResponse } from "next/server";
import type { ApiResponse, MetricsSummary } from "@revenue-recovery/types";

export async function GET() {
  /* TODO: Module 6 — compute metrics from DB */
  const response: ApiResponse<MetricsSummary> = {
    success: true,
    data: {
      totalAtRisk: 0,
      totalRecovered: 0,
      recoveryRate: 0,
      costAdjustedRecovery: 0,
      byLeakType: {},
      escalationRate: 0,
      stopRate: 0,
      medianTimeToRecoveryMs: 0,
      p90TimeToRecoveryMs: 0,
    },
  };
  return NextResponse.json(response);
}
