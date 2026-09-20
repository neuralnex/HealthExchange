export type Role =
  | "clinician"
  | "registrar"
  | "auditor"
  | "state_admin"
  | "patient";

export type PurposeOfUse =
  | "treatment"
  | "emergency"
  | "quality"
  | "public-health";

export type MatchBand = "auto-link" | "confirm" | "workbench" | "no-match";

export type FacilityType = "teaching" | "general" | "phc";

export type ConsentDirective = "permit" | "deny";

export interface Facility {
  id: string;
  code: string;
  name: string;
  shortName: string;
  type: FacilityType;
  lga: string;
  state: string;
  fhirBaseUrl: string;
  status: "active" | "onboarding";
}

export interface Practitioner {
  id: string;
  email: string;
  password: string;
  name: string;
  title: string;
  role: Role;
  facilityId: string | null;
  licence: string | null;
  specialty: string | null;
}

export interface Demographics {
  given: string;
  family: string;
  otherNames?: string;
  sex: "male" | "female";
  birthDate: string;
  phone?: string;
  nin?: string;
  addressLine?: string;
  city?: string;
  lga?: string;
  state?: string;
}

export interface ClientRecord {
  uhid: string;
  demographics: Demographics;
  createdAt: string;
  mergedFrom?: string[];
}

export interface RecordLink {
  id: string;
  uhid: string;
  facilityId: string;
  mrn: string;
  localPatientId: string;
  categories: string[];
  lastUpdated: string;
  status: "active" | "proposed";
}

export interface ConsentPolicy {
  id: string;
  uhid: string;
  scope: "network" | "facility";
  targetFacilityId?: string;
  directive: ConsentDirective;
  purpose: PurposeOfUse[];
  categories?: string[];
  note?: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  ts: string;
  actorId: string;
  actorName: string;
  orgId: string | null;
  orgName: string;
  action: string;
  uhid?: string;
  purpose?: PurposeOfUse;
  breakGlass: boolean;
  reason?: string;
  resource: string;
  outcome: "success" | "denied" | "flagged";
  ip: string;
  prevHash: string;
  hash: string;
}

export interface MatchCandidate {
  uhid: string;
  score: number;
  band: MatchBand;
  reasons: string[];
  demographics: Demographics;
  links: RecordLink[];
  alreadyLinkedToRequester: boolean;
}

export interface MatchQueueItem {
  id: string;
  left: {
    facilityId: string;
    mrn: string;
    demographics: Demographics;
  };
  rightUhid: string;
  score: number;
  band: MatchBand;
  reasons: string[];
  status: "pending" | "confirmed" | "rejected";
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  title: string;
  role: Role;
  facilityId: string | null;
  facilityName: string | null;
  licence: string | null;
  specialty: string | null;
}

export interface FhirResource {
  resourceType: string;
  id: string;
  [key: string]: unknown;
}

export interface ProvenanceStamp {
  facilityId: string;
  facilityName: string;
  lastUpdated: string;
}

export interface SummarySection<T> {
  items: T[];
  provenance: ProvenanceStamp[];
}

export interface CareSummary {
  uhid: string;
  patient: Demographics & { uhid: string; nin?: string };
  consent: {
    allowed: boolean;
    directive: ConsentDirective | "break-glass";
    note: string;
  };
  allergies: SummarySection<FhirResource>;
  medications: SummarySection<FhirResource>;
  conditions: SummarySection<FhirResource>;
  encounters: SummarySection<FhirResource>;
  observations: SummarySection<FhirResource>;
  immunizations: SummarySection<FhirResource>;
  documents: SummarySection<FhirResource>;
  sources: ProvenanceStamp[];
  assembledAt: string;
  elapsedMs: number;
}

export interface SearchQuery {
  given?: string;
  family?: string;
  birthDate?: string;
  sex?: "male" | "female";
  phone?: string;
  nin?: string;
  address?: string;
}
