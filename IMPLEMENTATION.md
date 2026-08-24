# IMPLEMENTATION.md
## AI Revenue Recovery Agent — Track 03 (Razorpay Buildathon)

> Detect revenue at risk → diagnose root cause → choose the right intervention → execute a bounded, compliant recovery workflow → prove money recovered with an audit trail.

---

## 1. Problem Framing & Scope

Revenue leaks through four channels, and this build treats all four as instances of one state machine (`at_risk → diagnosed → intervening → resolved/failed/escalated`):

| Leak type | Signal source | Example direction covered |
|---|---|---|
| Payment degradation | Razorpay webhooks (`payment.failed`, error codes) | Payment degradation → root cause → recovery |
| Checkout abandonment | Razorpay Checkout / Orders API events | Checkout drop-off recovery |
| Subscription failure | Razorpay Subscriptions webhooks (dunning, `subscription.charged` failures) | Failed-subscription recovery, Mandate retry sequencer |
| Overdue receivables (B2B) | Razorpay Invoices / Payment Links + AR ledger | B2B receivables chaser, Promise-to-pay tracker |

**In scope for the demo build:** all four leak types on synthetic + Razorpay test-mode data, one agent pipeline, one dashboard showing money recovered, full audit trail, hard stopping rules, escalation to a human queue. Hinglish voice recovery is built as a pluggable channel (stretch, see §9).

**Explicitly out of scope:** real money movement (Razorpay test mode only), real customer contact (sandboxed channels/mock providers unless demo explicitly opts in), any legally binding collections action.

---

## 2. Architecture

```
                          ┌─────────────────────────────┐
                          │        Next.js App           │
                          │  (Dashboard + Ops Console)   │
                          │  - Revenue-at-risk feed       │
                          │  - Case detail / timeline     │
                          │  - Recovered ₹ metrics         │
                          │  - Approve/override queue      │
                          └───────────────┬───────────────┘
                                          │ REST/tRPC (internal API)
                          ┌───────────────▼───────────────┐
                          │        API Layer (Next.js       │
                          │        Route Handlers, Node)     │
                          └───────────────┬───────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
   ┌────────▼────────┐         ┌─────────▼─────────┐          ┌────────▼────────┐
   │ Ingestion Workers │         │  Agent Orchestrator │          │  Action Executors │
   │ (BullMQ / Redis)  │         │  (LangGraph-style   │          │  (channel adapters) │
   │ - Razorpay webhooks │       │   state machine +   │          │  - Email (Resend)    │
   │ - Checkout events   │       │   Claude API calls) │          │  - SMS/WhatsApp (Twilio)│
   │ - Invoice/AR sync    │      │  Detect→Diagnose→   │          │  - Retry scheduler    │
   │ - Subscription events │     │  Decide→Act→Verify   │         │  - Razorpay Payment Link gen │
   └────────┬────────┘         └─────────┬─────────┘          └────────┬────────┘
            │                             │                             │
            └─────────────────────────────┼─────────────────────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │           PostgreSQL             │
                          │  cases, events, interventions,    │
                          │  audit_log, policies, recoveries    │
                          └───────────────────────────────────┘
```

