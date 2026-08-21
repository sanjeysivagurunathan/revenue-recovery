# Revenue Recovery Agent
## AI-Powered Revenue Leak Detection & Recovery — Razorpay Buildathon Track 03

> Detect revenue at risk → diagnose root cause → choose the right intervention → execute a bounded, compliant recovery workflow → prove money recovered with an audit trail.

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+, npm 10+
- Docker Desktop (for Postgres + Redis)

### 1. Clone & install
```bash
git clone <your-repo>
cd revenue-recovery
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your API keys (see §13 in IMPLEMENTATION.md)
```

### 3. Start infrastructure
```bash
docker-compose up -d
```

### 4. Set up database
```bash
npm run db:push          # Push schema to local Postgres
npm run db:generate      # Generate Prisma client
```

### 5. Run the apps
```bash
# Terminal 1 — Next.js dashboard
cd apps/web && npm run dev

# Terminal 2 — Agent worker
cd apps/worker && npm run dev
```

Dashboard: http://localhost:3000

---

## Architecture

```
Next.js App (Dashboard + API)  ←→  Agent Worker (BullMQ)
         ↕                                  ↕
     PostgreSQL              ←→          Redis
```

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the full design.

---

## Module Status

| Module | Description | Status |
|--------|-------------|--------|
| 1 | Scaffold + Infrastructure + Prisma | ✅ Complete |
| 2 | DETECT — Webhook ingestion | 🔜 Next |
| 3 | DIAGNOSE + DECIDE — Claude pipeline | Pending |
| 4 | ACT — Channel adapters | Pending |
| 5 | VERIFY — Payment confirmation | Pending |
| 6 | Dashboard UI | Pending |
| 7 | Seed script + Batch demo | Pending |
