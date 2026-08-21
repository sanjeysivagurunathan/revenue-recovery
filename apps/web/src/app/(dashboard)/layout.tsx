/**
 * apps/web/src/app/(dashboard)/layout.tsx
 *
 * Dashboard shell layout — wraps all dashboard pages with:
 *   - Sidebar navigation (Cases / Metrics / Policies / Approval Queue)
 *   - Top header bar with system status indicator
 *
 * Uses a CSS grid: sidebar (fixed width) + main content area (flexible).
 */

import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Fixed sidebar ── */}
      <Sidebar />

      {/* ── Main content area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 min-h-0 overflow-y-auto p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
