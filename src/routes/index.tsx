import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/hie/client";
import { useSession } from "@/lib/hie/session";
import type { SessionUser } from "@/lib/hie/types";
import { cn } from "@/lib/utils";

type Persona = SessionUser & { email: string; passwordHint: string };

const ROSTER: Persona[] = [
  {
    id: "prac-emeeka",
    email: "emeeka.nwosu@fmcowerri.gov.ng",
    passwordHint: "FutoER2026",
    name: "Emeka Nwosu",
    title: "Dr.",
    role: "clinician",
    facilityId: "fmco",
    facilityName: "Federal Medical Centre Owerri",
    licence: "MDCN-IM-44821",
    specialty: "Emergency Medicine",
  },
  {
    id: "prac-adaeze",
    email: "adaeze.okonkwo@futo.edu.ng",
    passwordHint: "CampusWard2026",
    name: "Adaeze Okonkwo",
    title: "Dr.",
    role: "clinician",
    facilityId: "futomc",
    facilityName: "FUTO Medical Centre",
    licence: "MDCN-IM-33019",
    specialty: "Internal Medicine",
  },
  {
    id: "prac-blessing",
    email: "blessing.amadi@ihiagwa.phc.im.gov.ng",
    passwordHint: "PhcDesk2026",
    name: "Blessing Amadi",
    title: "CHEW",
    role: "clinician",
    facilityId: "ihiagwa",
    facilityName: "Ihiagwa Primary Health Centre",
    licence: "CHPRBN-IM-10211",
    specialty: "Primary Care",
  },
  {
    id: "prac-ngozi",
    email: "ngozi.hart@hie.futo.edu.ng",
    passwordHint: "Registry2026",
    name: "Ngozi Hart",
    title: "Mrs.",
    role: "registrar",
    facilityId: null,
    facilityName: "FUTO Health Exchange",
    licence: null,
    specialty: "Client Registry",
  },
  {
    id: "prac-ibrahim",
    email: "ibrahim.sani@hie.futo.edu.ng",
    passwordHint: "AuditTrail2026",
    name: "Ibrahim Sani",
    title: "Mr.",
    role: "auditor",
    facilityId: null,
    facilityName: "FUTO Health Exchange",
    licence: null,
    specialty: "Compliance",
  },
  {
    id: "prac-admin",
    email: "campus.admin@hie.futo.edu.ng",
    passwordHint: "CampusNode2026",
    name: "Kelechi Wokoma",
    title: "Dr.",
    role: "state_admin",
    facilityId: null,
    facilityName: "FUTO Health Exchange",
    licence: "MDCN-IM-11880",
    specialty: "Digital Health",
  },
  {
    id: "pat-chidinma",
    email: "chidinma.okafor@student.futo.edu.ng",
    passwordHint: "MyHealth2026",
    name: "Chidinma Okafor-Adeyemi",
    title: "",
    role: "patient",
    facilityId: null,
    facilityName: "FUTO Health Exchange",
    licence: null,
    specialty: null,
  },
];

export const Route = createFileRoute("/")({ component: Gate });

const ROLE_LABEL: Record<string, string> = {
  clinician: "Clinician",
  registrar: "Registry clerk",
  auditor: "Auditor",
  state_admin: "Campus admin",
  patient: "Patient",
};

function Gate() {
  const { signIn, user, ready } = useSession();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<Persona[]>(ROSTER);
  const [email, setEmail] = useState("emeeka.nwosu@fmcowerri.gov.ng");
  const [password, setPassword] = useState("FutoER2026");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.personas().then((r) => setPersonas(r.personas));
  }, []);

  useEffect(() => {
    if (ready && user) void navigate({ to: "/portal" });
  }, [ready, user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signed = await signIn(email, password);
      void navigate({ to: signed.role === "patient" ? "/portal/consent" : "/portal" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <section className="relative flex flex-col justify-between bg-cabinet px-6 py-8 text-paper md:px-12 md:py-12">
        <div>
          <p className="text-[11px] tracking-[0.22em] text-sand/55 uppercase">
            Federal University of Technology, Owerri
          </p>
          <h1 className="mt-6 font-display text-5xl leading-[0.95] tracking-tight md:text-6xl">
            U-HRES
          </h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-sand/80">
            A campus closed-network exchange. Hospitals keep the chart. The node holds identity,
            consent, routing, and audit.
          </p>
        </div>

        <ol className="mt-12 max-w-lg space-y-4 text-sm text-sand/75">
          <li className="flex gap-3">
            <span className="font-mono text-xs text-sand/40">01</span>
            Each facility hosts its own FHIR store. Nothing is warehoused centrally.
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-xs text-sand/40">02</span>
            UHID links optional NIN, facility MRNs, and demographic matching.
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-xs text-sand/40">03</span>
            Every retrieve answers who, which patient, and for what purpose.
          </li>
        </ol>

        <p className="mt-16 flex items-center gap-2 text-xs text-sand/50">
          <ShieldCheck className="size-3.5" />
          Prototype on synthetic patients. Not a live clinical system.
        </p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 md:px-12">
        <div className="mx-auto w-full max-w-md">
          <p className="text-xs tracking-[0.18em] text-fg-subtle uppercase">Closed network</p>
          <h2 className="mt-2 font-display text-3xl tracking-tight">Enter as a treating site</h2>
          <p className="mt-2 text-sm text-fg-muted">
            The ER case is pre-loaded for Dr. Emeka Nwosu at FMC Owerri.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <div className="mt-10">
            <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Demo roster</p>
            <ul className="mt-3 space-y-2">
              {personas.map((p) => {
                const selected = email === p.email;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(p.email);
                        setPassword(p.passwordHint);
                        setError(null);
                      }}
                      className={cn(
                        "flex min-h-14 w-full items-center justify-between rounded-lg px-3 text-left transition-colors duration-150",
                        selected ? "bg-accent-soft" : "bg-bg-elevated hover:bg-sand",
                      )}
                    >
                      <span>
                        <span className="block text-sm font-medium">
                          {p.title} {p.name}
                        </span>
                        <span className="block text-xs text-fg-muted">
                          {ROLE_LABEL[p.role]} · {p.facilityName?.replace("University of ", "") ?? "State node"}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-fg-subtle">{p.passwordHint}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
