import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Lock, Shield, Plus, Eye, History } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/hie/client";
import { useSession } from "@/lib/hie/session";
import type { AuditEvent, CareSummary, FhirResource } from "@/lib/hie/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/patient/$uhid")({
  component: PatientSummary,
});

function PatientSummary() {
  const { uhid } = Route.useParams();
  const { user } = useSession();
  const [summary, setSummary] = useState<CareSummary | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [reason, setReason] = useState("Emergency treatment: patient unable to confirm identity history");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<{ resource: FhirResource; title: string } | null>(null);
  const [contributionForm, setContributionForm] = useState({
    type: "Observation",
    value: "",
    date: new Date().toISOString().split("T")[0],
  });

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

  async function onContribute() {
    if (!user?.facilityId) {
      setError("No facility context available for this user");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const link = summary?.sources.find(s => s.facilityId === user.facilityId);
      if (!link) {
        throw new Error(`Patient not linked to your facility (${user.facilityId})`);
      }

      const resource: FhirResource = {
        resourceType: contributionForm.type,
        id: `${user.facilityId}-${Date.now()}`,
        code: { text: contributionForm.value },
        effectiveDateTime: contributionForm.date,
        subject: { reference: `Patient/${link.facilityId}-local` },
      };

      await api.contribute({
        facilityId: user.facilityId,
        localPatientId: `local-pt-${uhid}`,
        resource,
      });

      setShowAddModal(false);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contribution failed");
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
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !summary}
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="mr-1 size-3.5" /> Add Record
          </Button>
          <Link to="/portal/search" className="text-sm text-fg-muted underline-offset-4 hover:underline flex items-center">
            Back to search
          </Link>
        </div>
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
                  resource={r}
                  title={textOf(r, "code")}
                  meta={`${criticality(r)} · ${sourceOf(r)}`}
                  onClick={() => setShowDetailModal({ resource: r, title: "Allergy" })}
                />
              ))}
            </Section>
            <Section title="Medications" empty="No active medication requests.">
              {summary.medications.items.map((r) => (
                <Line
                  key={r.id}
                  resource={r}
                  title={textOf(r, "medicationCodeableConcept")}
                  meta={`${String(r.status)} · ${doseOf(r)} · ${sourceOf(r)}`}
                  onClick={() => setShowDetailModal({ resource: r, title: "Medication" })}
                />
              ))}
            </Section>
            <Section title="Problems" empty="No conditions.">
              {summary.conditions.items.map((r) => (
                <Line key={r.id} resource={r} title={textOf(r, "code")} meta={`${clinicalOf(r)} · ${sourceOf(r)}`} onClick={() => setShowDetailModal({ resource: r, title: "Condition" })} />
              ))}
            </Section>
            <Section title="Encounters" empty="No encounters.">
              {summary.encounters.items.map((r) => (
                <Line
                  key={r.id}
                  resource={r}
                  title={encounterType(r)}
                  meta={`${periodOf(r)} · ${sourceOf(r)}`}
                  onClick={() => setShowDetailModal({ resource: r, title: "Encounter" })}
                />
              ))}
            </Section>
            <Section title="Key labs & vitals" empty="No observations.">
              {summary.observations.items.map((r) => (
                <Line
                  key={r.id}
                  resource={r}
                  title={textOf(r, "code")}
                  meta={`${valueOf(r)} · ${sourceOf(r)}`}
                  onClick={() => setShowDetailModal({ resource: r, title: "Observation" })}
                />
              ))}
            </Section>
            <Section title="Immunizations" empty="None recorded.">
              {summary.immunizations.items.map((r) => (
                <Line
                  key={r.id}
                  resource={r}
                  title={textOf(r, "vaccineCode")}
                  meta={`${String(r.occurrenceDateTime ?? "")} · ${sourceOf(r)}`}
                  onClick={() => setShowDetailModal({ resource: r, title: "Immunization" })}
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

      {/* Add Record Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md rounded-xl p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl tracking-tight">Add Clinical Record</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>✕</Button>
            </div>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void onContribute();
              }}
            >
              <div className="space-y-1.5">
                <Label>Resource Type</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={contributionForm.type}
                  onChange={(e) => setContributionForm({ ...contributionForm, type: e.target.value })}
                >
                  <option value="AllergyIntolerance">Allergy</option>
                  <option value="Condition">Condition / Problem</option>
                  <option value="Observation">Observation / Lab</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Clinical Finding / Value</Label>
                <Input
                  placeholder="e.g. Penicillin allergy or BP 120/80"
                  value={contributionForm.value}
                  onChange={(e) => setContributionForm({ ...contributionForm, value: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={contributionForm.date}
                  onChange={(e) => setContributionForm({ ...contributionForm, date: e.target.value })}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving..." : "Save Record"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl rounded-xl p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl tracking-tight">
              {showDetailModal.title} Detail
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowDetailModal(null)}>✕</Button>
            </div>
            <div className="mt-4 overflow-auto rounded-lg bg-zinc-950 p-4">
              <pre className="text-xs font-mono text-zinc-300">
                {JSON.stringify(showDetailModal.resource, null, 2)}
              </pre>
            </div>
            <div className="mt-6 text-right">
              <Button onClick={() => setShowDetailModal(null)}>Close</Button>
            </div>
          </Card>
        </div>
      )}

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
}) {
  return (
    <Card className="rounded-lg p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="size-3.5 text-fg-subtle" />
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      {children && children.length > 0 ? <div className="space-y-3">{children}</div> : <p className="text-sm text-fg-muted">{empty}</p>}
    </Card>
  );
}

function Line({ title, meta, resource, onClick }) {
  return (
    <div
      className="cursor-pointer hover:bg-bg-elevated p-1 rounded transition-colors"
      onClick={onClick}
    >
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
function attachmentText(r: FhirResource): string {
  const content = r.content as Array<{ attachment?: { data?: string } }> | undefined;
  return content?.[0]?.attachment?.data ?? "";
}
