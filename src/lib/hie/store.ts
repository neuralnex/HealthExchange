import { SignJWT, jwtVerify } from "jose";
import {
  clients as seedClients,
  facilities as seedFacilities,
  hospitalStores as seedStores,
  initialConsent,
  initialLinks,
  practitioners as seedPractitioners,
  STAR_UHID,
  unlinkedLocalPatients,
} from "./seed";
import { scoreMatch } from "./matching";
import type {
  AuditEvent,
  CareSummary,
  ClientRecord,
  ConsentDirective,
  ConsentPolicy,
  Facility,
  FhirResource,
  MatchCandidate,
  MatchQueueItem,
  Practitioner,
  ProvenanceStamp,
  PurposeOfUse,
  RecordLink,
  SearchQuery,
  SessionUser,
  SummarySection,
} from "./types";

const TOKEN_SECRET = new TextEncoder().encode(
  process.env.UHRES_JWT_SECRET ?? "uhres-futo-prototype-do-not-use-in-production",
);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sha256Hex(input: string): string {
  // Lightweight FNV-1a 64 + length mix is not SHA-256. Use Web Crypto when available;
  // fall back to a deterministic hex for the demo hash chain.
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (c << 1) + i;
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export class AccessDeniedError extends Error {
  code = "CONSENT_DENIED" as const;
  constructor(
    message: string,
    public readonly uhid: string,
  ) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

interface EngineState {
  facilities: Facility[];
  practitioners: Practitioner[];
  clients: ClientRecord[];
  links: RecordLink[];
  consent: ConsentPolicy[];
  audit: AuditEvent[];
  stores: Record<string, FhirResource[]>;
  queue: MatchQueueItem[];
  uhidSeq: number;
}

function emptyState(): EngineState {
  return {
    facilities: clone(seedFacilities),
    practitioners: clone(seedPractitioners),
    clients: clone(seedClients),
    links: clone(initialLinks),
    consent: clone(initialConsent),
    audit: [],
    stores: clone(seedStores),
    queue: [],
    uhidSeq: 28000,
  };
}

let state: EngineState = emptyState();

function resetInternal() {
  state = emptyState();
  seedQueue();
  writeAudit({
    actorId: "system",
    actorName: "U-HRES",
    orgId: null,
    orgName: "State node",
    action: "system.seed",
    resource: "ClientRegistry",
    outcome: "success",
    breakGlass: false,
  });
}

function seedQueue() {
  const chidinma = state.clients.find((c) => c.uhid === STAR_UHID)!;
  const local = unlinkedLocalPatients[0]!;
  const scored = scoreMatch(local.demographics, chidinma.demographics);
  state.queue.push({
    id: "q-er-chidinma",
    left: {
      facilityId: local.facilityId,
      mrn: local.mrn,
      demographics: local.demographics,
    },
    rightUhid: STAR_UHID,
    score: scored.score,
    band: scored.band,
    reasons: scored.reasons,
    status: "pending",
  });

  const ikenna = state.clients.find((c) => c.uhid === "NG-IM-00019001")!;
  const ikechukwu = state.clients.find((c) => c.uhid === "NG-IM-00019002")!;
  const twin = scoreMatch(ikenna.demographics, ikechukwu.demographics);
  state.queue.push({
    id: "q-twins-eze",
    left: {
      facilityId: "futomc",
      mrn: "FUTOMC-2044",
      demographics: ikenna.demographics,
    },
    rightUhid: "NG-IM-00019002",
    score: twin.score,
    band: twin.band,
    reasons: [...twin.reasons, "Possible twins; do not auto-merge"],
    status: "pending",
  });
}

function facilityName(id: string | null | undefined): string {
  if (!id) return "FUTO Health Exchange";
  return state.facilities.find((f) => f.id === id)?.shortName ?? id;
}

function writeAudit(partial: Omit<AuditEvent, "id" | "ts" | "ip" | "prevHash" | "hash">) {
  const prev = state.audit[state.audit.length - 1];
  const prevHash = prev?.hash ?? "genesis";
  const ts = new Date().toISOString();
  const id = `aud-${state.audit.length + 1}`;
  const payload = JSON.stringify({ ...partial, ts, id, prevHash });
  const hash = sha256Hex(prevHash + payload);
  const event: AuditEvent = {
    ...partial,
    id,
    ts,
    ip: "10.20.4.12",
    prevHash,
    hash,
  };
  state.audit.push(event);
  return event;
}

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    role: user.role,
    org: user.facilityId,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(TOKEN_SECRET);
}

export async function readToken(token: string): Promise<SessionUser> {
  try {
    const { payload } = await jwtVerify(token, TOKEN_SECRET);
    const prac = state.practitioners.find((p) => p.id === payload.sub);
    if (!prac) throw new AuthError("Unknown session");
    return toSession(prac);
  } catch {
    throw new AuthError("Invalid or expired session");
  }
}

function toSession(prac: Practitioner): SessionUser {
  const fac = state.facilities.find((f) => f.id === prac.facilityId);
  return {
    id: prac.id,
    email: prac.email,
    name: prac.name,
    title: prac.title,
    role: prac.role,
    facilityId: prac.facilityId,
    facilityName: fac ? fac.name : "FUTO Health Exchange",
    licence: prac.licence,
    specialty: prac.specialty,
  };
}

export function login(email: string, password: string): SessionUser {
  const prac = state.practitioners.find(
    (p) => p.email.toLowerCase() === email.trim().toLowerCase() && p.password === password,
  );
  if (!prac) throw new AuthError("Email or password is not recognised");
  writeAudit({
    actorId: prac.id,
    actorName: `${prac.title} ${prac.name}`.trim(),
    orgId: prac.facilityId,
    orgName: facilityName(prac.facilityId),
    action: "auth.login",
    resource: "Session",
    outcome: "success",
    breakGlass: false,
  });
  return toSession(prac);
}

export function listFacilities(): Facility[] {
  return state.facilities;
}

export function listPersonas(): Array<SessionUser & { email: string }> {
  return state.practitioners.map((p) => ({ ...toSession(p), email: p.email }));
}

export function searchMpi(query: SearchQuery, actor: SessionUser): MatchCandidate[] {
  const results: MatchCandidate[] = [];
  for (const client of state.clients) {
    const scored = scoreMatch(query, client.demographics);
    if (scored.band === "no-match" && scored.score < 0.45) continue;
    const links = state.links.filter((l) => l.uhid === client.uhid && l.status === "active");
    results.push({
      uhid: client.uhid,
      score: scored.score,
      band: scored.band,
      reasons: scored.reasons,
      demographics: client.demographics,
      links,
      alreadyLinkedToRequester: actor.facilityId
        ? links.some((l) => l.facilityId === actor.facilityId)
        : false,
    });
  }
  results.sort((a, b) => b.score - a.score);
  writeAudit({
    actorId: actor.id,
    actorName: displayActor(actor),
    orgId: actor.facilityId,
    orgName: facilityName(actor.facilityId),
    action: "mpi.search",
    resource: "ClientRegistry",
    outcome: "success",
    breakGlass: false,
    uhid: results[0]?.uhid,
    purpose: "treatment",
  });
  return results.slice(0, 8);
}

export function confirmMatch(
  actor: SessionUser,
  args: { uhid: string; facilityId: string; mrn: string; localPatientId?: string; queueId?: string },
): RecordLink {
  const client = state.clients.find((c) => c.uhid === args.uhid);
  if (!client) throw new Error("Unknown UHID");
  const existing = state.links.find(
    (l) => l.uhid === args.uhid && l.facilityId === args.facilityId && l.mrn === args.mrn,
  );
  if (existing) {
    existing.status = "active";
    return existing;
  }
  const localPatientId =
    args.localPatientId ??
    unlinkedLocalPatients.find((u) => u.mrn === args.mrn)?.localPatientId ??
    `${args.facilityId}-${args.mrn}`;
  const categories = inferCategories(args.facilityId, localPatientId);
  const link: RecordLink = {
    id: `link-${args.uhid}-${args.facilityId}`,
    uhid: args.uhid,
    facilityId: args.facilityId,
    mrn: args.mrn,
    localPatientId,
    categories,
    lastUpdated: new Date().toISOString(),
    status: "active",
  };
  state.links.push(link);
  if (args.queueId) {
    const item = state.queue.find((q) => q.id === args.queueId);
    if (item) item.status = "confirmed";
  }
  writeAudit({
    actorId: actor.id,
    actorName: displayActor(actor),
    orgId: actor.facilityId,
    orgName: facilityName(actor.facilityId),
    action: "mpi.confirm",
    resource: `RecordLink/${link.id}`,
    outcome: "success",
    breakGlass: false,
    uhid: args.uhid,
    purpose: "treatment",
  });
  return link;
}

export function rejectMatch(actor: SessionUser, queueId: string, note?: string) {
  const item = state.queue.find((q) => q.id === queueId);
  if (!item) throw new Error("Unknown queue item");
  item.status = "rejected";
  writeAudit({
    actorId: actor.id,
    actorName: displayActor(actor),
    orgId: actor.facilityId,
    orgName: facilityName(actor.facilityId),
    action: "mpi.reject",
    resource: `MatchQueue/${queueId}`,
    outcome: "success",
    breakGlass: false,
    uhid: item.rightUhid,
    reason: note,
    purpose: "treatment",
  });
}

function inferCategories(facilityId: string, localPatientId: string): string[] {
  const types = new Set<string>();
  for (const res of state.stores[facilityId] ?? []) {
    if (patientRef(res) === localPatientId && res.resourceType !== "Patient") {
      types.add(res.resourceType);
    }
  }
  return [...types];
}

function patientRef(res: FhirResource): string | null {
  const raw =
    (res.patient as { reference?: string } | undefined)?.reference ??
    (res.subject as { reference?: string } | undefined)?.reference;
  if (!raw) return res.resourceType === "Patient" ? res.id : null;
  return raw.replace(/^Patient\//, "");
}

function consentFor(
  uhid: string,
  requesterOrg: string | null,
): { allowed: boolean; directive: ConsentDirective | "break-glass"; note: string; policy?: ConsentPolicy } {
  const policies = state.consent.filter((c) => c.uhid === uhid);
  const facilityDeny = policies.find(
    (p) => p.scope === "facility" && p.targetFacilityId === requesterOrg && p.directive === "deny",
  );
  if (facilityDeny) {
    return {
      allowed: false,
      directive: "deny",
      note: facilityDeny.note ?? "Patient has blocked this facility.",
      policy: facilityDeny,
    };
  }
  const network = policies.find((p) => p.scope === "network");
  if (network?.directive === "deny") {
    return {
      allowed: false,
      directive: "deny",
      note: network.note ?? "Patient has opted out of network sharing.",
      policy: network,
    };
  }
  if (network?.directive === "permit") {
    return {
      allowed: true,
      directive: "permit",
      note: network.note ?? "Network treatment consent on file.",
      policy: network,
    };
  }
  return {
    allowed: false,
    directive: "deny",
    note: "No consent on file. Capture consent or use emergency break-glass.",
  };
}

function section(
  resources: FhirResource[],
  facilityId: string,
  localPatientId: string,
  type: string,
): { items: FhirResource[]; stamp: ProvenanceStamp | null } {
  const items = resources.filter(
    (r) => r.resourceType === type && patientRef(r) === localPatientId,
  );
  if (!items.length) return { items: [], stamp: null };
  const fac = state.facilities.find((f) => f.id === facilityId)!;
  return {
    items,
    stamp: { facilityId, facilityName: fac.shortName, lastUpdated: new Date().toISOString() },
  };
}

export function getSummary(
  actor: SessionUser,
  uhid: string,
  purpose: PurposeOfUse,
  breakGlass?: { reason: string },
): CareSummary {
  const started = Date.now();
  const client = state.clients.find((c) => c.uhid === uhid);
  if (!client) throw new Error("Unknown UHID");

  const consent = consentFor(uhid, actor.facilityId);
  const isEmergency = purpose === "emergency" && breakGlass?.reason;
  if (!consent.allowed && !isEmergency) {
    writeAudit({
      actorId: actor.id,
      actorName: displayActor(actor),
      orgId: actor.facilityId,
      orgName: facilityName(actor.facilityId),
      action: "summary.denied",
      resource: `Patient/${uhid}`,
      outcome: "denied",
      breakGlass: false,
      uhid,
      purpose,
      reason: consent.note,
    });
    throw new AccessDeniedError(consent.note, uhid);
  }

  if (isEmergency && !consent.allowed) {
    writeAudit({
      actorId: actor.id,
      actorName: displayActor(actor),
      orgId: actor.facilityId,
      orgName: facilityName(actor.facilityId),
      action: "break-glass",
      resource: `Patient/${uhid}`,
      outcome: "flagged",
      breakGlass: true,
      uhid,
      purpose: "emergency",
      reason: breakGlass!.reason,
    });
  }

  const links = state.links.filter((l) => l.uhid === uhid && l.status === "active");
  const allergies: FhirResource[] = [];
  const medications: FhirResource[] = [];
  const conditions: FhirResource[] = [];
  const encounters: FhirResource[] = [];
  const observations: FhirResource[] = [];
  const immunizations: FhirResource[] = [];
  const documents: FhirResource[] = [];
  const provenance: ProvenanceStamp[] = [];
  const stampsFor = (type: string) => {
    const out: ProvenanceStamp[] = [];
    for (const link of links) {
      const store = state.stores[link.facilityId] ?? [];
      const s = section(store, link.facilityId, link.localPatientId, type);
      if (s.stamp) out.push(s.stamp);
    }
    return out;
  };

  for (const link of links) {
    const store = state.stores[link.facilityId] ?? [];
    const fac = state.facilities.find((f) => f.id === link.facilityId)!;
    provenance.push({
      facilityId: link.facilityId,
      facilityName: fac.shortName,
      lastUpdated: link.lastUpdated,
    });
    const take = (type: string, bucket: FhirResource[]) => {
      const s = section(store, link.facilityId, link.localPatientId, type);
      bucket.push(...s.items.map((item) => ({ ...item, meta: { source: fac.shortName } })));
    };
    take("AllergyIntolerance", allergies);
    take("MedicationRequest", medications);
    take("Condition", conditions);
    take("Encounter", encounters);
    take("Observation", observations);
    take("Immunization", immunizations);
    take("DocumentReference", documents);
  }

  const pack = <T extends FhirResource>(items: T[], type: string): SummarySection<T> => ({
    items,
    provenance: stampsFor(type),
  });

  writeAudit({
    actorId: actor.id,
    actorName: displayActor(actor),
    orgId: actor.facilityId,
    orgName: facilityName(actor.facilityId),
    action: "summary.read",
    resource: `Patient/${uhid}`,
    outcome: isEmergency && !consent.allowed ? "flagged" : "success",
    breakGlass: Boolean(isEmergency && !consent.allowed),
    uhid,
    purpose,
    reason: breakGlass?.reason,
  });

  return {
    uhid,
    patient: { ...client.demographics, uhid, nin: client.demographics.nin },
    consent: {
      allowed: true,
      directive: isEmergency && !consent.allowed ? "break-glass" : consent.directive,
      note:
        isEmergency && !consent.allowed
          ? `Emergency override: ${breakGlass!.reason}`
          : consent.note,
    },
    allergies: pack(allergies, "AllergyIntolerance"),
    medications: pack(medications, "MedicationRequest"),
    conditions: pack(conditions, "Condition"),
    encounters: pack(encounters, "Encounter"),
    observations: pack(observations, "Observation"),
    immunizations: pack(immunizations, "Immunization"),
    documents: pack(documents, "DocumentReference"),
    sources: provenance,
    assembledAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
  };
}

export function setConsent(
  actor: SessionUser,
  args: {
    uhid: string;
    scope: "network" | "facility";
    targetFacilityId?: string;
    directive: ConsentDirective;
    purpose?: PurposeOfUse[];
    note?: string;
  },
): ConsentPolicy {
  if (actor.role === "patient" && actor.id === "pat-chidinma" && args.uhid !== STAR_UHID) {
    throw new AuthError("Patients may only manage their own consent");
  }
  const existing = state.consent.find(
    (c) =>
      c.uhid === args.uhid &&
      c.scope === args.scope &&
      (args.scope === "network" || c.targetFacilityId === args.targetFacilityId),
  );
  const policy: ConsentPolicy = existing ?? {
    id: `con-${args.uhid}-${args.scope}-${args.targetFacilityId ?? "net"}`,
    uhid: args.uhid,
    scope: args.scope,
    targetFacilityId: args.targetFacilityId,
    directive: args.directive,
    purpose: args.purpose ?? ["treatment", "emergency"],
    note: args.note,
    updatedAt: new Date().toISOString(),
  };
  policy.directive = args.directive;
  policy.purpose = args.purpose ?? policy.purpose;
  policy.note = args.note ?? policy.note;
  policy.updatedAt = new Date().toISOString();
  if (!existing) state.consent.push(policy);
  writeAudit({
    actorId: actor.id,
    actorName: displayActor(actor),
    orgId: actor.facilityId,
    orgName: facilityName(actor.facilityId),
    action: "consent.update",
    resource: `Consent/${policy.id}`,
    outcome: "success",
    breakGlass: false,
    uhid: args.uhid,
    purpose: "treatment",
    reason: `${args.scope} ${args.directive}`,
  });
  return policy;
}

export function listConsent(uhid: string): ConsentPolicy[] {
  return state.consent.filter((c) => c.uhid === uhid);
}

export function listAudit(filter?: { uhid?: string; breakGlass?: boolean }): AuditEvent[] {
  let rows = [...state.audit].reverse();
  if (filter?.uhid) rows = rows.filter((r) => r.uhid === filter.uhid);
  if (filter?.breakGlass) rows = rows.filter((r) => r.breakGlass);
  return rows;
}

export function listQueue(): MatchQueueItem[] {
  return state.queue;
}

export function listLocalPatients(facilityId: string): FhirResource[] {
  return (state.stores[facilityId] ?? []).filter((r) => r.resourceType === "Patient");
}

export function getLocalResources(facilityId: string, localPatientId: string): FhirResource[] {
  return (state.stores[facilityId] ?? []).filter(
    (r) => r.resourceType === "Patient" ? r.id === localPatientId : patientRef(r) === localPatientId,
  );
}

export function getClient(uhid: string): ClientRecord | undefined {
  return state.clients.find((c) => c.uhid === uhid);
}

export function getLinks(uhid: string): RecordLink[] {
  return state.links.filter((l) => l.uhid === uhid);
}

export function stats() {
  return {
    facilities: state.facilities.length,
    clients: state.clients.length,
    links: state.links.filter((l) => l.status === "active").length,
    pendingMatches: state.queue.filter((q) => q.status === "pending").length,
    auditEvents: state.audit.length,
    breakGlass: state.audit.filter((a) => a.breakGlass).length,
  };
}

export function resetDemo() {
  resetInternal();
}

function displayActor(actor: SessionUser): string {
  return `${actor.title} ${actor.name}`.trim();
}

resetInternal();
