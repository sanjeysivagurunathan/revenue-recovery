/**
 * apps/web/src/components/layout/Header.tsx
 *
 * Top header bar — shows the current page context and a live
 * "agent status" pulse indicator (green = running, grey = idle).
 */

"use client";

import { usePathname } from "next/navigation";

/** Maps pathname prefix to a human-readable page title */
function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/cases")) return "Cases";
  if (pathname.startsWith("/metrics")) return "Metrics";
  if (pathname.startsWith("/policies")) return "Policies";
  if (pathname.startsWith("/approvals")) return "Approval Queue";
  return "Dashboard";
}

export function Header() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header
      className="
        flex items-center justify-between
        h-14 px-6 shrink-0
        border-b border-default bg-surface
      "
    >
      {/* ── Page title ── */}
      <p className="text-sm font-semibold text-foreground">{title}</p>

      {/* ── System status indicator ── */}
      <div className="flex items-center gap-2">
        {/* Animated pulse dot — green indicates the agent worker is connected */}
        <div className="relative flex items-center justify-center w-5 h-5">
          <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-green-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse-dot" />
        </div>
        <span className="text-xs text-muted-foreground">Agent active</span>
      </div>
    </header>
  );
}
