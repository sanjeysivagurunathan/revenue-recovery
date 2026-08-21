/**
 * apps/web/src/app/api/metrics/summary/route.ts
 *
 * GET /api/metrics/summary — compute real dashboard numbers from database.
 */

import { NextResponse } from "next/server";
import { prisma, CaseStatus, LeakType } from "@revenue-recovery/db";
import type { ApiResponse, MetricsSummary } from "@revenue-recovery/types";

export async function GET() {
  try {
    // 1. Fetch cases and interventions in parallel
    const [allCases, allInterventions] = await Promise.all([
      prisma.revenueCase.findMany(),
      prisma.intervention.findMany(),
    ]);

    const totalCount = allCases.length;
    if (totalCount === 0) {
      const emptyResponse: ApiResponse<MetricsSummary> = {
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
      return NextResponse.json(emptyResponse);
    }

    // 2. Sum amounts
    let totalAtRisk = 0;
    let totalRecovered = 0;
    let escalatedCount = 0;
    let stoppedCount = 0;
    let recoveredCount = 0;

    const recoveryTimesMs: number[] = [];

    // Initialize leak type grouping
    const leakTypeStats: Record<string, { atRisk: number; recovered: number; count: number; recoveredCount: number }> = {};
    for (const type of Object.values(LeakType)) {
      leakTypeStats[type] = { atRisk: 0, recovered: 0, count: 0, recoveredCount: 0 };
    }

    for (const c of allCases) {
      const atRisk = Number(c.amountAtRisk);
      const recovered = Number(c.amountRecovered);
      totalAtRisk += atRisk;
      totalRecovered += recovered;

      // Grouping by leak type
      if (!leakTypeStats[c.leakType]) {
        leakTypeStats[c.leakType] = { atRisk: 0, recovered: 0, count: 0, recoveredCount: 0 };
      }
      leakTypeStats[c.leakType].atRisk += atRisk;
      leakTypeStats[c.leakType].recovered += recovered;
      leakTypeStats[c.leakType].count += 1;

      if (c.status === CaseStatus.RECOVERED || c.status === CaseStatus.PARTIALLY_RECOVERED) {
        recoveredCount += 1;
        leakTypeStats[c.leakType].recoveredCount += 1;
        if (c.resolvedAt) {
          const duration = new Date(c.resolvedAt).getTime() - new Date(c.detectedAt).getTime();
          recoveryTimesMs.push(duration);
        }
      }

      if (c.status === CaseStatus.ESCALATED) escalatedCount += 1;
      if (c.status === CaseStatus.STOPPED) stoppedCount += 1;
    }

    // 3. Compute cost from interventions
    let totalInterventionCost = 0;
    for (const i of allInterventions) {
      totalInterventionCost += Number(i.costUnits ?? 0);
    }

    // 4. Compute percentiles for recovery time
    recoveryTimesMs.sort((a, b) => a - b);
    let medianTimeToRecoveryMs = 0;
    let p90TimeToRecoveryMs = 0;

    if (recoveryTimesMs.length > 0) {
      const mid = Math.floor(recoveryTimesMs.length / 2);
      medianTimeToRecoveryMs = recoveryTimesMs.length % 2 !== 0
        ? recoveryTimesMs[mid]
        : (recoveryTimesMs[mid - 1] + recoveryTimesMs[mid]) / 2;

      const p90Idx = Math.floor(recoveryTimesMs.length * 0.9);
      p90TimeToRecoveryMs = recoveryTimesMs[Math.min(p90Idx, recoveryTimesMs.length - 1)];
    }

    // 5. Build byLeakType record
    const byLeakType: Record<string, any> = {};
    for (const [type, stats] of Object.entries(leakTypeStats)) {
      if (stats.count > 0) {
        byLeakType[type] = {
          atRisk: stats.atRisk,
          recovered: stats.recovered,
          rate: stats.recoveredCount / stats.count,
          count: stats.count,
        };
      }
    }

    const data: MetricsSummary = {
      totalAtRisk,
      totalRecovered,
      recoveryRate: recoveredCount / totalCount,
      costAdjustedRecovery: totalRecovered - totalInterventionCost,
      byLeakType,
      escalationRate: escalatedCount / totalCount,
      stopRate: stoppedCount / totalCount,
      medianTimeToRecoveryMs,
      p90TimeToRecoveryMs,
    };

    const response: ApiResponse<MetricsSummary> = {
      success: true,
      data,
    };
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message ?? "Database error" },
      { status: 500 }
    );
  }
}
