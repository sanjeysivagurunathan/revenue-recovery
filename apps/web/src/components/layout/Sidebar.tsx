/**
 * apps/web/src/components/layout/Sidebar.tsx
 *
 * Left sidebar navigation for the ops console dashboard.
 * Links: Cases | Metrics | Policies | Approval Queue
 *
 * Uses Next.js <Link> for client-side navigation and
 * usePathname() to highlight the active route.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  Shield,
  UserCheck,
  Zap,
} from "lucide-react";

/** Navigation item definition */
interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string; // e.g. count of pending approvals
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/cases",
    label: "Cases",
    icon: <AlertCircle size={18} />,
  },
  {
    href: "/metrics",
    label: "Metrics",
    icon: <BarChart3 size={18} />,
  },
  {
    href: "/policies",
    label: "Policies",
    icon: <Shield size={18} />,
  },
  {
    href: "/approvals",
    label: "Approvals",
    icon: <UserCheck size={18} />,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{ width: "var(--sidebar-width)" }}
      className="
        flex flex-col shrink-0 h-full
        surface border-r border-default
        overflow-y-auto
      "
    >
      {/* ── Brand / logo ── */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-default">
        <div
          className="
            w-8 h-8 rounded flex items-center justify-center
            bg-foreground text-background border border-foreground
          "
        >
          <Zap size={15} />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-foreground leading-none">
            Revenue
          </p>
          <p className="text-[11px] text-muted-foreground leading-none mt-1">
            Recovery Agent
          </p>
        </div>
      </div>

      {/* ── Navigation links ── */}
      <nav className="flex-1 px-3 py-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded
                text-sm font-medium transition-all duration-150
                ${
                  isActive
                    ? "bg-surface-raised text-foreground border border-default"
                    : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                }
              `}
            >
              <span className={isActive ? "text-foreground" : ""}>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span
                  className="
                    text-xs font-semibold px-1.5 py-0.5 rounded
                    bg-danger/20 text-danger
                  "
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer / version ── */}
      <div className="px-5 py-3.5 border-t border-default">
        <p className="text-[11px] text-muted-foreground">
          Razorpay Buildathon · Track 03
        </p>
        <p className="text-[10px] text-muted-foreground opacity-60 mt-0.5">v0.1.0</p>
      </div>
    </aside>
  );
}
