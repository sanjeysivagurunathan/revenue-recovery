# Autonomous AI Revenue Recovery Agent
## Razorpay Buildathon — Track 03: AI Revenue Recovery

An autonomous, closed-loop AI agent that detects revenue at risk, diagnoses root causes, selects compliant recovery interventions, and executes bounded multi-channel recovery workflows with an immutable audit trail.

---

## Project Demo Video

Watch the full end-to-end walkthrough on Google Drive:  
**[Google Drive Demo Video Link](https://drive.google.com/file/d/YOUR_GOOGLE_DRIVE_VIDEO_ID/view?usp=sharing)**  
*(Replace `YOUR_GOOGLE_DRIVE_VIDEO_ID` with your shared Google Drive link)*

---

## Overview and Problem Statement

Revenue leakage rarely happens in one clean step. Businesses lose substantial revenue across multiple touchpoints:
1. **Payment Degradation**: Bank declines, card blocks, and insufficient balance cause immediate drop-offs.
2. **Subscription Mandate Failures**: Recurring UPI AutoPay or card mandates fail silently or hit velocity limits.
3. **Checkout Abandonment**: High-intent shoppers drop out at final checkout due to payment friction or pricing surprises.
4. **B2B Receivables Overdue**: Unpaid invoices and Net-30 payment links accumulate without systematic follow-up or dispute triage.

Traditional dunning tools rely on naive, static cron jobs that send generic spam emails on a fixed cadence. They do not diagnose the actual failure reason, cannot adapt their outreach channel or tone, and lack guardrails to prevent customer harassment.

### How This Agent Solves It

This project implements an autonomous revenue recovery agent built directly on top of Razorpay's payment rails and Inngest's durable execution engine:
- **Instant Event Ingestion**: Ingests HMAC-SHA256 verified Razorpay webhooks and runs autonomous checkout abandonment scans.
- **Root-Cause Diagnosis via LLM**: Uses Groq (`openai/gpt-oss-120b`) or Anthropic Claude with strict JSON schemas to categorize failure reasons (such as `insufficient_funds`, `upi_mandate_failed`, `cart_price_shock`, or `invoice_dispute`).
- **Bounded Action Decisions**: The AI selects bounded actions (e.g. generating an alternate Razorpay payment link, dispatching multi-channel dunning, or routing to human review) rather than writing unconstrained messages.
- **Synchronized Multi-Channel Dispatch**: Reaches customers across email (via Resend) and WhatsApp / SMS (via Twilio) with dedicated payment recovery links.
- **Deterministic Guardrails**: Enforces quiet hours (9 AM to 9 PM IST), maximum attempt limits, customer dispute freeze rules, and human approval gates for high-value transactions (> Rs 50,000).
- **Verified Settlement & Recovery**: Listens for incoming payment confirmation webhooks, auto-dispatches payment receipts, updates the recovery metrics, and closes the case.

---

## The Four Implemented Recovery Engines

```
+-----------------------------------------------------------------------------------+
|                            4 CORE REVENUE LEAK ENGINES                            |
+--------------------------+--------------------------+-----------------------------+
| 1. PAYMENT DEGRADATION   | 2. SUBSCRIPTION FAILURE  | 3. CHECKOUT ABANDONMENT     |
| - payment.failed events  | - subscription.charged   | - 15-minute Inngest scanner |
| - Card / bank decline    | - UPI AutoPay failure    | - order.abandoned event     |
| - Insufficient funds     | - Card expiry            | - Cart price-shock dunning  |
| - Dynamic payment links  | - 1-click mandate update | - Personalized incentives   |
+--------------------------+--------------------------+-----------------------------+
| 4. B2B RECEIVABLES CHASER & PROMISE-TO-PAY (PTP) TRACKER                          |
| - invoice.past_due / overdue receivable ingestion                                 |
| - Automated dispute triage (escalates to human review) vs. standard chasing       |
| - Promise-to-Pay API (/api/cases/[id]/promise-to-pay)                             |
| - Pauses outreach until promised date; automatically resumes if breached          |
+-----------------------------------------------------------------------------------+
```

---

## System Architecture

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
        
        LLM2 --> GUARD{Deterministic Guardrails<br/>- Max Attempts<br/>- Quiet Hours<br/>- High-Value Gate<br/>- Dispute Freeze}
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
        DB --> DASH[Live Real-Time Dashboard<br/>Metrics & Audit Trail]
    end
```

---

## State Machine and Lifecycle

Every revenue leak progresses through an explicit state machine:

| Stage | Name | Description |
|---|---|---|
| 1 | DETECT | Ingests the leak event, deduplicates by `sourceRef`, extracts customer details, and creates a `RevenueCase` with status `DETECTED`. |
| 2 | DIAGNOSE | AI model classifies the failure payload into structured root causes with confidence scores. |
| 3 | DECIDE | AI evaluates policy constraints, previous attempts, and customer history to determine the next action and channel. |
| 4 | ACT | Validates deterministic guardrails. If clear, creates a Razorpay Payment Link and sends coordinated Email + WhatsApp messages. |
| 5 | VERIFY | Durably waits for payment. Upon capture, transitions status to `RECOVERED`, dispatches a receipt, and updates financial metrics. |

---

## Dashboard Capabilities

- **Case Management (`/cases`)**: Filter by status (`DETECTED`, `INTERVENING`, `AWAITING_CUSTOMER`, `RECOVERED`, `ESCALATED`, `STOPPED`), inspect full event payloads, view timeline logs, and record Promise-to-Pay dates.
- **Financial Metrics (`/metrics`)**: Displays real-time total revenue at risk, total recovered amount, recovery rate percentage, and breakdown by leak type.
- **Human Approval Queue (`/approvals`)**: High-value cases exceeding the threshold (Rs 50,000) or flagged disputes require explicit operator approval before outreach.
- **Configurable Policies (`/policies`)**: Adjust allowed channels, retry limits, cooldown periods, and quiet hour boundaries.
- **Immutable Audit Trail**: Synchronously records every state transition, LLM output, guardrail check, and dispatch timestamp into the PostgreSQL database.

---

## Tech Stack

- **Application Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Durable Orchestration**: Inngest
- **AI / LLM Engine**: Groq (`openai/gpt-oss-120b`) / Anthropic Claude 3.5 Sonnet (Structured JSON outputs)
- **Database & ORM**: PostgreSQL with Prisma ORM (Decimal fields for exact INR handling)
- **Payment Gateway**: Razorpay (Payment Links API, Orders API, Subscriptions API, Webhook HMAC Verification)
- **Outbound Channels**: Resend (Email), Twilio (WhatsApp Sandbox and SMS)
- **Monorepo Management**: TurboRepo, Docker Compose

---

## Quick Start and Local Setup

### Prerequisites
- Node.js 20 or higher, npm 10 or higher
- Docker Desktop (for local PostgreSQL and Redis containers)

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd revenue-recovery
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure the following variables are set in `.env`:
```env
DATABASE_URL="postgresql://revenue:revenue_dev_secret@localhost:5432/revenue_recovery"
REDIS_URL="redis://:redis_dev_secret@localhost:6379"

# LLM Configuration
GROQ_API_KEY="your-groq-api-key"
GROQ_MODEL="openai/gpt-oss-120b"
# ANTHROPIC_API_KEY="your-anthropic-key" # Optional fallback

# Razorpay Test Mode Credentials
RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="your_razorpay_secret"
RAZORPAY_WEBHOOK_SECRET="Sanjey@45"

# Multi-channel Outbound
RESEND_API_KEY="re_xxxxxxxxxxxx"
RESEND_FROM_EMAIL="onboarding@resend.dev"
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"

# Business Logic
HIGH_VALUE_APPROVAL_THRESHOLD=50000
```

### 3. Start Database and Push Schema
```bash
# Start Docker containers
docker-compose up -d

# Sync schema and generate Prisma client
npm run db:push
npm run db:generate
```

### 4. Run Development Servers
Open two terminal tabs:

**Terminal 1 — Next.js Application:**
```bash
npm run dev
# Dashboard available at: http://localhost:3000
```

**Terminal 2 — Inngest Dev Server:**
```bash
npm run inngest:dev
# Inngest Dev Dashboard available at: http://localhost:8288
```

---

## CLI Simulation and Testing Guide for Judges

We have included simulation scripts that generate authentic, HMAC-signed Razorpay webhooks to exercise the entire pipeline end-to-end.

### Optional: Clean Database
To reset the database before running tests:
```bash
npm run db:clear
```

---

### Scenario 1: Payment Degradation (B2C Card / Bank Failure)
Simulate an e-commerce checkout failure (`payment.failed`):
```bash
npx tsx scripts/test-webhook.ts --type payment --error card_blocked --email your_email@example.com --phone +919790317406
```
- **Execution Flow**:
  1. Ingests webhook and records case.
  2. AI diagnoses `card_blocked`.
  3. Creates a new Razorpay Payment Link.
  4. Sends email and WhatsApp notification to customer with the recovery link.
  5. Case transitions to `AWAITING_CUSTOMER`.

---

### Scenario 2: Subscription Mandate Failure (UPI AutoPay / Card Expired)
Simulate a failed recurring subscription charge (`subscription.charged.failed`):
```bash
npx tsx scripts/test-webhook.ts --type subscription --error upi_mandate_failed --email your_email@example.com --phone +919790317406
```
- **Execution Flow**:
  1. AI diagnoses `upi_mandate_failed`.
  2. Generates renewal dunning with a 1-click mandate update link.
  3. Sends renewal alert via email and WhatsApp.

---

### Scenario 3: Checkout Abandonment (Cart Drop-off)
Simulate an abandoned checkout created 20 minutes prior (`order.abandoned`):
```bash
npx tsx scripts/test-webhook.ts --type checkout --error cart_price_shock --email your_email@example.com --phone +919790317406
```
- **Execution Flow**:
  1. AI diagnoses cart price hesitation.
  2. Dispatches a checkout reminder link to complete the purchase.

---

### Scenario 4: B2B Receivable Overdue & Promise-to-Pay
Simulate past-due corporate receivables (`invoice.past_due`):

```bash
# Standard overdue invoice (autonomous chasing)
npx tsx scripts/test-webhook.ts --type invoice --error overdue_net30 --amount 15000 --email your_email@example.com

# Disputed invoice (automatically escalated to human review)
npx tsx scripts/test-webhook.ts --type invoice --error invoice_dispute --amount 25000 --email your_email@example.com
```

#### Promise-to-Pay (PTP) Logging:
When a customer confirms a future payment commitment, log the date via the dashboard or API:
```bash
curl -X POST http://localhost:3000/api/cases/<CASE_ID>/promise-to-pay \
  -H "Content-Type: application/json" \
  -d '{"promisedDate": "2026-09-12T10:00:00Z", "notes": "Customer accounts payable agreed to settle next Friday"}'
```
- The agent automatically freezes outreach until the promised date arrives.

---

### Scenario 5: Verify Settlement & Recover Revenue
Simulate the customer completing the payment to close the recovery loop:
```bash
npx tsx scripts/test-payment-success.ts --caseId <CASE_ID>
```
- **Execution Flow**:
  1. Ingests `payment_link.paid` webhook.
  2. Transitions case status to `RECOVERED`.
  3. Updates the dashboard financial analytics in real time.
  4. Automatically sends a payment confirmation receipt via email and WhatsApp.

---

## Evaluation Criteria Breakdown

| Requirement | Implementation Detail |
|---|---|
| **Measured Money Recovered** | Exact decimal tracking of `amountAtRisk` vs `amountRecovered` in PostgreSQL. Live ROI and recovery metrics computed on `/metrics`. |
| **Compliant Escalations** | Quiet hours enforcement (9 AM to 9 PM IST), high-value approval gates (> Rs 50,000), and dispute detection kill-switches. |
| **Stopping Rules** | Maximum attempt bounds (3 attempts default) and hard SLA deadlines. Cases auto-stop upon customer dispute or resolution. |
| **Complete Audit Trail** | Every webhook event, LLM prompt, diagnosis output, guardrail evaluation, and message dispatch is saved in the `AuditEntry` table. |

---

## Directory Structure

```
revenue-recovery/
├── apps/
│   ├── web/                    # Next.js 15 dashboard, webhook API, and Inngest workflows
│   │   ├── src/app/            # Dashboard pages (cases, metrics, approvals, policies)
│   │   ├── src/inngest/        # Durable pipelines (pipeline.ts, checkoutAbandonmentDetector.ts)
│   │   └── src/inngest/adapters# LLM, Razorpay, Resend, Twilio, and Guardrails adapters
│   └── worker/                 # Background worker processes
├── packages/
│   ├── db/                     # Prisma schema, database client, and migrations
│   └── types/                  # Shared TypeScript types and interfaces
├── scripts/                    # Test simulation scripts for judges
│   ├── test-webhook.ts         # Multi-scenario webhook simulation script
│   ├── test-payment-success.ts # Payment capture and recovery simulation script
│   ├── test-outreach.ts        # Outbound channel connectivity test script
│   └── clear-database.ts       # Database cleanup utility
├── docker-compose.yml          # PostgreSQL and Redis container specifications
├── package.json                # Project configuration and workspaces
└── README.md                   # Project documentation and submission guide
```

---

## Authors & Submission Note
Built for the **Razorpay Buildathon — Track 03: AI Revenue Recovery**.
