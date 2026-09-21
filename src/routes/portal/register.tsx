import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/hie/client";
import { useSession } from "@/lib/hie/session";
import type { Demographics } from "@/lib/hie/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardWarning, setGuardWarning] = useState<{ uhid: string; score: number } | null>(null);

  const [form, setForm] = useState<Demographics & { mrn: string }>({
    given: "",
    family: "",
    otherNames: "",
    sex: "male",
    birthDate: "",
    phone: "",
    nin: "",
    addressLine: "",
    city: "",
    lga: "",
    state: "",
    mrn: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setGuardWarning(null);

    try {
      // 1. Matching Guard: check for existing records
      const searchResults = await api.search({
        given: form.given,
        family: form.family,
        birthDate: form.birthDate,
        sex: form.sex,
        phone: form.phone,
        nin: form.nin,
        address: form.addressLine,
      });

      const bestMatch = searchResults.candidates[0];
      if (bestMatch && (bestMatch.band === "auto-link" || bestMatch.score > 0.85)) {
        setGuardWarning({ uhid: bestMatch.uhid, score: bestMatch.score });
        setBusy(false);
        return;
      }

      // 2. Proceed to Registration
      const result = await api.register({
        demographics: form,
        mrn: form.mrn,
      });

      void navigate({
        to: "/portal/patient/$uhid",
        params: { uhid: result.client.uhid },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Patient Onboarding</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Register New Patient</h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        Create a new global identity for a patient. The system will check for existing records to prevent duplicates.
      </p>

      <form
        className="mt-8 grid gap-6 rounded-xl bg-bg-elevated p-6 shadow-[var(--shadow-border)] md:p-8"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <h3 className="md:col-span-3 font-display text-lg">Primary Identity</h3>
          <Field label="Given name" value={form.given} onChange={(v) => setForm({ ...form, given: v })} required />
          <Field label="Family name" value={form.family} onChange={(v) => setForm({ ...form, family: v })} required />
          <Field label="Other names" value={form.otherNames} onChange={(v) => setForm({ ...form, otherNames: v })} />
          <Field label="Date of birth" type="date" value={form.birthDate} onChange={(v) => setForm({ ...form, birthDate: v })} required />
          <Field label="Sex" type="select" value={form.sex} onChange={(v) => setForm({ ...form, sex: v as "male" | "female" })} required />
          <Field label="Local MRN" value={form.mrn} onChange={(v) => setForm({ ...form, mrn: v })} required />
        </div>

        <div className="grid gap-4 md:grid-cols-3 border-t pt-6">
          <h3 className="md:col-span-3 font-display text-lg">Government ID</h3>
          <Field label="NIN" value={form.nin} onChange={(v) => setForm({ ...form, nin: v })} />
          <div className="md:col-span-2 text-xs text-fg-muted italic">
            NIN is highly recommended for precise identity resolution.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 border-t pt-6">
          <h3 className="md:col-span-3 font-display text-lg">Contact & Location</h3>
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="Address" value={form.addressLine} onChange={(v) => setForm({ ...form, addressLine: v })} />
          <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
          <Field label="LGA" value={form.lga} onChange={(v) => setForm({ ...form, lga: v })} />
          <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/portal/search" })}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Processing..." : "Complete Registration"}
          </Button>
        </div>
      </form>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {guardWarning && (
        <Card className="mt-8 rounded-xl border-warn bg-warn/10 p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-warn">
              <span className="text-lg font-bold">⚠️ Duplicate Warning</span>
            </div>
            <p className="text-sm text-fg-muted">
              A highly similar patient record already exists (UHID: <span className="font-mono font-bold">{guardWarning.uhid}</span>)
              with a match score of {(guardWarning.score * 100).toFixed(1)}%.
            </p>
            <div className="flex gap-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setGuardWarning(null);
                  void navigate({ to: "/portal/search" });
                }}
              >
                Link to Existing instead
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setGuardWarning(null);
                  // In a real app, we'd skip the guard check on the next submit
                  // For this prototype, we just warn and let the user try again or override
                }}
              >
                Create New Anyway
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={required ? "after:content-['*'] after:ml-0.5 after:text-danger" : ""}>
        {label}
      </Label>
      {type === "select" ? (
        <select
          id={id}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      ) : (
        <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
