import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, History, ArrowLeft } from "lucide-react";
import { api } from "@/lib/hie/client";
import type { AuditEvent } from "@/lib/hie/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/patient/$uhid/access-log")({
  component: PatientAccessLog,
});

function PatientAccessLog() {
  const { uhid } = Route.useParams();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.audit(uhid);
        setEvents(r.events);
      } catch (err) {
        console.error("Failed to load access log", err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [uhid]);

  function translateAction(event: AuditEvent) {
    const action = event.action;
    if (action === "summary.read") return "A healthcare provider viewed your clinical summary.";
    if (action === "clinical.contribute") return "New health data was added to your record.";
    if (action === "mpi.register") return "Your record was registered in the exchange.";
    if (action === "consent.update") return "Your data access preferences were updated.";
    return `System action: ${action}`;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link
            to="/portal/patient/$uhid"
            params={{ uhid }}
            className="mb-2 flex items-center text-xs text-fg-subtle hover:text-fg-muted transition-colors"
          >
            <ArrowLeft className="mr-1 size-3" /> Back to Summary
          </Link>
          <h1 className="font-display text-4xl tracking-tight">Access Log</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Transparency report for <span className="font-mono font-medium text-fg-foreground">{uhid}</span>.
            See who has accessed your data and when.
          </p>
        </div>
        <div className="hidden md:block rounded-full bg-bg-elevated p-3 shadow-[var(--shadow-border)]">
          <History className="size-6 text-fg-subtle" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin size-6 rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-sm text-fg-muted">No access events recorded for this identity.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((e) => (
            <div
              key={e.id}
              className={cn(
                "relative overflow-hidden rounded-xl border p-4 transition-all",
                e.breakGlass
                  ? "bg-danger-soft border-danger shadow-sm"
                  : "bg-bg-elevated border-border shadow-[var(--shadow-border)]"
              )}
            >
              {e.breakGlass && (
                <div className="absolute top-0 right-0 p-1">
                  <Badge tone="danger" className="rounded-bl-lg">Emergency Access</Badge>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className={cn(
                      "text-sm font-medium",
                      e.breakGlass ? "text-danger" : "text-fg-foreground"
                    )}>
                      {translateAction(e)}
                    </p>
                    <p className="mt-1 text-xs text-fg-muted">
                      Accessed by <span className="font-medium text-fg-foreground">{e.actorName}</span> from {e.orgName}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-[11px] text-fg-subtle whitespace-nowrap">
                    {e.ts.replace("T", " ").slice(0, 19)}
                  </p>
                </div>

                {e.breakGlass && e.reason && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg bg-white/50 p-3 text-xs text-danger border border-danger/20">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    <p>
                      <span className="font-semibold">Reason for override:</span> {e.reason}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <Badge tone={e.outcome === "denied" ? "danger" : "ok"} className="size-fit">
                    {e.outcome}
                  </Badge>
                  <p className="font-mono text-[10px] text-fg-subtle uppercase tracking-wider">
                    Event ID: {e.id.slice(-8)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
