import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/hie/client";
import { useSession } from "@/lib/hie/session";
import { CheckCircle2, XCircle } from "lucide-react";
import type { AuditEvent } from "@/lib/hie/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/audit")({ component: AuditPage });

function AuditPage() {
  const { user } = useSession();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [resetting, setResetting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [report, setReport] = useState<{ verified: boolean; corruptionIndex: number | null; details: string } | null>(null);

  async function load() {
    const r = await api.audit();
    setEvents(r.events);
  }

  async function onVerify() {
    setVerifying(true);
    try {
      const r = await api.verifyAudit();
      setReport(r);
    } catch (err) {
      setReport({ verified: false, corruptionIndex: null, details: "Verification request failed" });
    } finally {
      setVerifying(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Evidence</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">Audit trail</h1>
          <p className="mt-2 max-w-xl text-sm text-fg-muted">
            Append-only chain. Each event hashes the previous digest. This is the record a CISO
            would export: who accessed which patient, from where, and why.
          </p>
        </div>
        <div className="flex gap-2">
          {user?.role === "state_admin" || user?.role === "auditor" ? (
            <>
              <Button
                variant="secondary"
                disabled={resetting || verifying}
                onClick={async () => {
                  setResetting(true);
                  await api.reset();
                  await load();
                  setResetting(false);
                  setReport(null);
                }}
              >
                Reset demo data
              </Button>
              <Button
                variant="outline"
                disabled={resetting || verifying}
                onClick={() => void onVerify()}
              >
                {verifying ? "Verifying..." : "Verify Chain Integrity"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {report && (
        <div className={cn(
          "mt-6 flex items-center gap-3 rounded-xl p-4 border",
          report.verified ? "bg-ok-soft border-ok text-ok" : "bg-danger-soft border-danger text-danger"
        )}>
          {report.verified ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
          <div>
            <p className="font-medium">{report.verified ? "Audit Chain Verified" : "Audit Chain Corrupted"}</p>
            <p className="text-sm opacity-90">{report.details}</p>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-x-auto rounded-xl bg-bg-elevated shadow-[var(--shadow-border)]">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-border text-[11px] tracking-[0.12em] text-fg-subtle uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">UHID</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, idx) => {
              // Events are returned in reverse order (latest first)
              // To match the index from verify_audit_chain, we need the original index
              const originalIndex = events.length - 1 - idx;
              const isCorrupted = report && !report.verified && report.corruptionIndex === originalIndex;
              const isVerified = report && report.verified;

              return (
                <tr key={e.id} className={cn(
                  "border-b border-border/70 align-top relative",
                  isCorrupted && "bg-danger-soft/50"
                )}>
                  <td className="px-4 py-3 font-mono text-[11px] whitespace-nowrap text-fg-muted">
                    {e.ts.replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="px-4 py-3">
                    <p>{e.actorName}</p>
                    <p className="text-xs text-fg-subtle">{e.orgName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{e.action}</p>
                    {e.breakGlass ? <Badge tone="warn">break-glass</Badge> : null}
                    {e.reason ? <p className="mt-1 text-xs text-fg-subtle">{e.reason}</p> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">{e.uhid ?? "n/a"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={e.outcome === "denied" ? "danger" : e.outcome === "flagged" ? "warn" : "ok"}>
                        {e.outcome}
                      </Badge>
                      {isVerified && <CheckCircle2 className="size-3 text-ok" />}
                      {isCorrupted && <XCircle className="size-3 text-danger" />}
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-fg-subtle">{e.hash.slice(0, 12)}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
