import { createFileRoute } from "@tanstack/react-router";
import {
  AccessDeniedError,
  AuthError,
  confirmMatch,
  getClient,
  getLinks,
  getLocalResources,
  getSummary,
  listAudit,
  listConsent,
  listFacilities,
  listLocalPatients,
  listPersonas,
  listQueue,
  login,
  readToken,
  rejectMatch,
  resetDemo,
  searchMpi,
  setConsent,
  signToken,
  stats,
} from "@/lib/hie/store";
import type { PurposeOfUse, SearchQuery, SessionUser } from "@/lib/hie/types";

export const Route = createFileRoute("/api/hie/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle("GET", params._splat ?? "", request),
      POST: ({ request, params }) => handle("POST", params._splat ?? "", request),
    },
  },
});

async function handle(method: string, splat: string, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = splat.replace(/^\/+|\/+$/g, "");
  try {
    if (method === "GET" && path === "health") {
      return json({
        ok: true,
        node: "FUTO Health Exchange",
        model: "federated-with-central-registry",
        stats: stats(),
      });
    }
    if (method === "GET" && path === "personas") {
      const personas = listPersonas().map((p) => ({
        ...p,
        passwordHint: hintFor(p.email),
      }));
      return json({ personas });
    }
    if (method === "POST" && path === "auth/login") {
      const body = (await request.json()) as { email?: string; password?: string };
      const user = login(body.email ?? "", body.password ?? "");
      const token = await signToken(user);
      return json({ token, user });
    }
    if (method === "POST" && path === "demo/reset") {
      resetDemo();
      return json({ ok: true });
    }

    const actor = await requireUser(request);

    if (method === "GET" && path === "me") return json({ user: actor });
    if (method === "GET" && path === "facilities") return json({ facilities: listFacilities() });
    if (method === "GET" && path === "stats") return json({ stats: stats() });
    if (method === "GET" && path === "match-queue") {
      assertRole(actor, ["registrar", "state_admin", "clinician", "auditor"]);
      return json({ items: listQueue() });
    }
    if (method === "POST" && path === "mpi/search") {
      const query = (await request.json()) as SearchQuery;
      return json({ candidates: searchMpi(query, actor) });
    }
    if (method === "POST" && path === "mpi/confirm") {
      const body = (await request.json()) as {
        uhid: string;
        facilityId: string;
        mrn: string;
        queueId?: string;
      };
      const link = confirmMatch(actor, body);
      return json({ link });
    }
    if (method === "POST" && path === "mpi/reject") {
      const body = (await request.json()) as { queueId: string; note?: string };
      rejectMatch(actor, body.queueId, body.note);
      return json({ ok: true });
    }
    if (path === "summary") {
      const uhid = url.searchParams.get("uhid") ?? "";
      const purpose = (url.searchParams.get("purpose") ?? "treatment") as PurposeOfUse;
      if (method === "POST") {
        const body = (await request.json()) as { reason?: string };
        const summary = getSummary(actor, uhid, "emergency", {
          reason: body.reason ?? "Emergency override",
        });
        return json(summary);
      }
      const summary = getSummary(actor, uhid, purpose);
      return json(summary);
    }
    if (method === "POST" && path === "break-glass") {
      const body = (await request.json()) as { uhid: string; reason: string };
      if (!body.reason?.trim()) return json({ error: "A reason is required" }, 400);
      const summary = getSummary(actor, body.uhid, "emergency", { reason: body.reason.trim() });
      return json(summary);
    }
    if (path === "consent") {
      if (method === "GET") {
        const uhid = url.searchParams.get("uhid") ?? "";
        return json({ policies: listConsent(uhid), client: getClient(uhid), links: getLinks(uhid) });
      }
      const body = (await request.json()) as {
        uhid: string;
        scope: "network" | "facility";
        targetFacilityId?: string;
        directive: "permit" | "deny";
        note?: string;
      };
      const policy = setConsent(actor, body);
      return json({ policy });
    }
    if (method === "GET" && path === "audit") {
      assertRole(actor, ["auditor", "state_admin", "clinician", "registrar"]);
      const uhid = url.searchParams.get("uhid") ?? undefined;
      return json({ events: listAudit({ uhid }) });
    }
    if (method === "GET" && path.startsWith("patients")) {
      const facility = url.searchParams.get("facility") ?? actor.facilityId;
      if (!facility) return json({ error: "No facility in context" }, 400);
      return json({ patients: listLocalPatients(facility) });
    }
    const recordMatch = path.match(/^records\/([^/]+)\/([^/]+)$/);
    if (method === "GET" && recordMatch) {
      return json({
        resources: getLocalResources(recordMatch[1]!, recordMatch[2]!),
      });
    }

    return json({ error: `No route for ${method} /api/hie/${path}` }, 404);
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401);
    if (err instanceof AccessDeniedError) {
      return json({ error: err.message, code: err.code, uhid: err.uhid }, 403);
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 400);
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function requireUser(request: Request): Promise<SessionUser> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new AuthError("Sign in required");
  return readToken(token);
}

function assertRole(actor: SessionUser, roles: SessionUser["role"][]) {
  if (!roles.includes(actor.role)) {
    throw new AuthError("This role cannot perform that action");
  }
}

function hintFor(email: string): string {
  const map: Record<string, string> = {
    "emeeka.nwosu@fmcowerri.gov.ng": "FutoER2026",
    "adaeze.okonkwo@futo.edu.ng": "CampusWard2026",
    "blessing.amadi@ihiagwa.phc.im.gov.ng": "PhcDesk2026",
    "ngozi.hart@hie.futo.edu.ng": "Registry2026",
    "ibrahim.sani@hie.futo.edu.ng": "AuditTrail2026",
    "campus.admin@hie.futo.edu.ng": "CampusNode2026",
    "chidinma.okafor@student.futo.edu.ng": "MyHealth2026",
  };
  return map[email] ?? "";
}
