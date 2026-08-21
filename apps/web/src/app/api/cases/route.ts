/**
 * apps/web/src/app/api/cases/route.ts
 *
 * GET /api/cases — list cases with optional filters.
 * ⚠️  STUB — returns empty list; full implementation in Module 6.
 */

import { type NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@revenue-recovery/types";

export async function GET(_req: NextRequest) {
  /* TODO: Module 6 — query DB with filters (leakType, status, pagination) */
  const response: ApiResponse<unknown[]> = {
    success: true,
    data: [],
  };
  return NextResponse.json(response);
}