**Why this shape:** Next.js gives one deployable surface for both the dashboard and the API layer (route handlers), which matters for a hackathon timeline. The orchestrator is a separate long-running Node worker process (not inside Next's request/response cycle) because agent runs involve waiting on external replies (payment retries, customer responses) — that needs a durable queue, not a serverless function with a timeout.

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui** | Required by brief; App Router gives server components for the dashboard without a separate BFF |
| API | **Next.js Route Handlers** for CRUD/reads; **standalone Node/TypeScript worker service** for the agent loop | Keeps request-scoped work fast; keeps long-running agent work off the web tier |
| Agent orchestration | **Groq (GPT-OSS-120B) / Claude Sonnet** with structured JSON tool-calling, orchestrated as an explicit Inngest durable state machine | Track requires *bounded* workflows with stopping rules — an explicit graph is auditable; a free-roaming agent loop is not |
| Queue / background jobs | **Inngest** (`inngest`) | Serverless durable workflows, step-level replays, built-in delays (`step.sleep`), automatic backoff, and local visual execution dashboard |
| Database | **PostgreSQL + Prisma ORM** | Strong relational fit for cases/events/interventions/audit trail; Prisma gives type-safe queries shared between web and worker |
| Payments | **Razorpay (test mode)**: Orders API, Payment Links, Subscriptions (recurring/mandates via UPI Autopay & e-NACH), Webhooks | This is a Razorpay Buildathon — Razorpay is the payments rail end-to-end: order creation, checkout, retries, subscription dunning, and payment links for receivables all come from one Razorpay integration |
| Receivables / invoicing | **Razorpay Invoices API + Payment Links** for B2B chaser flows | Native Razorpay support for generating and tracking payable links against overdue amounts |
| Messaging channels | **Resend** (email), **Twilio** (SMS/WhatsApp) — both sandboxed/test credentials for demo | Real APIs, safe test channels |
| Voice (stretch) | **Twilio Voice + ElevenLabs/Whisper** for Hinglish TTS/STT | Pluggable channel adapter, not core-path dependency |
| Auth | **NextAuth (Auth.js)** with credentials or magic link for the ops console | Fast to stand up, good enough for a demo login |
| Observability / audit | **Custom `audit_log` table** + **Pino** structured logging shipped to console/file | Every state transition is a DB row, not just a log line — audit trail must survive process restarts |
| Deployment | **Vercel** (Next.js app) + **Railway/Render** (worker + Postgres + Redis) | Fast hackathon deploy path; worker needs a persistent process, which Vercel functions don't provide |

---

## 4. Data Model (Prisma schema)

```prisma
// schema.prisma

enum LeakType {
  PAYMENT_DEGRADATION
  CHECKOUT_ABANDONMENT
  SUBSCRIPTION_FAILURE
  RECEIVABLE_OVERDUE
}

enum CaseStatus {
  DETECTED
  DIAGNOSING
  DIAGNOSED
  INTERVENING
  AWAITING_CUSTOMER
  RECOVERED
  PARTIALLY_RECOVERED
  FAILED
  ESCALATED
  STOPPED
}

enum InterventionChannel {
  EMAIL
  SMS
  WHATSAPP
  VOICE
  PAYMENT_RETRY
  PAYMENT_LINK
  HUMAN_HANDOFF
}

model Customer {
  id            String   @id @default(cuid())
  externalId    String   @unique // Razorpay customer ID or CRM ID
  name          String
  email         String
  phone         String?
  riskScore     Float    @default(0) // rolling churn/dunning risk
  cases         RevenueCase[]
  createdAt     DateTime @default(now())
}

model RevenueCase {
  id                String       @id @default(cuid())
  customerId        String
  customer          Customer     @relation(fields: [customerId], references: [id])
  leakType          LeakType
  status            CaseStatus   @default(DETECTED)
  amountAtRisk      Decimal      @db.Decimal(12, 2)
  currency          String       @default("INR")
  amountRecovered   Decimal      @default(0) @db.Decimal(12, 2)
  sourceRef         String       // Razorpay order/payment/subscription id, or AR invoice #
  rootCause         String?      // set after diagnosis step
  diagnosisPayload  Json?        // structured Claude diagnosis output
  policyId          String?
  policy            RecoveryPolicy? @relation(fields: [policyId], references: [id])
  attemptsUsed      Int          @default(0)
  maxAttempts       Int          @default(3)
  events            CaseEvent[]
  interventions     Intervention[]
  auditEntries      AuditEntry[]
  detectedAt        DateTime     @default(now())
  resolvedAt        DateTime?
  slaDeadline        DateTime?    // stopping-rule deadline
}

model CaseEvent {
  id         String   @id @default(cuid())
  caseId     String
  case       RevenueCase @relation(fields: [caseId], references: [id])
  type       String   // e.g. "webhook.payment.failed", "customer.replied"
  payload    Json
  occurredAt DateTime @default(now())
}

model Intervention {
  id           String   @id @default(cuid())
  caseId       String
  case         RevenueCase @relation(fields: [caseId], references: [id])
  channel      InterventionChannel
  action       String   // e.g. "send_reminder", "retry_payment", "offer_promise_to_pay"
  templateUsed String?
  sentAt       DateTime @default(now())
  outcome      String?  // "delivered", "customer_paid", "no_response", "bounced"
  outcomeAt    DateTime?
  costUnits    Decimal? @db.Decimal(8,4) // for ROI calc: recovered ₹ vs. intervention cost
}

model RecoveryPolicy {
  id              String   @id @default(cuid())
  name            String   // e.g. "B2B receivables — standard"
  leakType        LeakType
  maxAttempts     Int      @default(3)
  cooldownHours   Int      @default(24)
  escalateAfter   Int      @default(3) // attempts before human handoff
  allowedChannels InterventionChannel[]
  quietHoursStart Int?     // compliance: no contact before this local hour
  quietHoursEnd   Int?
  cases           RevenueCase[]
}

model AuditEntry {
  id          String   @id @default(cuid())
  caseId      String
  case        RevenueCase @relation(fields: [caseId], references: [id])
  actor       String   // "agent", "policy_engine", "human:<email>"
  action      String   // "state_transition", "decision", "stop_triggered"
  fromStatus  CaseStatus?
  toStatus    CaseStatus?
  reasoning   String?  // Claude's stated reasoning, stored verbatim for audit
  metadata    Json?
  createdAt   DateTime @default(now())
}
```

---

## 5. Agent Pipeline (explicit state machine, not a free agent loop)

The orchestrator is a deterministic graph with Claude called at two well-scoped decision points only. This is the design choice that satisfies "bounded recovery workflow":

```
DETECT ──▶ DIAGNOSE ──▶ DECIDE ──▶ ACT ──▶ VERIFY ──▶ (loop or resolve)
   │            │            │        │         │
   │            │            │        │         └─▶ RECOVERED / FAILED / ESCALATED
   │            │            │        └─▶ writes Intervention + AuditEntry
   │            │            └─▶ Claude call #2: policy-constrained action choice
   │            └─▶ Claude call #1: structured root-cause classification
   └─▶ pure code: webhook/event normalizer, no LLM
```

### 5.1 DETECT (deterministic, no LLM)
- Razorpay webhooks: `payment.failed`, `payment.authorized` (with `error_code`/`error_reason` for decline diagnostics), `subscription.charged` failures, `subscription.halted`
- Razorpay Orders API polling/webhook for abandoned checkout sessions (order created, no payment captured within a threshold)
- AR sync job flags Razorpay Invoices/Payment Links past due date
- Normalizes into a `RevenueCase` row with `status = DETECTED`

### 5.2 DIAGNOSE (Claude call #1 — classification, not free text)
System prompt constrains Claude to return **structured JSON only**, e.g.:
```json
{
  "root_cause": "insufficient_funds | card_expired | bank_decline_soft | upi_mandate_failed | cart_price_shock | shipping_cost_surprise | payment_method_missing | genuine_dispute | unknown",
  "confidence": 0.0-1.0,
  "recommended_urgency": "low | medium | high",
  "reasoning": "one paragraph, stored for audit"
}
```
Input to the model: normalized event payload + Razorpay `error_code`/`error_description` + customer's last 3 case outcomes (so it isn't diagnosing blind). No PII beyond what's needed (see §8).

