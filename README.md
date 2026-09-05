# ⚡ Autonomous AI Revenue Recovery Agent
### Razorpay Buildathon — Track 03: AI Revenue Recovery
> **Find revenue that’s slipping away and win it back.**  
> An autonomous, closed-loop AI agent that detects revenue leaks, diagnoses the exact failure root cause, selects optimal compliant interventions, and executes bounded multi-channel recovery workflows with an immutable audit trail.

---

## 🎥 Project Demo Video

> 🔗 **[Click Here to Watch the Full Video Walkthrough on Google Drive](https://drive.google.com/file/d/YOUR_GOOGLE_DRIVE_VIDEO_ID/view?usp=sharing)**  
> *(Replace `YOUR_GOOGLE_DRIVE_VIDEO_ID` with your uploaded video share link)*

---

## 💡 The Problem & "Why Now"

Revenue loss rarely happens in one clean step:
1. **Payment Degradation**: A card decline, bank downtime, or insufficient funds causes a direct payment failure.
2. **Subscription Mandate Failures**: Recurring UPI AutoPay or card mandates fail silently or reach limit limits.
3. **Checkout Drop-offs**: High intent shoppers drop off at the final step due to price surprise or missing payment methods.
4. **B2B Receivables Aging**: Invoices and Net-30 payment links sit unpaid, or trigger unhandled billing disputes.

Traditional dunning tools are **dumb, rigid, and spammy**: they execute naive timer-based retries, bombard customers with generic emails, and fail to distinguish between hard declines, bank server outages, and billing disputes.

### The Solution: An Autonomous, Bounded AI Agent
This agent acts like an autonomous **Chief Revenue Recovery Officer**:
- 🔍 **Instant Detection**: Ingests HMAC-verified Razorpay webhooks and autonomous abandonment cron monitors.
- 🧠 **AI Root-Cause Diagnosis**: Uses Groq (`gpt-oss-120b`) / Claude 3.5 Sonnet to classify failures into structured reasons with confidence scores.
- 🎯 **Bounded Decision Making**: Selects optimal recovery actions (instant payment link, auto-retry, renewal dunning, or human escalation) without hallucinated copy.
- 🚀 **Multi-Channel Orchestration**: Dispatches synchronized HTML Email (Resend) and instant WhatsApp messages (Twilio) with custom payment links.
- 🛡️ **Deterministic Guardrails**: Enforces strict stopping rules, quiet hours (IST 9 AM – 9 PM), dispute kill-switches, max attempt limits, and high-value human approval gates (> ₹50,000).
- 💰 **Measured Money Recovered**: Verifies incoming settlements, auto-dispatches confirmation receipts, and updates real-time ROI metrics.

---

## 🚀 4 End-to-End Revenue Recovery Engines

Our system addresses all 4 key revenue leak directions defined in Track 03:

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           4 CORE REVENUE LEAK ENGINES                             │
├──────────────────────────┬──────────────────────────┬─────────────────────────────┤
│ 1. PAYMENT DEGRADATION   │ 2. SUBSCRIPTION FAILURE  │ 3. CHECKOUT ABANDONMENT     │
│ • payment.failed webhooks│ • subscription.charged   │ • 15-min Inngest scanner    │
│ • Insufficient funds     │ • UPI Autopay mandate    │ • order.abandoned event     │
│ • Card blocked / limits  │ • Card expiration        │ • Cart price-shock dunning  │
│ • Dynamic Payment Links  │ • 1-click mandate update │ • Personalized incentives   │
├──────────────────────────┴──────────────────────────┴─────────────────────────────┤
│ 4. B2B RECEIVABLES CHASER & PROMISE-TO-PAY (PTP) TRACKER                          │
│ • invoice.past_due / receivable overdue ingestion                                 │
│ • Automatic Dispute Escalation vs. Overdue Accounts Payable chaser                │
│ • Promise-to-Pay (PTP) Tracker API (/api/cases/[id]/promise-to-pay)               │
│ • Freezes outreach until promised date; automatically resumes if breached         │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ System Architecture & Workflow

```mermaid
flowchart TD
    subgraph Ingestion["1. DETECT & INGEST"]
        RW[Razorpay Webhook<br/>HMAC-SHA256] -->|payment.failed<br/>subscription.failed<br/>invoice.past_due| API["/api/webhooks/razorpay"]
        CRON[Inngest Cron Scanner] -->|order.abandoned| CD[Checkout Detector]
    end

    subgraph Core["2. DURABLE WORKFLOW (Inngest)"]
        API --> DB[(PostgreSQL + Prisma)]
        CD --> DB
        DB --> PIPE[Revenue Recovery Pipeline]
        
        PIPE --> LLM1[Groq / Claude LLM<br/>Structured Root Cause Diagnosis]
        LLM1 --> LLM2[Groq / Claude LLM<br/>Bounded Action Decision]
        
        LLM2 --> GUARD{Deterministic Guardrails<br/>• Max Attempts<br/>• Quiet Hours<br/>• High-Value Gate<br/>• Dispute Freeze}
    end

    subgraph Action["3. MULTI-CHANNEL EXECUTION"]
        GUARD -->|Safe & Approved| DISPATCH[Outreach Dispatcher]
        GUARD -->|Requires Approval| QUEUE[Human Approval Queue]
        
        DISPATCH --> EMAIL[Resend HTML Email]
        DISPATCH --> WA[Twilio WhatsApp]
        DISPATCH --> PLINK[Razorpay Payment Link API]
    end

    subgraph Verification["4. VERIFY & AUDIT"]
        PLINK --> PAY[Customer Completes Payment]
        PAY --> VERIFY[Razorpay payment_link.paid]
        VERIFY --> DB
        VERIFY --> RECEIPT[Instant Recovery Confirmation<br/>Email + WhatsApp]
        DB --> DASH[Live Real-time Dashboard<br/>Metrics & Audit Trail]
    end
```

---

## 🛡️ Autonomous Pipeline Stages

Each revenue leak moves through an explicit 5-stage state machine:

| Stage | Name | Description |
|---|---|---|
| **1** | **DETECT** | Ingests the leak event, deduplicates by `sourceRef`, extracts customer contact info, and creates a `RevenueCase` in the `DETECTED` status with an initial `AuditEntry`. |
| **2** | **DIAGNOSE** | Runs AI root-cause analysis via Groq/Claude with a strict JSON schema. Categorizes failure (e.g., `insufficient_funds`, `upi_mandate_failed`, `cart_price_shock`, `invoice_dispute`). |
| **3** | **DECIDE** | Evaluates policy rules, customer risk score, and history to choose the optimal action, channel, tone, and retry cadence. |
| **4** | **ACT** | Validates deterministic guardrails. If approved, creates a dynamic Razorpay Payment Link and dispatches synchronized Email + WhatsApp notifications. |
| **5** | **VERIFY** | Waits durably for payment settlement. Upon payment capture, transitions status to `RECOVERED`, issues confirmation receipts, and records recovered revenue in the audit log. |

---

## 📊 Live Interactive Dashboard

The dashboard provides real-time visibility and control:
- **Command Center (`/cases`)**: Live status filters (`DETECTED`, `INTERVENING`, `AWAITING_CUSTOMER`, `RECOVERED`, `ESCALATED`), detailed case drawer, timeline inspection, and Promise-to-Pay logging.
- **Financial Analytics (`/metrics`)**: Total Revenue at Risk, Total Money Recovered, Overall Recovery Rate %, and breakdown by leak type.
- **Human Approval Gate (`/approvals`)**: High-value cases (> ₹50,000) or ambiguous disputes are routed here for 1-click human review.
- **Recovery Policies (`/policies`)**: Configure quiet hours, maximum retry attempts, cooldown delays, and enabled channels per leak type.
- **Complete Audit Trail**: Every AI prompt, diagnosis JSON, guardrail check, and state transition is immutably logged in PostgreSQL.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 15 (App Router)](https://nextjs.org/) + TypeScript + React 19
- **Durable Orchestration**: [Inngest](https://www.inngest.com/) (Durable step execution, event-driven retries, and background crons)
- **AI / LLM Engine**: [Groq API](https://groq.com/) (`openai/gpt-oss-120b`) / [Anthropic Claude 3.5 Sonnet](https://anthropic.com) with strict JSON tool-calling
- **Database & ORM**: PostgreSQL + [Prisma ORM](https://www.prisma.io/) (Decimal precision for INR currency)
- **Payment Infrastructure**: [Razorpay APIs](https://razorpay.com/docs/) (Payment Links, Orders, Subscriptions, Webhooks with HMAC verification)
- **Multi-Channel Communication**: [Resend](https://resend.com/) (HTML Email) & [Twilio](https://twilio.com/) (WhatsApp Sandbox & SMS)
- **Monorepo Tooling**: TurboRepo + Docker Compose

---

## ⚡ Quick Start & Local Setup

### 1. Prerequisites
- **Node.js**: `v20+` & `npm 10+`
- **Docker Desktop**: For PostgreSQL & Redis

### 2. Clone & Install Dependencies
```bash
git clone <your-repository-url>
cd revenue-recovery
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```
Fill in your API keys (Groq / Anthropic, Razorpay Test Keys, Resend, Twilio):
```env
DATABASE_URL="postgresql://revenue:revenue_dev_secret@localhost:5432/revenue_recovery"
REDIS_URL="redis://:redis_dev_secret@localhost:6379"

# AI Provider
GROQ_API_KEY="your-groq-api-key"
GROQ_MODEL="openai/gpt-oss-120b"
# ANTHROPIC_API_KEY="your-anthropic-key" # Optional fallback

# Razorpay Test Credentials
RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="your_razorpay_secret"
RAZORPAY_WEBHOOK_SECRET="Sanjey@45"

# Multi-channel Outbound
RESEND_API_KEY="re_xxxxxxxxxxxx"
RESEND_FROM_EMAIL="onboarding@resend.dev"
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"

# Thresholds
HIGH_VALUE_APPROVAL_THRESHOLD=50000
```

### 4. Start Infrastructure & Database
```bash
# Start Postgres & Redis containers
docker-compose up -d

# Push database schema & generate Prisma client
npm run db:push
npm run db:generate
```

### 5. Launch the Development Servers
Run the Next.js app and Inngest background dev server:

**Terminal 1 — Next.js Web App:**
```bash
npm run dev
# Dashboard opens at http://localhost:3000
```

**Terminal 2 — Inngest Dev Server:**
```bash
npm run inngest:dev
# Inngest dashboard opens at http://localhost:8288
```

---

## 🧪 Judge Testing & Simulation Cheat Sheet

You can test all 4 revenue leak pipelines in real-time using our pre-built CLI simulation scripts. Each script sends an authentic, HMAC-signed Razorpay webhook to your local server.

### 🧹 Optional: Reset Database
To start with a clean slate before testing:
```bash
npm run db:clear
```

---

### Test 1: Payment Degradation (Card / UPI Decline)
Simulates a failed B2C payment (`payment.failed`) due to a blocked card or insufficient funds:
```bash
npx tsx scripts/test-webhook.ts --type payment --error card_blocked --email your_email@example.com --phone +919790317406
```
- **What happens**:
  1. AI diagnoses `card_blocked`.
  2. Generates an alternate Razorpay Payment Link.
  3. Dispatches customized HTML Email and WhatsApp notification.
  4. Case enters `AWAITING_CUSTOMER` state.

---

### Test 2: Subscription Mandate Failure (UPI AutoPay / Card Expired)
Simulates a recurring subscription charge failure (`subscription.charged.failed`):
```bash
npx tsx scripts/test-webhook.ts --type subscription --error upi_mandate_failed --email your_email@example.com --phone +919790317406
```
- **What happens**:
  1. AI diagnoses `upi_mandate_failed`.
  2. Dispatches renewal dunning with a 1-click mandate update payment link.

---

### Test 3: Checkout Abandonment (Cart Drop-off)
Simulates an order created 20 minutes ago that was never paid (`order.abandoned`):
```bash
npx tsx scripts/test-webhook.ts --type checkout --error cart_price_shock --email your_email@example.com --phone +919790317406
```
- **What happens**:
  1. AI diagnoses `cart_price_shock`.
  2. Dispatches a friendly cart recovery reminder with a direct checkout link.

---

### Test 4: B2B Receivable Overdue & Promise-to-Pay
Simulates a past-due B2B invoice (`invoice.past_due`):
```bash
# A. Normal Overdue Invoice (Auto-chased)
npx tsx scripts/test-webhook.ts --type invoice --error overdue_net30 --amount 15000 --email your_email@example.com

# B. Disputed Invoice (Auto-escalates to Human Queue)
npx tsx scripts/test-webhook.ts --type invoice --error invoice_dispute --amount 25000 --email your_email@example.com
```

#### 📅 Testing Promise-to-Pay (PTP):
When a B2B customer promises to pay next week, log the PTP via the dashboard drawer or API:
```bash
curl -X POST http://localhost:3000/api/cases/<CASE_ID>/promise-to-pay \
  -H "Content-Type: application/json" \
  -d '{"promisedDate": "2026-09-12T10:00:00Z", "notes": "Customer confirmed payment next Friday"}'
```
- Outreach is automatically paused until the promised date!

---

### 💰 Test 5: Verify Payment & Recover Revenue
Simulate the customer paying the Razorpay Payment Link to close the loop:
```bash
npx tsx scripts/test-payment-success.ts --caseId <CASE_ID>
```
- **Result**:
  1. Case transitions to `RECOVERED`.
  2. Money is marked as recovered in the metrics.
  3. Customer instantly receives a **Payment Confirmation Receipt** via Email and WhatsApp! 🎉

---

## 📈 Meeting "The Bar"

| Criteria | How Our Agent Delivers |
|---|---|
| **Measured Money Recovered** | Real-time ROI calculation (`amountRecovered` vs `costUnits` per channel) tracked in PostgreSQL and displayed on the `/metrics` dashboard. |
| **Compliant Escalations** | Built-in quiet hours enforcement (IST 9 AM – 9 PM), high-value approval gates (> ₹50,000), and dispute kill-switches. |
| **Stopping Rules** | Enforces maximum attempt limits (default: 3) and hard SLA deadlines; halts automatically upon opt-out or active dispute. |
| **Full Audit Trail** | Every state transition, LLM input/output, guardrail decision, and communication timestamp is recorded in the immutable `AuditEntry` table. |

---

## 📁 Repository Structure

```
revenue-recovery/
├── apps/
│   ├── web/                    # Next.js 15 Dashboard, Webhook API & Inngest Functions
│   │   ├── src/app/            # App router pages (cases, metrics, approvals, policies)
│   │   ├── src/inngest/        # Durable workflows (pipeline.ts, checkoutDetector.ts)
│   │   └── src/inngest/adapters# LLM, Razorpay, Resend, Twilio, and Guardrail adapters
│   └── worker/                 # Standalone background worker (if needed)
├── packages/
│   ├── db/                     # Prisma schema, migrations, and database client
│   └── types/                  # Shared TypeScript interfaces & types
├── scripts/                    # Test simulation CLI scripts for judges
│   ├── test-webhook.ts         # Multi-type Razorpay webhook simulator
│   ├── test-payment-success.ts # Payment capture & recovery simulator
│   ├── test-outreach.ts        # Direct channel testing script
│   └── clear-database.ts       # Database cleanup utility
├── docker-compose.yml          # PostgreSQL & Redis container definitions
├── package.json                # Monorepo scripts & dependencies
└── README.md                   # Project documentation & submission guide
```

---

## 👥 Authors & Team
Built with ❤️ for the **Razorpay Buildathon — Track 03: AI Revenue Recovery**.
