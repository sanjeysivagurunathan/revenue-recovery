/**
 * apps/web/src/app/(dashboard)/cases/page.tsx
 *
 * Cases dashboard page — lists all revenue cases, filters by status/type,
 * and allows clicking a case to open a detailed inspection side-drawer
 * with the full Claude audit timeline.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Eye,
} from "lucide-react";
import { CaseStatus, LeakType } from "@revenue-recovery/types";

export default function CasesPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchCases = async () => {
    setLoading(true);
    try {
      let url = "/api/cases?limit=100";
      if (statusFilter) url += `&status=${statusFilter}`;
      if (typeFilter) url += `&leakType=${typeFilter}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        let filtered = json.data.cases;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (c: any) =>
              c.customer.name.toLowerCase().includes(q) ||
              c.customer.email.toLowerCase().includes(q) ||
              c.sourceRef.toLowerCase().includes(q)
          );
        }
        setCases(filtered);
        setTotal(filtered.length);
      }
    } catch (err) {
      console.error("Failed to load cases", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [statusFilter, typeFilter, searchQuery]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "DETECTED":
        return "badge-brand";
      case "DIAGNOSED":
        return "badge-info";
      case "INTERVENING":
        return "badge-warning";
      case "RECOVERED":
        return "badge-success";
      case "FAILED":
      case "STOPPED":
        return "badge-danger";
      case "ESCALATED":
        return "badge-warning";
      default:
        return "badge-muted";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "RECOVERED":
        return <CheckCircle2 size={14} className="text-success" />;
      case "FAILED":
      case "STOPPED":
        return <XCircle size={14} className="text-danger" />;
      case "INTERVENING":
      case "ESCALATED":
        return <AlertTriangle size={14} className="text-warning" />;
      default:
        return <Clock size={14} className="text-accent" />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 relative min-h-full items-start">
      {/* ── Cases List (Left Side) ── */}
      <div className="flex-1 w-full min-w-0 flex flex-col">
        <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Revenue Cases</h1>
            <p className="text-[11px] text-muted-foreground mt-1">
              Live status of automated interventions and recovery pipelines.
            </p>
            {!loading && <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-[0.08em]">{total} records</p>}
          </div>
          <button
            onClick={fetchCases}
            className="btn btn-ghost py-1.5 px-3 flex items-center gap-1.5 text-xs self-start"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="mb-5 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} />
            <input
              type="text"
              placeholder="Search by customer, email, reference ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full surface border border-border-default rounded pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground"
            />
          </div>

          <div className="flex items-center gap-2 surface border border-border-default rounded px-3 py-2">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm text-foreground focus:outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              {Object.values(CaseStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 surface border border-border-default rounded px-3 py-2">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent text-sm text-foreground focus:outline-none cursor-pointer"
            >
              <option value="">All Leak Types</option>
              {Object.values(LeakType).map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Cases Table ── */}
        {loading && cases.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-16 skeleton w-full" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div className="card p-12 flex flex-col items-center justify-center text-center gap-2">
            <HelpCircle size={32} className="text-muted-foreground opacity-60" />
            <p className="text-sm text-muted-foreground">No matching cases found.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border-default text-muted-foreground text-[10px] uppercase tracking-[0.08em] font-semibold surface-2">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Leak Type</th>
                  <th className="px-4 py-3 text-right">Amount at Risk</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCase(c)}
                    className={`hover:bg-surface-raised transition-colors cursor-pointer ${
                      selectedCase?.id === c.id ? "bg-surface-raised" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{c.customer.name}</div>
                      <div className="text-xs text-muted-foreground">{c.customer.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs text-muted-foreground">{c.sourceRef}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-surface-raised border border-border-default px-2 py-0.5 rounded text-foreground">
                        {c.leakType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {c.currency} {Number(c.amountAtRisk).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${getStatusBadgeClass(c.status)}`}>
                        {getStatusIcon(c.status)}
                        <span className="ml-1">{c.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="btn btn-ghost py-1 px-2.5 text-xs flex items-center gap-1">
                        <Eye size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Case Inspection Sidebar Drawer (Right Side) ── */}
      {selectedCase && (
        <div className="w-full lg:w-[420px] lg:sticky lg:top-0 border border-border-default surface rounded flex flex-col shrink-0 max-h-[calc(100vh-100px)] overflow-hidden transition-all duration-300 z-10">
          <div className="p-4 border-b border-border-default flex items-center justify-between">
            <div>
              <h2 className="text-md font-semibold text-foreground">Case Inspection</h2>
              <code className="text-xs text-muted-foreground">{selectedCase.id}</code>
            </div>
            <button
              onClick={() => setSelectedCase(null)}
              className="text-muted-foreground hover:text-foreground text-sm font-medium"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* ── Customer Details Card ── */}
            <div className="surface-2 rounded p-4 border border-border-default space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Customer Profile
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Name</span>
                  <p className="font-medium text-foreground mt-0.5">{selectedCase.customer.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email</span>
                  <p className="font-medium text-foreground mt-0.5">{selectedCase.customer.email}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone</span>
                  <p className="font-medium text-foreground mt-0.5">{selectedCase.customer.phone || "N/A"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Risk Score</span>
                  <p className="font-medium text-warning mt-0.5">
                    {selectedCase.customer.riskScore * 100}%
                  </p>
                </div>
              </div>
            </div>

            {/* ── Diagnosis Card ── */}
            <div className="surface-2 rounded p-4 border border-border-default space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Agent Diagnosis
              </p>
              <div>
                <span className="text-xs text-muted-foreground">Stated Root Cause</span>
                <p className="text-sm font-medium text-accent mt-0.5 capitalize">
                  {selectedCase.rootCause ? selectedCase.rootCause.replace(/_/g, " ") : "Pending Diagnosis"}
                </p>
              </div>
              {selectedCase.diagnosisPayload && (
                <div className="text-xs surface p-3 rounded border border-border-default mt-2">
                  <p className="font-medium text-foreground mb-1">Reasoning:</p>
                  <p className="text-muted-foreground leading-relaxed">
                    {selectedCase.diagnosisPayload.reasoning}
                  </p>
                </div>
              )}
            </div>

            {/* ── Interactive Audit Timeline ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Audit Timeline
              </p>

              <div className="relative pl-6 border-l border-border-default space-y-6 ml-2">
                {selectedCase.auditEntries?.map((entry: any) => (
                  <div key={entry.id} className="relative">
                    {/* Circle Node */}
                    <div className="absolute -left-[31px] top-0.5 w-4.5 h-4.5 rounded-full border-4 border-surface bg-accent" />

                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-semibold text-foreground">
                          {entry.action.replace(/_/g, " ").toUpperCase()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {entry.reasoning}
                      </p>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <pre className="text-[10px] text-accent bg-surface-2 p-2 rounded border border-border-default mt-2 overflow-x-auto">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}

                {/* Event timeline items */}
                {selectedCase.events?.map((event: any) => (
                  <div key={event.id} className="relative opacity-70">
                    <div className="absolute -left-[30px] top-1 w-3.5 h-3.5 rounded-full border-3 border-surface bg-muted-foreground" />
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-medium text-muted-foreground">{event.type}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(event.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
