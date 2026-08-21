/**
 * apps/web/src/app/(dashboard)/approvals/page.tsx
 *
 * Approvals Queue — displays high-value cases blocked by the approval guardrail.
 * Operators can inspect the Claude diagnosis and manually approve/override them.
 */

"use client";

import { useEffect, useState } from "react";
import { Check, AlertTriangle, UserCheck, RefreshCw } from "lucide-react";

export default function ApprovalsPage() {
  const [escalatedCases, setEscalatedCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchEscalatedCases = async () => {
    setLoading(true);
    try {
      // Escalated status corresponds to cases requiring human approval / review
      const res = await fetch("/api/cases?status=ESCALATED");
      const json = await res.json();
      if (json.success) {
        setEscalatedCases(json.data.cases);
      }
    } catch (err) {
      console.error("Failed to load approvals", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscalatedCases();
  }, []);

  const handleApprove = async (caseId: string) => {
    setProcessingId(caseId);
    try {
      const res = await fetch(`/api/cases/${caseId}/approve`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        // Remove from list
        setEscalatedCases((prev) => prev.filter((c) => c.id !== caseId));
      } else {
        alert(json.error ?? "Failed to approve case");
      }
    } catch (err) {
      console.error(err);
      alert("Error approving case");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="animate-fade-in-up">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Approval Queue</h1>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-2xl">
            High-value cases requiring explicit operator sign-off before automated retry/contact sequences fire.
          </p>
        </div>
        <button
          onClick={fetchEscalatedCases}
          className="btn btn-ghost py-1.5 px-3 flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 skeleton w-full" />
          <div className="h-24 skeleton w-full" />
        </div>
      ) : escalatedCases.length === 0 ? (
        <div className="card p-12 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-12 h-12 rounded border border-border-default surface-2 flex items-center justify-center text-success">
            <UserCheck size={22} />
          </div>
          <div>
            <h3 className="text-md font-medium text-foreground">All Clear!</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              No high-value cases currently require operator intervention or approval.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {escalatedCases.map((c) => (
            <div key={c.id} className="card p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-l-2 border-l-warning">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">CASE #{c.id.slice(-6)}</span>
                  <span className="badge badge-warning flex items-center gap-1">
                    <AlertTriangle size={10} /> Pending Ops Approval
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase">Customer</span>
                    <p className="font-semibold text-foreground text-sm mt-0.5">{c.customer.name}</p>
                    <p className="text-xs text-muted-foreground">{c.customer.email}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase">Amount At Risk</span>
                    <p className="font-semibold text-foreground text-sm mt-0.5">
                      {c.currency} {Number(c.amountAtRisk).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase">Stated Diagnosis</span>
                    <p className="font-medium text-accent text-sm mt-0.5 capitalize">
                      {c.rootCause?.replace(/_/g, " ") ?? "Pending Diagnosis"}
                    </p>
                  </div>
                </div>

                {c.diagnosisPayload && (
                  <div className="surface p-3 rounded border border-border-default text-xs text-muted-foreground max-w-3xl">
                    <span className="font-semibold text-foreground">Claude reasoning:</span> {c.diagnosisPayload.reasoning}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                <button
                  onClick={() => handleApprove(c.id)}
                  disabled={processingId === c.id}
                  className="btn btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5"
                >
                  {processingId === c.id ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Approve Interventions
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
