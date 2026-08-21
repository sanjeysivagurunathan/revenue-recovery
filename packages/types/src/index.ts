/**
 * packages/types/src/index.ts
 *
 * Canonical shared types used by both the Next.js web app and the
 * standalone worker service. By centralising here we keep the API contract
 * between the two processes type-safe and single-source-of-truth.
 */

// ── Shared enums defined directly here to ensure frontend safety ──────────────────
export enum LeakType {
  PAYMENT_DEGRADATION = "PAYMENT_DEGRADATION",
  CHECKOUT_ABANDONMENT = "CHECKOUT_ABANDONMENT",
  SUBSCRIPTION_FAILURE = "SUBSCRIPTION_FAILURE",
  OVERDUE_RECEIVABLES = "OVERDUE_RECEIVABLES",
}

export enum CaseStatus {
  DETECTED = "DETECTED",
  DIAGNOSED = "DIAGNOSED",
  INTERVENING = "INTERVENING",
  RECOVERED = "RECOVERED",
  PARTIALLY_RECOVERED = "PARTIALLY_RECOVERED",
  FAILED = "FAILED",
  ESCALATED = "ESCALATED",
  STOPPED = "STOPPED",
}

export enum InterventionChannel {
  EMAIL = "EMAIL",
  SMS = "SMS",
  WHATSAPP = "WHATSAPP",
  VOICE = "VOICE",
  PAYMENT_RETRY = "PAYMENT_RETRY",
  PAYMENT_LINK = "PAYMENT_LINK",
  HUMAN_HANDOFF = "HUMAN_HANDOFF",
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT PIPELINE — structured payloads exchanged between pipeline stages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Root causes Claude may classify in the DIAGNOSE step.
 * Fixed enum — Claude is constrained to these values only.
 */
export type RootCause =
  | "insufficient_funds"
  | "card_expired"
  | "bank_decline_soft"   // soft decline (temporary, retry-able)
  | "bank_decline_hard"   // hard decline (do not retry same method)
  | "upi_mandate_failed"
  | "cart_price_shock"    // abandonment: price too high
  | "shipping_cost_surprise" // abandonment: shipping added at checkout
  | "payment_method_missing" // abandonment: no saved method
  | "invoice_dispute"     // B2B: customer disputes invoice
  | "genuine_dispute"     // payment dispute opened
  | "unknown";

/**
 * Urgency levels that influence intervention sequencing.
 */
export type Urgency = "low" | "medium" | "high";

/**
 * Structured JSON output from Claude's DIAGNOSE call (#1).
 * Schema is strict — the agent returns ONLY these fields.
 */
export interface DiagnosisResult {
  root_cause: RootCause;
  confidence: number;          // 0.0 – 1.0
  recommended_urgency: Urgency;
  reasoning: string;           // one paragraph, stored verbatim in AuditEntry
}

/**
 * Actions Claude may select in the DECIDE call (#2).
 * Must be one of the values in the case's RecoveryPolicy.allowedChannels.
 */
export type AgentAction =
  | "retry_payment"
  | "send_payment_link"
  | "send_reminder"
  | "offer_promise_to_pay"
  | "escalate_human"
  | "stop";

/**
 * Structured JSON output from Claude's DECIDE call (#2).
 */
export interface DecisionResult {
  action: AgentAction;
  channel: string;     // InterventionChannel value
  reasoning: string;   // stored verbatim in AuditEntry
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANNEL ADAPTERS — the interface every executor must implement (§9)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return value from every channel adapter's execute() call.
 * Outcome is a closed set — adapters must not invent new string values.
 */
export interface InterventionResult {
  /** Whether the adapter successfully dispatched the action. */
  success: boolean;
  /** Closed-set outcome label written to Intervention.outcome. */
  outcome:
    | "delivered"
    | "customer_paid"
    | "payment_link_sent"
    | "retry_scheduled"
    | "no_response"
    | "bounced"
    | "failed"
    | "escalated"
    | "stopped";
  /** Optional Razorpay resource ID created by this action (e.g. payment link ID). */
  externalRef?: string;
  /** Fractional cost units for ROI calculation (§8). */
  costUnits?: number;
  /** Human-readable error message if success=false. */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GUARDRAIL — result of the pre-execution compliance check (§6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reason codes for why the guardrail blocked execution.
 * Each maps to a specific stopping rule in §6.
 */
export type GuardrailBlockReason =
  | "max_attempts_exceeded"    // §6 rule 1
  | "cooldown_active"          // §6 rule 2
  | "quiet_hours"              // §6 rule 3
  | "sla_deadline_passed"      // §6 rule 4
  | "dispute_or_opt_out"       // §6 rule 5
  | "spend_cap_exceeded"       // §6 rule 6
  | "awaiting_human_approval"; // §6 rule 7

export interface GuardrailResult {
  allowed: boolean;
  blockReason?: GuardrailBlockReason;
  blockDetail?: string; // human-readable explanation for audit log
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE JOBS — payload shapes for BullMQ job data
// ─────────────────────────────────────────────────────────────────────────────

/** Payload for the "case:detect" queue — triggered by webhooks or polling. */
export interface DetectJobData {
  sourceRef: string;        // Razorpay resource ID
  leakType: string;         // LeakType enum value (string for JSON safety)
  rawPayload: unknown;      // original webhook/event body
  receivedAt: string;       // ISO 8601
}

/** Payload for "case:diagnose", "case:decide", "case:verify". */
export interface CaseJobData {
  caseId: string;
}

/** Payload for "case:act" — includes both the case and the specific intervention to execute. */
export interface ActJobData {
  caseId: string;
  interventionId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSES — shapes returned by Next.js route handlers
// ─────────────────────────────────────────────────────────────────────────────

/** Standard API envelope wrapping all route handler responses. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Summary metrics shape for GET /api/metrics/summary. */
export interface MetricsSummary {
  totalAtRisk: number;          // Σ amountAtRisk, all cases
  totalRecovered: number;       // Σ amountRecovered, RECOVERED + PARTIALLY_RECOVERED
  recoveryRate: number;         // 0-1
  costAdjustedRecovery: number; // totalRecovered − Σ costUnits
  byLeakType: Record<
    string,
    {
      atRisk: number;
      recovered: number;
      rate: number;
      count: number;
    }
  >;
  escalationRate: number;       // ESCALATED / total
  stopRate: number;             // STOPPED / total
  medianTimeToRecoveryMs: number;
  p90TimeToRecoveryMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY WEBHOOKS — structures for incoming webhook payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface RazorpayWebhookPayload {
  entity: "event";
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    order?: {
      entity: RazorpayOrderEntity;
    };
    subscription?: {
      entity: RazorpaySubscriptionEntity;
    };
  };
  created_at: number;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: string;
  order_id: string | null;
  invoice_id: string | null;
  international: boolean;
  method: string;
  amount_refunded: number;
  refund_status: string | null;
  captured: boolean;
  description: string;
  card_id: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  email: string;
  contact: string;
  notes: Record<string, string>;
  fee: number | null;
  tax: number | null;
  error_code: string | null;
  error_description: string | null;
  error_source: string | null;
  error_step: string | null;
  error_reason: string | null;
  acquirer_data: Record<string, unknown>;
  created_at: number;
}

export interface RazorpayOrderEntity {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  offer_id: string | null;
  status: string;
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
}

export interface RazorpaySubscriptionEntity {
  id: string;
  entity: "subscription";
  plan_id: string;
  customer_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  quantity: number;
  notes: Record<string, string>;
  charge_at: number | null;
  start_at: number | null;
  end_at: number | null;
  auth_attempts: number;
  total_count: number;
  paid_count: number;
  customer_notify: boolean;
  created_at: number;
  expire_by: number | null;
  short_url: string | null;
  has_scheduled_changes: boolean;
  change_scheduled_at: number | null;
  source: string;
  payment_method: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM PAYLOADS — Expected structured JSON from Claude
// ─────────────────────────────────────────────────────────────────────────────

export type DiagnosisRootCause =
  | "insufficient_funds"
  | "card_expired"
  | "bank_decline_soft"
  | "upi_mandate_failed"
  | "cart_price_shock"
  | "shipping_cost_surprise"
  | "payment_method_missing"
  | "genuine_dispute"
  | "unknown";

export interface DiagnosisOutput {
  root_cause: DiagnosisRootCause;
  confidence: number;
  recommended_urgency: "low" | "medium" | "high";
  reasoning: string;
}

export type DecisionAction =
  | "retry_payment"
  | "send_payment_link"
  | "send_reminder"
  | "offer_promise_to_pay"
  | "escalate_human"
  | "stop";

export type DecisionChannel =
  | "EMAIL"
  | "SMS"
  | "WHATSAPP"
  | "VOICE"
  | "PAYMENT_RETRY"
  | "HUMAN_HANDOFF";

export interface DecisionOutput {
  action: DecisionAction;
  channel: DecisionChannel;
  reasoning: string;
}
