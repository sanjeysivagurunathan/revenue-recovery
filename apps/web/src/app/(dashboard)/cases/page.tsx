/**
 * apps/web/src/app/(dashboard)/cases/page.tsx
 *
 * Cases list page — shows all revenue-at-risk cases with filter tabs.
 * Populated in Module 6 (Dashboard). Placeholder for Module 1.
 */

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cases" };

export default function CasesPage() {
  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Revenue Cases</h1>
        <p className="text-muted-foreground mt-1">
          Detect, diagnose, and recover revenue leaks in real-time.
        </p>
      </div>

      {/* Placeholder — replaced in Module 6 */}
      <div className="glass-card p-12 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-surface-raised flex items-center justify-center">
          <span className="text-2xl">🔍</span>
        </div>
        <p className="text-muted-foreground text-sm">
          Cases will appear here once the DETECT pipeline is wired up (Module 2).
        </p>
      </div>
    </div>
  );
}
