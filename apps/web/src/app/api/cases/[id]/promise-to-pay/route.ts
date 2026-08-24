/**
 * apps/web/src/app/api/cases/[id]/promise-to-pay/route.ts
 *
 * Promise-to-Pay (PTP) Tracker API (§10).
 * Records a customer's scheduled promise to settle an overdue receivable/invoice.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma, CaseStatus } from "@revenue-recovery/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: caseId } = await params;
    const body = await req.json();

    const {
      promisedDate,
      promisedAmount,
      reason,
      actor = "agent:ptp-tracker",
    } = body;

    if (!promisedDate) {
      return NextResponse.json(
        { error: "promisedDate is required (e.g. 2026-08-30)" },
        { status: 400 }
      );
    }

    const existingCase = await prisma.revenueCase.findUnique({
      where: { id: caseId },
      include: { customer: true },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const finalAmount = promisedAmount ?? Number(existingCase.amountAtRisk);

    const [updatedCase, audit] = await prisma.$transaction([
      prisma.revenueCase.update({
        where: { id: caseId },
        data: {
          status: CaseStatus.AWAITING_CUSTOMER,
        },
      }),
      prisma.auditEntry.create({
        data: {
          caseId,
          actor,
          action: "promise_to_pay_scheduled",
          fromStatus: existingCase.status,
          toStatus: CaseStatus.AWAITING_CUSTOMER,
          reasoning:
            reason ||
            `Client promised to pay ${existingCase.currency} ${finalAmount} on or before ${promisedDate}.`,
          metadata: {
            promised_date: promisedDate,
            promised_amount: finalAmount,
            scheduled_at: new Date().toISOString(),
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        case: updatedCase,
        audit,
        message: `Promise-to-Pay recorded for ${promisedDate}`,
      },
    });
  } catch (err: any) {
    console.error("[PTP] Error recording promise-to-pay:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
