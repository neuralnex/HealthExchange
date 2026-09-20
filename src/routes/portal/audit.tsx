import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/hie/client";
import { useSession } from "@/lib/hie/session";
import type { AuditEvent } from "@/lib/hie/types";

export const Route = createFileRoute("/portal/audit")({ component: AuditPage });

function AuditPage() {
  const { user } = useSession();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [resetting, setResetting] = useState(false);

  async function load() {
    const r = await api.audit();
    setEvents(r.events);
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
        {user?.role === "state_admin" || user?.role === "auditor" ? (
          <Button
            variant="secondary"
            disabled={resetting}
            onClick={async () => {
              setResetting(true);
              await api.reset();
              await load();
              setResetting(false);
            }}
          >
            Reset demo data
          </Button>
        ) : null}
      </div>

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
            {events.map((e) => (
              <tr key={e.id} className="border-b border-border/70 align-top">
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
                  <Badge tone={e.outcome === "denied" ? "danger" : e.outcome === "flagged" ? "warn" : "ok"}>
                    {e.outcome}
                  </Badge>
                  <p className="mt-1 font-mono text-[10px] text-fg-subtle">{e.hash.slice(0, 12)}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
