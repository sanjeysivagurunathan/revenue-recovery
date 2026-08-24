/**
 * apps/web/src/inngest/adapters/guardrails.ts
 *
 * Deterministic guardrails enforced before any outreach action is executed.
 */

import { CaseStatus, type RevenueCase } from "@revenue-recovery/db";

export type GuardVerdict =
  | { allowed: true }
  | { allowed: false; override: "escalate_human" | "stop"; reason: string };

const TERMINAL_STATUSES: CaseStatus[] = [
  CaseStatus.RECOVERED,
  CaseStatus.PARTIALLY_RECOVERED,
  CaseStatus.FAILED,
  CaseStatus.ESCALATED,
  CaseStatus.STOPPED,
];

export function runGuardrails(
  revenueCase: RevenueCase & { events: Array<{ type: string }> }
): GuardVerdict {
  const { id: caseId, status, attemptsUsed, maxAttempts, slaDeadline, amountAtRisk } = revenueCase;

  // 1. Terminal status check
  if (TERMINAL_STATUSES.includes(status)) {
    return {
      allowed: false,
      override: "stop",
      reason: `Case ${caseId} is already in terminal status: ${status}. No further action.`,
    };
  }

  // 2. Max attempts guard
  if (attemptsUsed >= maxAttempts) {
    return {
      allowed: false,
      override: "escalate_human",
      reason: `Max attempts (${maxAttempts}) reached after ${attemptsUsed} tries. Escalating to human review.`,
    };
  }

  // 3. SLA deadline check
  if (slaDeadline && slaDeadline < new Date()) {
    return {
      allowed: false,
      override: "stop",
      reason: `SLA deadline (${slaDeadline.toISOString()}) has passed. Case stopped.`,
    };
  }

  // 4. Dispute / opt-out kill switch
  const hasDisputeOrOptOut = revenueCase.events.some(
    (e) => e.type.includes("dispute") || e.type.includes("opt_out")
  );
  if (hasDisputeOrOptOut) {
    return {
      allowed: false,
      override: "stop",
      reason: "A dispute or opt-out event was detected. All further outbound actions are blocked.",
    };
  }

  // 5. High-value approval threshold
  const hasHumanApproval = revenueCase.events.some((e) => e.type === "human_approved");
  const threshold = Number(process.env["HIGH_VALUE_APPROVAL_THRESHOLD"] ?? 50000);
  if (Number(amountAtRisk) > threshold && attemptsUsed === 0 && !hasHumanApproval) {
    return {
      allowed: false,
      override: "escalate_human",
      reason: `Amount at risk (${amountAtRisk}) exceeds the high-value threshold (${threshold}). Human approval required before first outbound action.`,
    };
  }

  return { allowed: true };
}
