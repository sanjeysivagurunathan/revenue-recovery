/**
 * apps/web/src/app/(dashboard)/approvals/page.tsx
 *
 * Human approval queue — high-value cases awaiting ops sign-off (§6 rule 7).
 * Placeholder — implemented in Module 6.
 */

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Approval Queue" };

export default function ApprovalsPage() {
  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Approval Queue</h1>
        <p className="text-muted-foreground mt-1">
          High-value cases that require human sign-off before the first action fires.
        </p>
      </div>
      <div className="glass-card p-12 flex items-center justify-center text-muted-foreground text-sm">
        Approval queue — implemented in Module 6.
      </div>
    </div>
  );
}
