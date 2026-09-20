import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/hie/client";
import { useSession } from "@/lib/hie/session";
import type { FhirResource } from "@/lib/hie/types";

export const Route = createFileRoute("/portal/records")({ component: RecordsPage });

function RecordsPage() {
  const { user } = useSession();
  const [patients, setPatients] = useState<FhirResource[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [resources, setResources] = useState<FhirResource[]>([]);

  useEffect(() => {
    if (!user?.facilityId) return;
    void api.patients(user.facilityId).then((r) => setPatients(r.patients));
  }, [user?.facilityId]);

  async function open(id: string) {
    if (!user?.facilityId) return;
    setSelected(id);
    const r = await api.localRecord(user.facilityId, id);
    setResources(r.resources);
  }

  if (!user?.facilityId) {
    return <p className="text-sm text-fg-muted">Campus node users do not host a local FHIR store.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Facility plane</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Local FHIR store</h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        {user.facilityName} remains source of truth. The exchange copies only what a consented
        query needs for this session.
      </p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <ul className="space-y-2">
          {patients.map((p) => {
            const name = (p.name as Array<{ family?: string; given?: string[] }>)?.[0];
            const label = `${name?.given?.join(" ") ?? ""} ${name?.family ?? ""}`.trim();
            const mrn = (p.identifier as Array<{ value?: string }>)?.[0]?.value;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => void open(p.id)}
                  className={`w-full rounded-lg px-3 py-3 text-left shadow-[var(--shadow-border)] ${
                    selected === p.id ? "bg-accent-soft" : "bg-bg-elevated hover:bg-sand"
                  }`}
                >
                  <p className="text-sm font-medium">{label}</p>
                  <p className="font-mono text-[11px] text-fg-subtle">{mrn}</p>
                </button>
              </li>
            );
          })}
        </ul>
        <Card className="rounded-lg p-4">
          {!selected ? (
            <p className="text-sm text-fg-muted">Select a local patient to inspect FHIR resources.</p>
          ) : (
            <ul className="space-y-3">
              {resources.map((r) => (
                <li key={`${r.resourceType}-${r.id}`} className="border-b border-border/80 pb-3 last:border-0">
                  <Badge>{r.resourceType}</Badge>
                  <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-fg-muted">
                    {JSON.stringify(r, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