### 5.3 DECIDE (Claude call #2 — constrained action selection)
Claude picks **one action from a fixed enum** allowed by the case's `RecoveryPolicy` — it cannot invent a channel or action outside the policy's `allowedChannels`. This is the core guardrail: the LLM chooses *which* permitted action, never *whether* the guardrails apply.

```json
{
  "action": "retry_payment | send_payment_link | send_reminder | offer_promise_to_pay | escalate_human | stop",
  "channel": "EMAIL | SMS | WHATSAPP | VOICE | PAYMENT_RETRY | HUMAN_HANDOFF",
  "reasoning": "..."
}
```

### 5.4 ACT (deterministic executors)
Each action maps to a pure-code executor (no LLM involved in execution):
- `retry_payment` → Razorpay recurring payment retry via Subscriptions API (or fresh Order + auto-recurring charge for UPI Autopay/e-NACH mandates), idempotency handled via Razorpay's `receipt` field
- `send_payment_link` → Razorpay Payment Links API + templated email/SMS with the link
- `send_reminder` → templated message via Resend/Twilio (template chosen from a fixed library, not generated fresh each time — avoids uncontrolled outbound copy)
- `offer_promise_to_pay` → creates a `PromiseToPay` follow-up job, schedules a check-in, optionally pre-generates a Razorpay Payment Link for the promised date
- `escalate_human` → writes to a human review queue, notifies via dashboard
- `stop` → terminal, writes reasoning to audit log

### 5.5 VERIFY (deterministic)
Listens for Razorpay webhook confirmation (`payment.captured`, `order.paid`, `subscription.charged`), updates `amountRecovered`, transitions state.

---

## 6. Stopping Rules & Compliance (the part that makes this "bounded")

Hard-coded, not LLM-decided:

