import type {
  AuditEvent,
  CareSummary,
  ClientRecord,
  ConsentPolicy,
  Demographics,
  Facility,
  FhirResource,
  MatchCandidate,
  MatchQueueItem,
  PurposeOfUse,
  RecordLink,
  SearchQuery,
  SessionUser,
} from "./types";

const TOKEN_KEY = "uhres.token";
const USER_KEY = "uhres.user";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  console.log(`[HIE Request] ${init.method || "GET"} /api/hie/${path}`, {
    tokenExists: !!token,
    body: init.body ? "Present" : "None",
  });

  const base = import.meta.env.VITE_API_BASE_URL || "";
  const res = await fetch(`${base}/api/hie/${path}`, { ...init, headers });

  const text = await res.text();
  console.log(`[HIE Response] ${res.status} ${path}`, {
    response: text,
  });

  let data;
  try {
    data = JSON.parse(text) as T & { error?: string; code?: string };
  } catch (e) {
    console.error(`[HIE Parse Error] Failed to parse JSON for ${path}:`, text);
    data = { error: "Invalid JSON response from server" } as any;
  }

  if (!res.ok) {
    const err = new Error(data.error ?? `Request failed (${res.status})`) as Error & {
      status: number;
      code?: string;
    };
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request<{ ok: boolean; node: string; stats: Record<string, number> }>("health"),
  personas: () =>
    request<{ personas: Array<SessionUser & { email: string; passwordHint: string }> }>("personas"),
  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser }>("auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: SessionUser }>("me"),
  search: (query: SearchQuery) =>
    request<{ candidates: MatchCandidate[] }>("mpi/search", {
      method: "POST",
      body: JSON.stringify(query),
    }),
  confirm: (body: { uhid: string; facilityId: string; mrn: string; queueId?: string }) =>
    request<{ link: RecordLink }>("mpi/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  register: (body: { demographics: Demographics; mrn: string }) =>
    request<{ client: ClientRecord; link: RecordLink }>("mpi/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  contribute: (body: { facilityId: string; localPatientId: string; resource: FhirResource }) =>
    request<{ ok: boolean; link: RecordLink }>("records/contribute", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reject: (queueId: string, note?: string) =>
    request<{ ok: boolean }>("mpi/reject", {
      method: "POST",
      body: JSON.stringify({ queueId, note }),
    }),
  summary: (uhid: string, purpose: PurposeOfUse, breakGlass?: { reason: string }) => {
    const q = new URLSearchParams({ uhid, purpose });
    return request<CareSummary & { error?: string }>(
      `summary?${q.toString()}`,
      breakGlass
        ? { method: "POST", body: JSON.stringify({ reason: breakGlass.reason }) }
        : { method: "GET" },
    );
  },
  breakGlass: (uhid: string, reason: string) =>
    request<CareSummary>("break-glass", {
      method: "POST",
      body: JSON.stringify({ uhid, reason }),
    }),
  consent: (body: {
    uhid: string;
    scope: "network" | "facility";
    targetFacilityId?: string;
    directive: "permit" | "deny";
    note?: string;
  }) => request<{ policy: ConsentPolicy }>("consent", { method: "POST", body: JSON.stringify(body) }),
  listConsent: (uhid: string) => request<{ policies: ConsentPolicy[] }>(`consent?uhid=${uhid}`),
  audit: (uhid?: string) =>
    request<{ events: AuditEvent[] }>(uhid ? `audit?uhid=${uhid}` : "audit"),
  facilities: () => request<{ facilities: Facility[] }>("facilities"),
  queue: () => request<{ items: MatchQueueItem[] }>("match-queue"),
  patients: (facilityId: string) =>
    request<{ patients: FhirResource[] }>(`patients?facility=${facilityId}`),
  localRecord: (facilityId: string, patientId: string) =>
    request<{ resources: FhirResource[] }>(`records/${facilityId}/${patientId}`),
  stats: () => request<{ stats: Record<string, number> }>("stats"),
  reset: () => request<{ ok: boolean }>("demo/reset", { method: "POST" }),
  verifyAudit: () =>
    request<{ verified: boolean; corruptionIndex: number | null; details: string; chainLength?: number }>("audit/verify"),
};
