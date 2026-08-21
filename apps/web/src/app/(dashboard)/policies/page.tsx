/**
 * apps/web/src/app/(dashboard)/policies/page.tsx
 * Placeholder — implemented in Module 6.
 */

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Policies" };

export default function PoliciesPage() {
  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Recovery Policies</h1>
        <p className="text-muted-foreground mt-1">
          Configure max attempts, cooldowns, quiet hours, and allowed channels per leak type.
        </p>
      </div>
      <div className="glass-card p-12 flex items-center justify-center text-muted-foreground text-sm">
        Policy editor — implemented in Module 6.
      </div>
    </div>
  );
}