1. **Max attempts** — `RecoveryPolicy.maxAttempts` (default 3). Case auto-escalates to human queue on exceeding this, regardless of what the model recommends.
2. **Cooldown** — minimum `cooldownHours` between contacts on the same case; enforced in the ACT layer before any executor runs.
3. **Quiet hours** — no SMS/WhatsApp/voice contact outside `quietHoursStart`–`quietHoursEnd` in the customer's local time zone.
4. **SLA deadline** — `slaDeadline` on each case; past-deadline cases auto-stop and escalate rather than continuing indefinitely.
5. **Dispute/opt-out kill switch** — any inbound event tagged `dispute_opened` (or a Razorpay `payment.dispute.created` webhook) or `opt_out` immediately sets `status = STOPPED` and blocks all further executors for that customer, independent of the agent's own reasoning.
6. **Spend cap per case** — `Intervention.costUnits` summed per case; hard ceiling stops further paid-channel contact (e.g., voice calls) once exceeded.
7. **Human-in-the-loop for high-value cases** — any case with `amountAtRisk` above a configurable threshold requires human approval before the first outbound action fires, not just after N failures.

All six checks run as a guard function **before** any ACT executor is invoked — the LLM's chosen action is advisory; the guard is what actually gates execution. This is the key architectural point to state in the demo: the agent recommends, code enforces.

---

## 7. Audit Trail Design

Every state transition, every LLM call's structured output, and every executor invocation writes an `AuditEntry`. Minimum fields captured per entry: actor, from/to status, the model's stated reasoning (verbatim), and a metadata blob with the raw structured decision. This gives:

- A replayable timeline per case (dashboard "Case Detail" view renders this directly)
- A defensible record for why a customer was contacted N times ("here's the reasoning at each step")
- The basis for the batch recovery report (§8)

Nothing about execution decisions is inferred after the fact — the audit row is written synchronously in the same transaction as the state transition, so there's no gap between "agent decided" and "we can prove what it decided."

---

## 8. Metrics: Proving Money Recovered

Dashboard's headline view, computed straight from `RevenueCase` + `Intervention`:

