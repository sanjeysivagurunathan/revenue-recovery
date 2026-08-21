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
        h-14 px-5 shrink-0
        border-b border-default surface
      "
    >
      {/* ── Page title ── */}
      <p className="text-sm font-semibold tracking-tight text-foreground">{title}</p>

      {/* ── System status indicator ── */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-4 h-4">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-foreground animate-pulse-dot" />
        </div>
        <span className="text-[11px] text-muted-foreground">Agent active</span>
      </div>
    </header>
  );
}
