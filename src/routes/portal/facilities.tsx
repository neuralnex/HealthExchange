import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/hie/client";
import type { Facility } from "@/lib/hie/types";

export const Route = createFileRoute("/portal/facilities")({ component: FacilitiesPage });

function FacilitiesPage() {
  const [rows, setRows] = useState<Facility[]>([]);
  useEffect(() => {
    void api.facilities().then((r) => setRows(r.facilities));
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Facility registry</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Onboarded sites</h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        The campus node cannot route without knowing the facility. Production onboarding adds
        certificates, a FHIR façade or HL7 v2 feed, and a signed data-sharing agreement.
      </p>
      <ul className="mt-8 space-y-3">
        {rows.map((f) => (
          <li key={f.id}>
            <Card className="rounded-lg p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl tracking-tight">{f.shortName}</p>
                  <p className="text-sm text-fg-muted">{f.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-fg-subtle">
                    {f.code} · {f.fhirBaseUrl}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge>{f.type}</Badge>
                  <Badge tone="ok">{f.status}</Badge>
                </div>
              </div>
              <p className="mt-3 text-sm text-fg-muted">
                {f.lga} LGA, {f.state} State
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
