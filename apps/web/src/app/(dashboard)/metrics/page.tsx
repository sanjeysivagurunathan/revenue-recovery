/**
 * apps/web/src/app/(dashboard)/metrics/page.tsx
 *
 * Metrics Dashboard — displays core KPIs, cost-adjusted recovery ROI,
 * and leak-type performance breakdowns with dynamic charts.
 */

"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  DollarSign,
  Percent,
  Clock,
  ShieldAlert,
  BarChart,
  RefreshCw,
} from "lucide-react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MetricsSummary } from "@revenue-recovery/types";

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/metrics/summary");
      const json = await res.json();
      if (json.success) {
        setMetrics(json.data);
      }
    } catch (err) {
      console.error("Failed to load metrics", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading || !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 skeleton w-full" />
          ))}
        </div>
        <div className="h-96 skeleton w-full" />
      </div>
    );
  }

  // Format chart data from metrics
  const chartData = Object.entries(metrics.byLeakType).map(([leakType, data]: [string, any]) => ({
    name: leakType.replace(/_/g, " ").toLowerCase(),
    "At Risk (₹)": data.atRisk,
    "Recovered (₹)": data.recovered,
    "Recovery Rate (%)": Math.round(data.rate * 100),
  }));

  const formatHours = (ms: number) => {
    const hours = ms / (1000 * 60 * 60);
    return hours < 1 ? "< 1h" : `${hours.toFixed(1)}h`;
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Recovery Performance</h1>
          <p className="text-[11px] text-muted-foreground mt-1">
            Operational dashboard proving money recovered and pipeline ROI.
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          className="btn btn-ghost py-1.5 px-3 flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Total Recovered */}
        <div className="card p-4 flex flex-col justify-between min-h-[126px]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Recovered</span>
            <div className="p-1 rounded bg-success/20 text-success border border-border-default">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="text-xl font-semibold tracking-tight text-foreground mt-3">
            INR {metrics.totalRecovered.toLocaleString()}
          </p>
          <span className="text-[10px] text-muted-foreground mt-1">
            Total recovered cash value
          </span>
        </div>

        {/* Recovery Rate */}
        <div className="card p-4 flex flex-col justify-between min-h-[126px]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Recovery Rate</span>
            <div className="p-1 rounded bg-accent/20 text-accent border border-border-default">
              <Percent size={16} />
            </div>
          </div>
          <p className="text-xl font-semibold tracking-tight text-foreground mt-3">
            {(metrics.recoveryRate * 100).toFixed(1)}%
          </p>
          <span className="text-[10px] text-muted-foreground mt-1">
            Percentage of all resolved cases
          </span>
        </div>

        {/* Cost Adjusted Recovery (ROI) */}
        <div className="card p-4 flex flex-col justify-between min-h-[126px]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Net ROI</span>
            <div className="p-1 rounded bg-success/20 text-success border border-border-default">
              <DollarSign size={16} />
            </div>
          </div>
          <p className="text-xl font-semibold tracking-tight text-foreground mt-3">
            INR {metrics.costAdjustedRecovery.toLocaleString()}
          </p>
          <span className="text-[10px] text-muted-foreground mt-1">
            Adjusted for channel costs
          </span>
        </div>

        {/* Median Time to Recovery */}
        <div className="card p-4 flex flex-col justify-between min-h-[126px]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Median Recovery Time</span>
            <div className="p-1 rounded bg-info/20 text-info border border-border-default">
              <Clock size={16} />
            </div>
          </div>
          <p className="text-xl font-semibold tracking-tight text-foreground mt-3">
            {formatHours(metrics.medianTimeToRecoveryMs)}
          </p>
          <span className="text-[10px] text-muted-foreground mt-1">
            P90 is {formatHours(metrics.p90TimeToRecoveryMs)}
          </span>
        </div>
      </div>

      {/* ── Main Charts Area ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Leak Type Breakdown Chart */}
        <div className="card p-4 lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart size={18} className="text-accent" />
            <h3 className="text-sm font-semibold text-foreground">Recovery by Leak Type</h3>
          </div>
          <div className="h-72 w-full text-xs">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No performance data to display.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="hsl(var(--foreground-muted))" />
                  <YAxis stroke="hsl(var(--foreground-muted))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--surface))",
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar dataKey="At Risk (₹)" fill="hsl(var(--brand) / 0.35)" radius={0} />
                  <Bar dataKey="Recovered (₹)" fill="hsl(var(--success))" radius={0} />
                </RechartsBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Stopping Rule Compliance Performance */}
        <div className="card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-warning" />
            <h3 className="text-sm font-semibold text-foreground">Stopping & Escalation Metrics</h3>
          </div>
          
          <div className="space-y-4 text-xs">
            <div className="surface-2 rounded p-3 border border-border-default space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Escalation Rate</span>
                <span className="font-semibold text-warning">{(metrics.escalationRate * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-surface h-2 rounded overflow-hidden">
                <div 
                  className="bg-warning h-full" 
                  style={{ width: `${metrics.escalationRate * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Cases pushed to manual ops queues when automated retry limits are hit.
              </p>
            </div>

            <div className="surface-2 rounded p-3 border border-border-default space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Stop/Compliance Rate</span>
                <span className="font-semibold text-danger">{(metrics.stopRate * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-surface h-2 rounded overflow-hidden">
                <div 
                  className="bg-danger h-full" 
                  style={{ width: `${metrics.stopRate * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Cases terminated early due to quiet hours, opt-outs, or customer disputes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