- **Recovered ₹** = Σ `amountRecovered` where `status IN (RECOVERED, PARTIALLY_RECOVERED)`
- **Recovery rate** = recovered cases / total cases, segmented by `leakType`
- **Cost-adjusted recovery** = recovered ₹ − Σ `Intervention.costUnits` (shows ROI, not just gross recovery — important since it's easy to "recover" money by over-contacting)
- **Time-to-recovery** = `resolvedAt − detectedAt`, median and p90
- **Escalation rate** = cases that hit `ESCALATED` / total (a rising escalation rate is a signal the policy thresholds need tuning, and it's shown, not hidden)
- **Stop rate & reasons** = breakdown of why cases hit `STOPPED` (compliance, SLA, opt-out) — demonstrates the guardrails are actually firing, not just configured

Batch view: run the pipeline over a seeded dataset (e.g. 200 synthetic cases across all four leak types) and show a before/after — revenue at risk vs. revenue recovered — as the primary demo artifact.

---

## 9. Channel Adapters (pluggable, matches example directions)

| Adapter | Maps to example direction | Notes |
|---|---|---|
| `razorpayRetryAdapter` | Payment degradation, Mandate retry sequencer | Retries failed payments via Razorpay Orders/Subscriptions API with custom backoff keyed to `root_cause`; handles UPI Autopay/e-NACH mandate retries specifically |
| `checkoutRecoveryAdapter` | Checkout drop-off recovery | Triggered on abandoned Razorpay Order (created, unpaid past threshold); sends templated cart-recovery link within policy cooldown |
| `dunningAdapter` | Failed-subscription recovery | Wraps Razorpay Subscriptions dunning webhooks (`subscription.charged` failure, `subscription.halted`) into the same case pipeline |
| `arChaserAdapter` | B2B receivables chaser | Reads from an `Invoice` sync table (mocked ERP/accounting feed for demo); generates Razorpay Payment Links; escalates by seniority of overdue days |
| `promiseToPayAdapter` | Promise-to-pay tracker | Creates a follow-up job at the promised date with a pre-generated Razorpay Payment Link; auto-escalates if the promise is missed |
| `voiceAdapter` (stretch) | Hinglish voice recovery | Twilio Voice + STT/TTS; scripted call flow with fixed prompts, Claude used only to classify customer's spoken intent (pay now / need time / dispute), not to freeform the call |

Each adapter implements one interface (`execute(caseId, action): Promise<InterventionResult>`), so adding a channel doesn't touch the orchestrator.

---

## 10. API Surface (Next.js route handlers)

```
GET    /api/cases                     list cases (filter by leakType, status)
GET    /api/cases/:id                 case detail + full timeline (events, interventions, audit)
POST   /api/cases/:id/approve         human approval for gated high-value cases
POST   /api/cases/:id/stop            manual kill switch
GET    /api/metrics/summary           dashboard headline numbers
GET    /api/metrics/batch/:runId      batch recovery report
POST   /api/webhooks/razorpay         Razorpay event ingestion (signature-verified via webhook secret)
POST   /api/webhooks/twilio           inbound SMS/WhatsApp replies
POST   /api/seed/run-batch            (demo only) seed + run the pipeline over synthetic cases
```

Worker service exposes no public HTTP surface — it consumes BullMQ queues (`case:detect`, `case:diagnose`, `case:decide`, `case:act`, `case:verify`) and writes directly to Postgres.

---

## 11. Repository Structure

```
revenue-recovery/
├── apps/
│   ├── web/                     # Next.js dashboard + API routes
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── cases/
│   │   │   │   ├── metrics/
│   │   │   │   └── policies/
│   │   │   └── api/
│   │   ├── components/
│   │   └── lib/
│   └── worker/                  # Standalone Node/TS orchestrator
│       ├── src/
│       │   ├── pipeline/
│       │   │   ├── detect.ts
│       │   │   ├── diagnose.ts   # Claude call #1
│       │   │   ├── decide.ts     # Claude call #2
│       │   │   ├── act.ts
│       │   │   └── verify.ts
│       │   ├── guardrails/       # stopping rules, §6
│       │   ├── adapters/         # channel adapters, §9
│       │   └── queues/
├── packages/
│   ├── db/                      # Prisma schema + client, shared
│   └── types/                   # shared TS types/enums
├── seed/
│   └── synthetic-cases.ts       # demo dataset generator
└── docker-compose.yml           # Postgres + Redis for local dev
```

---

## 12. Build Plan (hackathon-timeline sequencing)

1. **Hour 0–2**: Prisma schema + Postgres/Redis via docker-compose; Next.js scaffold; worker scaffold with BullMQ wiring (no logic yet, just queue plumbing proven end-to-end).
2. **Hour 2–5**: DETECT — Razorpay test-mode webhook ingestion (`payment.failed`, `subscription.charged`, order-expiry polling); seed script for synthetic AR/receivables cases (since a real ERP feed isn't available in a hackathon).
3. **Hour 5–8**: DIAGNOSE + DECIDE — Claude API calls with strict JSON schema prompts; guardrail layer (§6) built and unit-tested against the state machine *before* wiring real execution.
4. **Hour 8–11**: ACT — email adapter first (fastest to demo reliably), then Razorpay payment retry / Payment Links, then SMS/WhatsApp; audit log writes on every transition.
5. **Hour 11–14**: Dashboard — case list, case detail/timeline, metrics summary; wire `/api/seed/run-batch` so judges can trigger a live batch run.
6. **Hour 14–16**: Batch report polish (recovered ₹, recovery rate, cost-adjusted ROI); record the before/after numbers for the demo narrative.
7. **Stretch, if time remains**: voice adapter (Hinglish), promise-to-pay follow-up scheduling, human-approval UI for high-value cases.

---

## 13. Environment Variables

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ANTHROPIC_API_KEY=...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RESEND_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
HIGH_VALUE_APPROVAL_THRESHOLD=50000   # INR, triggers human gate
```

---

## 14. Demo Script (aligned to "the bar")

1. Show the seeded batch (200 cases, ₹X at risk, split across the four leak types).
2. Trigger `/api/seed/run-batch`; let it run live for ~30–60 seconds.
3. Open a single case's timeline: DETECT → DIAGNOSE (show Claude's structured reasoning) → DECIDE (show the constrained action + why) → ACT → VERIFY, all as literal audit rows.
4. Open the metrics dashboard: recovered ₹, recovery rate by leak type, cost-adjusted ROI, escalation rate, stop-rate breakdown (explicitly show a few cases that were auto-stopped for compliance — this is the strongest evidence of "bounded").
5. Show one high-value case sitting in the human-approval queue, untouched until approved — proves the gate is real, not decorative.

---

## 15. Key Design Decisions Worth Stating Out Loud to Judges

- **The LLM never executes anything directly.** It classifies and recommends within a fixed action enum; a separate deterministic guard layer is what actually authorizes execution. This is what makes the workflow "bounded" rather than an open-ended agent loop.
- **Audit rows are written in the same transaction as state transitions**, not reconstructed from logs afterward.
- **Cost-adjusted recovery is shown, not just gross recovery** — over-contacting customers to force a slightly higher raw recovery number is a real failure mode this design guards against by reporting ROI, not just recovered totals.
- **Razorpay is the single payments rail** for orders, checkout, subscriptions/mandates, and payment links — no third-party payment processor needed, which keeps the integration surface small and fits the buildathon's own ecosystem.
