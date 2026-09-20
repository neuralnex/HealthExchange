import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/hie/client";
import { useSession } from "@/lib/hie/session";

export const Route = createFileRoute("/portal/")({ component: Overview });

function Overview() {
  const { user } = useSession();
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    void api.stats().then((r) => setStats(r.stats));
  }, []);

  if (!user) return null;

  if (user.role === "patient") {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Patient portal</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Your sharing choices</h1>
        <p className="mt-3 text-fg-muted">
          U-HRES does not keep a copy of your chart. It only remembers which hospitals know you,
          and whether they may retrieve a summary for treatment.
        </p>
        <Link
          to="/portal/consent"
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Manage consent <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Campus digital health plane</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">
        {user.facilityId ? user.facilityName : "FUTO Health Exchange"}
      </h1>
      <p className="mt-3 max-w-2xl text-fg-muted">
        Signed in as {user.title} {user.name}
        {user.specialty ? `, ${user.specialty}` : ""}. Clinical data stays at the source EMR. This
        node locates the person, checks consent, and returns a minimum care summary.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Facilities" value={stats?.facilities} />
        <Stat label="Client registry" value={stats?.clients} />
        <Stat label="Record links" value={stats?.links} />
        <Stat label="Pending matches" value={stats?.pendingMatches} />
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="rounded-xl p-6">
          <Badge tone="danger">ER scenario</Badge>
          <h2 className="mt-4 font-display text-2xl tracking-tight">
            Chidinma arrives at FMC Owerri from FUTO Medical Centre
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Same woman, different name at registration: Okafor versus Okafor-Adeyemi. FUTO Medical Centre holds
            a penicillin anaphylaxis. FMC Owerri triage does not. Confirm the match, pull the summary,
            then try flipping consent off.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/portal/search"
              search={{ demo: "chidinma" }}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
            >
              Run the lookup
              <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/portal/records"
              className="inline-flex h-11 items-center rounded-md bg-sand px-4 text-sm font-medium"
            >
              Open local FHIR store
            </Link>
          </div>
        </Card>

        <Card className="rounded-xl p-6">
          <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">What the node stores</p>
          <ul className="mt-4 space-y-3 text-sm text-fg-muted">
            <li>UHID ↔ NIN ↔ facility MRNs</li>
            <li>Record locator (who has which categories)</li>
            <li>Consent and purpose-of-use</li>
            <li>Hash-chained audit events</li>
          </ul>
          <p className="mt-6 flex items-start gap-2 text-xs text-fg-subtle">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            Not stored: full notes, imaging, billing, or a national warehouse of charts.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <Card className="rounded-lg p-4">
      <p className="text-[11px] tracking-[0.14em] text-fg-subtle uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums leading-none">{value ?? "-"}</p>
    </Card>
  );
}
