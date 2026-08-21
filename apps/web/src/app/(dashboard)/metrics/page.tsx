/**
 * apps/web/src/app/(dashboard)/metrics/page.tsx
 * Placeholder — implemented in Module 6.
 */

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Metrics" };

export default function MetricsPage() {
  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Recovery Metrics</h1>
        <p className="text-muted-foreground mt-1">
          Recovered ₹, recovery rate, cost-adjusted ROI, and escalation breakdown.
        </p>
      </div>
      <div className="glass-card p-12 flex items-center justify-center text-muted-foreground text-sm">
        Metrics charts — implemented in Module 6.
      </div>
    </div>
  );
}
