/**
 * apps/web/src/inngest/checkoutAbandonmentDetector.ts
 *
 * Inngest cron function: runs every 15 minutes and scans Razorpay for
 * unpaid orders (created state) older than 15 minutes = abandoned checkouts.
 * Each novel abandonment fires a `revenue/leak.detected` event so the
 * standard 6-step recovery pipeline handles it end-to-end.
 */

import { inngest } from "./client";
import { prisma, CaseStatus } from "@revenue-recovery/db";
import { LeakType } from "@revenue-recovery/types";

export const checkoutAbandonmentDetectorFunction = inngest.createFunction(
  {
    id: "checkout-abandonment-detector",
    name: "Checkout Abandonment Detector (Cron)",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }: any) => {
    /* ── STEP 1: Fetch unpaid Razorpay orders from the last 30 minutes ── */
    const abandonedOrders = await step.run("fetch-abandoned-orders", async () => {
      const key = process.env["RAZORPAY_KEY_ID"];
      const secret = process.env["RAZORPAY_KEY_SECRET"];

      if (!key || !secret) {
        console.warn("[AbandonmentDetector] Razorpay credentials not configured — skipping.");
        return [];
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const windowStartSec = nowSec - 30 * 60;
      const abandonThresholdSec = nowSec - 15 * 60;

      try {
        const credentials = Buffer.from(`${key}:${secret}`).toString("base64");
        const res = await fetch(
          `https://api.razorpay.com/v1/orders?from=${windowStartSec}&to=${nowSec}&count=100&status=created`,
          {
            headers: {
              Authorization: `Basic ${credentials}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!res.ok) {
          console.warn(`[AbandonmentDetector] Razorpay Orders API returned ${res.status}`);
          return [];
        }

        const data = await res.json();
        const allOrders: any[] = data.items ?? [];
        const abandoned = allOrders.filter(
          (o: any) => o.status === "created" && o.created_at <= abandonThresholdSec
        );

        console.log(
          `[AbandonmentDetector] ${allOrders.length} recent orders, ${abandoned.length} abandoned (>15 min unpaid).`
        );
        return abandoned;
      } catch (err: any) {
        console.error("[AbandonmentDetector] Error fetching orders:", err.message);
        return [];
      }
    });

    if (!abandonedOrders || abandonedOrders.length === 0) {
      return { detected: 0 };
    }

    /* ── STEP 2: Deduplicate against existing open cases ─────────────── */
    const newAbandonments = await step.run("deduplicate-cases", async () => {
      const existingRefs = await prisma.revenueCase.findMany({
        where: {
          sourceRef: { in: abandonedOrders.map((o: any) => o.id) },
          status: { notIn: [CaseStatus.RECOVERED, CaseStatus.FAILED, CaseStatus.STOPPED] },
        },
        select: { sourceRef: true },
      });

      const existingRefSet = new Set(existingRefs.map((r) => r.sourceRef));
      return abandonedOrders.filter((o: any) => !existingRefSet.has(o.id));
    });

    if (!newAbandonments || newAbandonments.length === 0) {
      return { detected: 0, note: "All abandonments already tracked" };
    }

    /* ── STEP 3: Fire revenue/leak.detected for each abandonment ─────── */
    await step.run("fire-abandonment-events", async () => {
      const events = newAbandonments.map((order: any) => {
        const email =
          order.notes?.email ||
          order.notes?.customer_email ||
          `guest_${order.id.slice(-6)}@checkout.unknown`;
        const name = order.notes?.name || order.notes?.customer_name || email.split("@")[0];
        const phone = order.notes?.phone || order.notes?.contact || null;

        return {
          name: "revenue/leak.detected" as const,
          data: {
            sourceRef: order.id,
            leakType: LeakType.CHECKOUT_ABANDONMENT,
            receivedAt: new Date().toISOString(),
            rawPayload: {
              event: "order.abandoned",
              payload: {
                order: {
                  entity: {
                    id: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    status: order.status,
                    notes: order.notes ?? {},
                    created_at: order.created_at,
                    receipt: order.receipt,
                  },
                },
              },
              email,
              name,
              phone,
            },
          },
        };
      });

      await inngest.send(events);
      console.log(`[AbandonmentDetector] Fired ${events.length} abandonment leak events.`);
    });

    return { detected: newAbandonments.length };
  }
);
