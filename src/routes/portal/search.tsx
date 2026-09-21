import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/hie/client";
import { useSession } from "@/lib/hie/session";
import type { MatchCandidate, SearchQuery } from "@/lib/hie/types";
import { cn } from "@/lib/utils";

type SearchParams = { demo?: string };

export const Route = createFileRoute("/portal/search")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    demo: typeof search.demo === "string" ? search.demo : undefined,
  }),
  component: SearchPage,
});

const DEMO_CHIDINMA: SearchQuery = {
  given: "Chidinma",
  family: "Okafor-Adeyemi",
  birthDate: "1994-03-12",
  sex: "female",
  phone: "08034412291",
  address: "New Owerri",
};

function bandTone(band: MatchCandidate["band"]) {
  if (band === "auto-link" || band === "confirm") return "ok" as const;
  if (band === "workbench") return "warn" as const;
  return "neutral" as const;
}

function SearchPage() {
  const { demo } = Route.useSearch();
  const { user } = useSession();
  const navigate = useNavigate();
  const [query, setQuery] = useState<SearchQuery>(demo === "chidinma" ? DEMO_CHIDINMA : {});
  const [results, setResults] = useState<MatchCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (demo === "chidinma") {
      void run(DEMO_CHIDINMA);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  async function run(q: SearchQuery = query) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.search(q);
      setResults(res.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(c: MatchCandidate) {
    if (!user?.facilityId) {
      void navigate({ to: "/portal/patient/$uhid", params: { uhid: c.uhid } });
      return;
    }
    setConfirming(c.uhid);
    try {
      await api.confirm({
        uhid: c.uhid,
        facilityId: user.facilityId,
        mrn: c.uhid === "NG-IM-00018472" && user.facilityId === "fmco" ? "FMCO-8842" : (c.links.find((l) => l.facilityId === user.facilityId)?.mrn ?? `${user.facilityId.toUpperCase()}-TEMP`),
        queueId: c.uhid === "NG-IM-00018472" ? "q-er-chidinma" : undefined,
      });
      void navigate({ to: "/portal/patient/$uhid", params: { uhid: c.uhid } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm");
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Client registry</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Find a person</h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        Search is demographic, not a full-text chart search. NIN plus date of birth auto-links.
        Name alone never merges.
      </p>

      <form
        className="mt-8 grid gap-3 rounded-xl bg-bg-elevated p-4 shadow-[var(--shadow-border)] md:grid-cols-3 md:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Field label="Given name" value={query.given ?? ""} onChange={(v) => setQuery({ ...query, given: v })} />
        <Field label="Family name" value={query.family ?? ""} onChange={(v) => setQuery({ ...query, family: v })} />
        <Field label="Date of birth" type="date" value={query.birthDate ?? ""} onChange={(v) => setQuery({ ...query, birthDate: v })} />
        <Field label="Phone" value={query.phone ?? ""} onChange={(v) => setQuery({ ...query, phone: v })} />
        <Field label="NIN" value={query.nin ?? ""} onChange={(v) => setQuery({ ...query, nin: v })} />
        <Field label="Address / LGA" value={query.address ?? ""} onChange={(v) => setQuery({ ...query, address: v })} />
        <div className="md:col-span-3 flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" disabled={busy}>
            {busy ? "Matching…" : "Search registry"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setQuery(DEMO_CHIDINMA);
              void run(DEMO_CHIDINMA);
            }}
          >
            Load ER demographics
          </Button>
        </div>
      </form>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      {results ? (
        <ul className="mt-8 space-y-3">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center">
              <p className="text-sm text-fg-muted">No candidates above the review threshold.</p>
              <Button
                className="mt-4"
                variant="secondary"
                onClick={() => void navigate({ to: "/portal/register" })}
              >
                Register New Patient
              </Button>
            </div>
          ) : (
            results.map((c) => (
              <li key={c.uhid}>

                <Card className="rounded-lg p-4 md:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-xl tracking-tight">
                          {c.demographics.given} {c.demographics.family}
                        </h2>
                        <Badge tone={bandTone(c.band)}>{c.band}</Badge>
                        <span className="font-mono text-xs tabular-nums text-fg-muted">
                          {c.score.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-fg-subtle">{c.uhid}</p>
                      <p className="mt-2 text-sm text-fg-muted">
                        {c.demographics.sex} · {c.demographics.birthDate}
                        {c.demographics.nin ? ` · NIN ${c.demographics.nin}` : " · no NIN"}
                        {c.demographics.phone ? ` · ${c.demographics.phone}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-fg-subtle">
                        Known at{" "}
                        {c.links.length
                          ? c.links.map((l) => l.facilityId.toUpperCase()).join(", ")
                          : "no linked facility yet"}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {c.reasons.map((r) => (
                          <li key={r} className="rounded-full bg-sand px-2 py-0.5 text-[11px] text-fg-muted">
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <Button
                        size="sm"
                        disabled={confirming === c.uhid}
                        onClick={() => void confirm(c)}
                      >
                        {c.alreadyLinkedToRequester ? "Open summary" : "Confirm match"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void navigate({ to: "/portal/patient/$uhid", params: { uhid: c.uhid } })
                        }
                      >
                        View without linking
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={cn("space-y-1.5")}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
