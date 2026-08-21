/**
 * apps/worker/src/workers/detect.worker.ts
 *
 * BullMQ worker for the DETECT pipeline stage (§5.1).
 *
 * Consumes jobs from the "case:detect" queue.
 * Each job carries a DetectJobData payload with the raw Razorpay webhook
 * or polling result. This worker normalises it into a RevenueCase row
 * and enqueues a "case:diagnose" job.
 *
 * ⚠️  STUB — full implementation in Module 2.
 *     The worker is registered here so the entrypoint compiles, and the
 *     queue plumbing is proven end-to-end before the logic is added.
 */

import { Worker, type Job } from "bullmq";
import type { DetectJobData, RazorpayWebhookPayload } from "@revenue-recovery/types";
import { LeakType, CaseStatus, prisma } from "@revenue-recovery/db";
import { createRedisConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { diagnoseQueue } from "../lib/queues.js";

export const DETECT_QUEUE = "case:detect";

/** Helper to extract customer details from Razorpay payload safely */
function extractCustomerData(payload: RazorpayWebhookPayload) {
  const payment = payload.payload.payment?.entity;
  const sub = payload.payload.subscription?.entity;
  
  // Use payment details first if available, fallback to subscription id as externalId
  const externalId = sub?.customer_id || payment?.email || "unknown";
  const email = payment?.email || "unknown@example.com";
  const phone = payment?.contact || null;
  const name = payment?.email ? payment.email.split("@")[0] : "Unknown User";

  // Amount at risk is always in subunits (paise for INR)
  const amountAtRisk = payment?.amount ? payment.amount / 100 : 0;
  const currency = payment?.currency || "INR";

  return { externalId, email, phone, name, amountAtRisk, currency };
}

export function registerDetectWorker(): Worker {
  const worker = new Worker<DetectJobData>(
    DETECT_QUEUE,
    async (job: Job<DetectJobData>) => {
      const { sourceRef, leakType, rawPayload } = job.data;
      logger.info({ jobId: job.id, sourceRef, leakType }, "[DETECT] Processing job");

      const payload = rawPayload as RazorpayWebhookPayload;
      const custData = extractCustomerData(payload);

      // 1. Find or create Customer
      const customer = await prisma.customer.upsert({
        where: { externalId: custData.externalId },
        update: { email: custData.email, phone: custData.phone },
        create: {
          externalId: custData.externalId,
          email: custData.email,
          phone: custData.phone,
          name: custData.name ?? "Unknown User",
        },
      });

      // 2. Idempotency check: see if case already exists for this sourceRef
      const existingCase = await prisma.revenueCase.findFirst({
        where: { sourceRef },
      });

      let caseId = existingCase?.id;

      if (!existingCase) {
        // 3. Create Case
        const newCase = await prisma.revenueCase.create({
          data: {
            customerId: customer.id,
            leakType: leakType as LeakType,
            status: CaseStatus.DETECTED,
            sourceRef,
            amountAtRisk: custData.amountAtRisk,
            currency: custData.currency,
            // Link to a default policy if needed (hardcoded to generic limits for now)
          },
        });
        caseId = newCase.id;

        // 4. Audit Trail for case creation
        await prisma.auditEntry.create({
          data: {
            caseId: newCase.id,
            actor: "system:webhook",
            action: "state_transition",
            toStatus: CaseStatus.DETECTED,
            reasoning: `New leak detected via Razorpay webhook (${payload.event})`,
          },
        });
      }

      // 5. Always record the incoming event
      await prisma.caseEvent.create({
        data: {
          caseId: caseId as string,
          type: `webhook.${payload.event}`,
          payload: payload as any,
        },
      });

      // 6. Push to next stage
      if (!existingCase || existingCase.status === CaseStatus.DETECTED) {
        await diagnoseQueue.add("diagnose", { caseId });
        logger.info({ caseId }, "[DETECT] Passed case to DIAGNOSE queue");
      } else {
        logger.info({ caseId, status: existingCase.status }, "[DETECT] Event attached to existing active case");
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "[DETECT] Job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "[DETECT] Job failed"));

  return worker;
}
