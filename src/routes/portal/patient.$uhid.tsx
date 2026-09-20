import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Lock, Shield } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/hie/client";
import type { AuditEvent, CareSummary, FhirResource } from "@/lib/hie/types";

export const Route = createFileRoute("/portal/patient/$uhid")({
  component: PatientSummary,
});

function PatientSummary() {
  const { uhid } = Route.useParams();
  const [summary, setSummary] = useState<CareSummary | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [reason, setReason] = useState("Emergency treatment: patient unable to confirm identity history");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    setDenied(null);
    try {
      const s = await api.summary(uhid, "treatment");
      setSummary(s);
      const a = await api.audit(uhid);
      setAudit(a.events);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "CONSENT_DENIED") {
        setDenied(e.message);
        setSummary(null);
        const a = await api.audit(uhid).catch(() => ({ events: [] }));
        setAudit(a.events);
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }, [uhid]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onBreakGlass() {
    setBusy(true);
    setError(null);
    try {
      const s = await api.breakGlass(uhid, reason);
      setSummary(s);
      setDenied(null);
      const a = await api.audit(uhid);
      setAudit(a.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override failed");
    } finally {
      setBusy(false);
    }
  }

  const d = summary?.patient;
  const penicillin = summary?.allergies.items.find((a) =>
    String((a.code as { text?: string })?.text ?? "").toLowerCase().includes("penicillin"),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Care summary</p>
          <h1 className="mt-1 font-display text-4xl tracking-tight">
            {d ? `${d.given} ${d.family}` : uhid}
          </h1>
          {d ? (
            <p className="mt-1 font-mono text-xs text-fg-muted">
              {uhid}
              {d.nin ? ` · NIN ${d.nin}` : " · NIN not on file"}
              {` · ${d.birthDate} · ${d.sex}`}
            </p>
          ) : (
            <p className="mt-1 font-mono text-xs text-fg-muted">{uhid}</p>
          )}
        </div>
        <Link to="/portal/search" className="text-sm text-fg-muted underline-offset-4 hover:underline">
          Back to search
        </Link>
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      {denied ? (
        <Card className="mt-6 rounded-xl border-0 bg-danger-soft p-5">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 text-danger" />
            <div className="flex-1">
              <h2 className="font-medium text-danger">Consent does not allow this retrieve</h2>
              <p className="mt-1 text-sm text-fg-muted">{denied}</p>
              <p className="mt-4 text-xs text-fg-muted">
                Emergency break-glass writes a flagged audit event and requires a reason. It is
                reviewed after the fact.
              </p>
              <Textarea
                className="mt-3 bg-bg-elevated"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button className="mt-3" variant="danger" disabled={busy || !reason.trim()} onClick={() => void onBreakGlass()}>
                Break glass
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {summary?.consent.directive === "break-glass" ? (
        <div className="mt-6 flex items-start gap-3 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Emergency override in effect. {summary.consent.note}
        </div>
      ) : null}

      {penicillin ? (
        <div className="mt-6 flex items-start gap-3 rounded-lg bg-danger-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-medium text-danger">Severe penicillin allergy</p>
            <p className="text-sm text-fg-muted">
              {String((penicillin.reaction as Array<{ manifestation?: Array<{ text?: string }> }>)?.[0]?.manifestation?.[0]?.text ??
                (penicillin.code as { text?: string })?.text)}
              {penicillin.meta && typeof penicillin.meta === "object" && "source" in penicillin.meta
                ? ` · source ${(penicillin.meta as { source: string }).source}`
                : ""}
            </p>
          </div>
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge tone={summary.consent.directive === "permit" ? "ok" : "warn"}>
              {summary.consent.directive}
            </Badge>
            {summary.sources.map((s) => (
              <Badge key={s.facilityId}>{s.facilityName}</Badge>
            ))}
            <span className="self-center font-mono text-[11px] text-fg-subtle">
              assembled {summary.elapsedMs} ms
            </span>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Section title="Allergies" empty="No allergies on file.">
              {summary.allergies.items.map((r) => (
                <Line
                  key={r.id}
                  title={textOf(r, "code")}
                  meta={`${criticality(r)} · ${sourceOf(r)}`}
                />
              ))}
            </Section>
            <Section title="Medications" empty="No active medication requests.">
              {summary.medications.items.map((r) => (
                <Line
                  key={r.id}
                  title={textOf(r, "medicationCodeableConcept")}
                  meta={`${String(r.status)} · ${doseOf(r)} · ${sourceOf(r)}`}
                />
              ))}
            </Section>
            <Section title="Problems" empty="No conditions.">
              {summary.conditions.items.map((r) => (
                <Line key={r.id} title={textOf(r, "code")} meta={`${clinicalOf(r)} · ${sourceOf(r)}`} />
              ))}
            </Section>
            <Section title="Encounters" empty="No encounters.">
              {summary.encounters.items.map((r) => (
                <Line
                  key={r.id}
                  title={encounterType(r)}
                  meta={`${periodOf(r)} · ${sourceOf(r)}`}
                />
              ))}
            </Section>
            <Section title="Key labs & vitals" empty="No observations.">
              {summary.observations.items.map((r) => (
                <Line
                  key={r.id}
                  title={textOf(r, "code")}
                  meta={`${valueOf(r)} · ${sourceOf(r)}`}
                />
              ))}
            </Section>
            <Section title="Immunizations" empty="None recorded.">
              {summary.immunizations.items.map((r) => (
                <Line
                  key={r.id}
                  title={textOf(r, "vaccineCode")}
                  meta={`${String(r.occurrenceDateTime ?? "")} · ${sourceOf(r)}`}
                />
              ))}
            </Section>
          </div>

          {summary.documents.items.length ? (
            <Section title="Discharge documents" empty="">
              {summary.documents.items.map((r) => (
                <article key={r.id} className="rounded-md bg-sand/60 p-3">
                  <p className="text-sm font-medium">{String(r.description ?? "Document")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
                    {attachmentText(r)}
                  </p>
                  <p className="mt-2 text-[11px] text-fg-subtle">{sourceOf(r)}</p>
                </article>
              ))}
            </Section>
          ) : null}
        </>
      ) : busy && !denied ? (
        <p className="mt-8 text-sm text-fg-muted">Assembling federated summary…</p>
      ) : null}

      <div className="mt-10">
        <h2 className="font-display text-2xl tracking-tight">Audit for this UHID</h2>
        <ul className="mt-3 divide-y divide-border rounded-xl bg-bg-elevated shadow-[var(--shadow-border)]">
          {audit.slice(0, 12).map((e) => (
            <li key={e.id} className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm">
                  {e.actorName} · {e.action}
                  {e.breakGlass ? (
                    <Badge tone="warn" className="ml-2">
                      break-glass
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-fg-subtle">
                  {e.orgName} · {e.outcome}
                  {e.reason ? ` · ${e.reason}` : ""}
                </p>
              </div>
              <p className="font-mono text-[11px] text-fg-subtle">{e.ts.replace("T", " ").slice(0, 19)}</p>
            </li>
          ))}
          {audit.length === 0 ? (
            <li className="px-4 py-6 text-sm text-fg-muted">No events yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card className="rounded-lg p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="size-3.5 text-fg-subtle" />
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      {has ? <div className="space-y-3">{children}</div> : <p className="text-sm text-fg-muted">{empty}</p>}
    </Card>
  );
}

function Line({ title, meta }: { title: string; meta: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-fg-subtle">{meta}</p>
    </div>
  );
}

function textOf(r: FhirResource, key: string): string {
  const v = r[key] as { text?: string } | undefined;
  return v?.text ?? r.id;
}
function sourceOf(r: FhirResource): string {
  const meta = r.meta as { source?: string } | undefined;
  return meta?.source ?? "source";
}
function criticality(r: FhirResource): string {
  return String(r.criticality ?? "unspecified");
}
function clinicalOf(r: FhirResource): string {
  const s = r.clinicalStatus as { coding?: Array<{ code?: string }> } | undefined;
  return s?.coding?.[0]?.code ?? "";
}
function doseOf(r: FhirResource): string {
  const d = r.dosageInstruction as Array<{ text?: string }> | undefined;
  return d?.[0]?.text ?? "";
}
function encounterType(r: FhirResource): string {
  const t = r.type as Array<{ text?: string }> | undefined;
  return t?.[0]?.text ?? String(r.id);
}
function periodOf(r: FhirResource): string {
  const p = r.period as { start?: string; end?: string } | undefined;
  if (!p?.start) return "";
  return p.end ? `${p.start.slice(0, 10)} – ${p.end.slice(0, 10)}` : `${p.start.slice(0, 10)} (open)`;
}
function valueOf(r: FhirResource): string {
  const q = r.valueQuantity as { value?: string; unit?: string } | undefined;
  if (!q) return "";
  return `${q.value ?? ""} ${q.unit ?? ""}`.trim();
}
function attachmentText(r: FhirResource): string {
  const content = r.content as Array<{ attachment?: { data?: string } }> | undefined;
  return content?.[0]?.attachment?.data ?? "";
}
