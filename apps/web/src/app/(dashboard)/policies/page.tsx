/**
 * apps/web/src/app/(dashboard)/policies/page.tsx
 *
 * Policies dashboard — displays the hard constraints (cooldowns, quiet hours, allowed channels)
 * that govern the AI agent. Server-rendered directly from Prisma.
 */

import { prisma } from "@revenue-recovery/db";
import { Shield, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Recovery Policies" };
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const policies = await prisma.recoveryPolicy.findMany();

  // Default fallback policies to show if DB isn't seeded yet
  const defaultPolicies = [
    {
      id: "default-1",
      name: "Standard Payment Degradation Policy",
      leakType: "PAYMENT_DEGRADATION",
      maxAttempts: 3,
      cooldownHours: 24,
      allowedChannels: ["PAYMENT_RETRY", "EMAIL"],
      quietHoursStart: 22,
      quietHoursEnd: 8,
    },
    {
      id: "default-2",
      name: "Checkout Abandonment Policy",
      leakType: "CHECKOUT_ABANDONMENT",
      maxAttempts: 2,
      cooldownHours: 12,
      allowedChannels: ["EMAIL", "SMS", "WHATSAPP"],
      quietHoursStart: 20,
      quietHoursEnd: 9,
    },
    {
      id: "default-3",
      name: "Subscription Failure Recovery",
      leakType: "SUBSCRIPTION_FAILURE",
      maxAttempts: 4,
      cooldownHours: 48,
      allowedChannels: ["PAYMENT_RETRY", "EMAIL", "SMS"],
      quietHoursStart: 21,
      quietHoursEnd: 8,
    },
  ];

  const displayPolicies = policies.length > 0 ? policies : defaultPolicies;

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Recovery Policies</h1>
        <p className="text-[11px] text-muted-foreground mt-1">
          Operational guardrails and constraints enforcing strict compliance boundary rules.
        </p>
      </div>

      {/* ── Policies Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {displayPolicies.map((p) => (
          <div key={p.id} className="card p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{p.name}</h3>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-[0.08em] block mt-1">
                    {p.leakType.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="p-1 rounded bg-accent/20 text-accent border border-border-default">
                  <Shield size={16} />
                </div>
              </div>

              <hr className="border-border-default" />

              {/* Policy parameters */}
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Max Recovery Attempts</span>
                  <span className="font-semibold text-foreground">{p.maxAttempts} tries</span>
                </div>
                <div className="flex justify-between">
                  <span>Cooldown Between Tries</span>
                  <span className="font-semibold text-foreground">{p.cooldownHours} hours</span>
                </div>
                <div className="flex justify-between">
                  <span>Quiet Hours Enforced</span>
                  <span className="font-semibold text-foreground">
                    {p.quietHoursStart && p.quietHoursEnd
                      ? `${p.quietHoursStart}:00 to ${p.quietHoursEnd}:00`
                      : "None"}
                  </span>
                </div>
              </div>
            </div>

            {/* Allowed Channels */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                Approved Outreach Channels
              </p>
              <div className="flex flex-wrap gap-1.5">
                {p.allowedChannels.map((channel) => (
                  <span
                    key={channel}
                    className="text-[10px] font-medium surface-2 border border-border-default px-2 py-1 rounded text-foreground flex items-center gap-1"
                  >
                    <CheckCircle2 size={10} className="text-success" />
                    {channel}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
