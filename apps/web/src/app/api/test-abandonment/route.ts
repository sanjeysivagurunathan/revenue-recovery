/**
 * apps/web/src/app/api/test-abandonment/route.ts
 * DEV-ONLY endpoint: dispatches a CHECKOUT_ABANDONMENT leak event into Inngest.
 */

import { type NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { LeakType } from "@revenue-recovery/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();
  const {
    email = "guest@example.com",
    name,
    phone,
    amountPaise = 299900,
    currency = "INR",
    abandonmentReason = "cart_price_shock",
    cartItems = "2x Product A, 1x Product B",
  } = body;

  const orderId = body.sourceRef || `order_${Math.random().toString(36).substring(2, 12)}`;
  const abandonedAtSec = Math.floor(Date.now() / 1000) - 20 * 60;

  const rawPayload = {
    event: "order.abandoned",
    payload: {
      order: {
        entity: {
          id: orderId,
          entity: "order",
          amount: amountPaise,
          amount_paid: 0,
          amount_due: amountPaise,
          currency,
          receipt: `rcpt_${orderId.slice(-8)}`,
          status: "created",
          attempts: 0,
          notes: {
            customer_name: name || email.split("@")[0],
            email,
            phone: phone || null,
            cart_items: cartItems,
            abandonment_reason: abandonmentReason,
          },
          created_at: abandonedAtSec,
        },
      },
    },
    created_at: abandonedAtSec,
    email,
    name: name || email.split("@")[0],
    phone: phone || null,
  };

  await inngest.send({
    name: "revenue/leak.detected",
    data: {
      sourceRef: orderId,
      leakType: LeakType.CHECKOUT_ABANDONMENT,
      receivedAt: new Date().toISOString(),
      rawPayload,
    },
  });

  return NextResponse.json({
    success: true,
    received: true,
    orderId,
    leakType: LeakType.CHECKOUT_ABANDONMENT,
  });
}
