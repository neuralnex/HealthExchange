import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/hie/client";
import { useSession } from "@/lib/hie/session";
import type { ConsentPolicy, Facility } from "@/lib/hie/types";

const STAR = "NG-IM-00018472";

export const Route = createFileRoute("/portal/consent")({ component: ConsentPage });

function ConsentPage() {
  const { user } = useSession();
  const [policies, setPolicies] = useState<ConsentPolicy[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const uhid = user?.role === "patient" ? STAR : STAR;

  async function load() {
    const [c, f] = await Promise.all([api.listConsent(uhid), api.facilities()]);
    setPolicies(c.policies);
    setFacilities(f.facilities);
  }

  useEffect(() => {
    void load();
  }, []);

  const network = policies.find((p) => p.scope === "network");

  async function setNetwork(directive: "permit" | "deny") {
    await api.consent({
      uhid,
      scope: "network",
      directive,
      note: directive === "deny" ? "Patient withdrew network sharing" : "Patient restored network sharing",
    });
    setNote(
      directive === "deny"
        ? "Network sharing is off. FMC Owerri will be blocked unless they break glass."
        : "Network sharing is on for treatment.",
    );
    await load();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">NDPA 2023 · purpose limitation</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Who may see a summary</h1>
      <p className="mt-3 text-sm text-fg-muted">
        Health data is sensitive personal data. This page is the patient control the demo needs:
        permit or deny the closed network. Hospitals still keep their own records.
      </p>

      <Card className="mt-8 rounded-xl p-5">
        <p className="text-xs text-fg-subtle">UHID {uhid}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">FUTO closed network</p>
            <p className="text-sm text-fg-muted">Treatment and emergency purpose of use</p>
          </div>
          <Badge tone={network?.directive === "permit" ? "ok" : "danger"}>
            {network?.directive ?? "none"}
          </Badge>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void setNetwork("permit")}>Allow sharing</Button>
          <Button variant="secondary" onClick={() => void setNetwork("deny")}>
            Stop sharing
          </Button>
        </div>
        {note ? <p className="mt-4 text-sm text-fg-muted">{note}</p> : null}
      </Card>

      <ul className="mt-6 space-y-2">
        {facilities.map((f) => (
          <li key={f.id}>
            <Card className="flex items-center justify-between rounded-lg p-4">
              <div>
                <p className="text-sm font-medium">{f.shortName}</p>
                <p className="text-xs text-fg-subtle">{f.name}</p>
              </div>
              <Badge>{f.lga}</Badge>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
