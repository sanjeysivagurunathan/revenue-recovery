/**
 * apps/worker/src/adapters/guardrails.ts
 *
 * Stopping-rule guard functions (§6) — run BEFORE any ACT executor.
 * The LLM's chosen action is advisory; the guard is what actually gates
 * execution. This is the key architectural point: agent recommends, code enforces.
 *
 * Guards checked (in order):
 *  1. Max attempts exceeded → force escalate_human
 *  2. SLA deadline passed → force stop
 *  3. Case already in terminal state → skip
 *  4. Dispute/opt-out kill switch → force stop
 *  5. High-value approval threshold → force escalate_human
 */

import type { RevenueCase } from "@revenue-recovery/db";
import { CaseStatus } from "@revenue-recovery/db";
import { logger } from "../lib/logger.js";

/** What the guard decides to do with the requested action */
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

/**
 * Runs all guardrail checks for a given case before an ACT executor fires.
 * Returns a verdict: either allowed to proceed, or an override action with reason.
 */
export function runGuardrails(
  revenueCase: RevenueCase & { events: Array<{ type: string }> }
): GuardVerdict {
  const { id: caseId, status, attemptsUsed, maxAttempts, slaDeadline, amountAtRisk } = revenueCase;

  // ── 1. Terminal status check ───────────────────────────────────────────────
  if (TERMINAL_STATUSES.includes(status)) {
    return {
      allowed: false,
      override: "stop",
      reason: `Case ${caseId} is already in terminal status: ${status}. No further action.`,
    };
  }

  // ── 2. Max attempts guard ──────────────────────────────────────────────────
  if (attemptsUsed >= maxAttempts) {
    logger.warn({ caseId, attemptsUsed, maxAttempts }, "[Guardrails] Max attempts exceeded → escalate");
    return {
      allowed: false,
      override: "escalate_human",
      reason: `Max attempts (${maxAttempts}) reached after ${attemptsUsed} tries. Escalating to human review.`,
    };
  }

  // ── 3. SLA deadline check ──────────────────────────────────────────────────
  if (slaDeadline && slaDeadline < new Date()) {
    logger.warn({ caseId, slaDeadline }, "[Guardrails] SLA deadline passed → stop");
    return {
      allowed: false,
      override: "stop",
      reason: `SLA deadline (${slaDeadline.toISOString()}) has passed. Case stopped.`,
    };
  }

  // ── 4. Dispute / opt-out kill switch ──────────────────────────────────────
  const hasDisputeOrOptOut = revenueCase.events.some(
    (e) => e.type.includes("dispute") || e.type.includes("opt_out")
  );
  if (hasDisputeOrOptOut) {
    logger.warn({ caseId }, "[Guardrails] Dispute or opt-out detected → stop");
    return {
      allowed: false,
      override: "stop",
      reason: "A dispute or opt-out event was detected. All further outbound actions are blocked.",
    };
  }

  // ── 5. High-value approval threshold ──────────────────────────────────────
  const hasHumanApproval = revenueCase.events.some((e) => e.type === "human_approved");
  const threshold = Number(process.env["HIGH_VALUE_APPROVAL_THRESHOLD"] ?? 50000);
  if (Number(amountAtRisk) > threshold && attemptsUsed === 0 && !hasHumanApproval) {
    logger.warn({ caseId, amountAtRisk }, "[Guardrails] High-value case requires human approval");
    return {
      allowed: false,
      override: "escalate_human",
      reason: `Amount at risk (${amountAtRisk}) exceeds the high-value threshold (${threshold}). Human approval required before first outbound action.`,
    };
  }

  return { allowed: true };
}
