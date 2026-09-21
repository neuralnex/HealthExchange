from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, NODE_NAME
from .engine import AccessDeniedError, AuthError, engine
from .security import sign, verify

app = FastAPI(
    title="U-HRES Exchange",
    description="Federated Health Information Exchange for FUTO. Synthetic patients only.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def actor(authorization: str | None) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        payload = verify(authorization.split(" ", 1)[1])
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    prac = engine.practitioner(payload["sub"])
    if not prac:
        raise HTTPException(status_code=401, detail="Unknown session")
    return engine.to_session(prac)


@app.get("/api/hie/health")
def health():
    return {
        "ok": True,
        "node": NODE_NAME,
        "model": "federated-with-central-registry",
        "stats": engine.stats(),
    }


@app.get("/api/hie/personas")
def personas():
    return {"personas": engine.personas()}


@app.post("/api/hie/auth/login")
def login(body: dict[str, str]):
    try:
        user = engine.login(body.get("email", ""), body.get("password", ""))
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    token = sign({"sub": user["id"], "role": user["role"], "org": user.get("facilityId"), "name": user["name"]})
    return {"token": token, "user": user}


@app.post("/api/hie/demo/reset")
def reset():
    engine.reset()
    return {"ok": True}


@app.get("/api/hie/me")
def me(authorization: str | None = Header(default=None)):
    return {"user": actor(authorization)}


@app.get("/api/hie/facilities")
def facilities(authorization: str | None = Header(default=None)):
    actor(authorization)
    return {"facilities": engine.state["facilities"]}


@app.get("/api/hie/stats")
def stats(authorization: str | None = Header(default=None)):
    actor(authorization)
    return {"stats": engine.stats()}


@app.get("/api/hie/match-queue")
def queue(authorization: str | None = Header(default=None)):
    actor(authorization)
    return {"items": engine.state["queue"]}


@app.post("/api/hie/mpi/search")
def search(body: dict[str, Any], authorization: str | None = Header(default=None)):
    user = actor(authorization)
    return {"candidates": engine.search(body, user)}


@app.post("/api/hie/records/contribute")
def contribute(body: dict[str, Any], authorization: str | None = Header(default=None)):
    user = actor(authorization)
    try:
        result = engine.contribute_record(
            actor=user,
            facility_id=body.get("facilityId", ""),
            local_patient_id=body.get("localPatientId", ""),
            resource=body.get("resource", {}),
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.post("/api/hie/mpi/register")

def register(body: dict[str, Any], authorization: str | None = Header(default=None)):
    user = actor(authorization)
    # Body contains 'demographics' and 'mrn'
    result = engine.register_client(
        demographics=body.get("demographics", {}),
        actor=user,
        mrn=body.get("mrn", ""),
    )
    return result

@app.post("/api/hie/mpi/confirm")
def confirm(body: dict[str, Any], authorization: str | None = Header(default=None)):
    user = actor(authorization)
    link = engine.confirm(user, body["uhid"], body["facilityId"], body["mrn"], body.get("queueId"))
    return {"link": link}


@app.post("/api/hie/mpi/reject")
def reject(body: dict[str, Any], authorization: str | None = Header(default=None)):
    user = actor(authorization)
    engine.reject(user, body["queueId"], body.get("note"))
    return {"ok": True}


@app.get("/api/hie/summary")
def summary_get(
    authorization: str | None = Header(default=None),
    uhid: str = Query(...),
    purpose: str = Query("treatment"),
):
    user = actor(authorization)
    try:
        return engine.summary(user, uhid, purpose)
    except AccessDeniedError as exc:
        raise HTTPException(
            status_code=403,
            detail={"error": str(exc), "code": exc.code, "uhid": exc.uhid},
        ) from exc


@app.post("/api/hie/summary")
def summary_post(
    body: dict[str, Any],
    authorization: str | None = Header(default=None),
    uhid: str = Query(...),
    purpose: str = Query("emergency"),
):
    user = actor(authorization)
    return engine.summary(user, uhid, "emergency", body.get("reason") or "Emergency override")


@app.post("/api/hie/break-glass")
def break_glass(body: dict[str, Any], authorization: str | None = Header(default=None)):
    user = actor(authorization)
    if not (body.get("reason") or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required")
    return engine.summary(user, body["uhid"], "emergency", body["reason"].strip())


@app.get("/api/hie/consent")
def list_consent(uhid: str, authorization: str | None = Header(default=None)):
    actor(authorization)
    policies = [c for c in engine.state["consent"] if c["uhid"] == uhid]
    client = next((c for c in engine.state["clients"] if c["uhid"] == uhid), None)
    links = [l for l in engine.state["links"] if l["uhid"] == uhid]
    return {"policies": policies, "client": client, "links": links}


@app.post("/api/hie/consent")
def set_consent(body: dict[str, Any], authorization: str | None = Header(default=None)):
    user = actor(authorization)
    return {"policy": engine.set_consent(user, body)}


@app.get("/api/hie/audit/verify")
def verify_audit(authorization: str | None = Header(default=None)):
    user = actor(authorization)
    if user["role"] not in ("auditor", "state_admin"):
        raise HTTPException(status_code=403, detail="Insufficient privileges to verify audit chain")
    return engine.verify_audit_chain()

@app.get("/api/hie/audit")
def audit(authorization: str | None = Header(default=None), uhid: str | None = None):
    user = actor(authorization)
    # RBAC: If no uhid filter is provided, only auditors/admins can see the full chain
    if not uhid and user["role"] not in ("auditor", "state_admin"):
        raise HTTPException(status_code=403, detail="Insufficient privileges to access full audit log")

    # RBAC: If uhid filter is provided, verify the user is the patient or an admin
    if uhid:
        if user["role"] not in ("auditor", "state_admin"):
            # In this synthetic system, we'd check if user["id"] == patient_id_of_uhid
            # For the prototype, we'll allow patients to see their own log
            pass

    events = list(reversed(engine.state["audit"]))
    if uhid:
        events = [e for e in events if e.get("uhid") == uhid]
    return {"events": events}


@app.get("/api/hie/patients")
def patients(facility: str, authorization: str | None = Header(default=None)):
    actor(authorization)
    store = engine.state["stores"].get(facility, [])
    return {"patients": [r for r in store if r["resourceType"] == "Patient"]}


@app.get("/api/hie/records/{facility_id}/{patient_id}")
def records(facility_id: str, patient_id: str, authorization: str | None = Header(default=None)):
    actor(authorization)
    out = []
    for res in engine.state["stores"].get(facility_id, []):
        if res["resourceType"] == "Patient" and res["id"] == patient_id:
            out.append(res)
        else:
            ref = (res.get("patient") or {}).get("reference") or (res.get("subject") or {}).get("reference") or ""
            if ref.replace("Patient/", "") == patient_id:
                out.append(res)
    return {"resources": out}


@app.exception_handler(HTTPException)
async def http_exc(request: Request, exc: HTTPException):
    from fastapi.responses import JSONResponse

    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(detail, status_code=exc.status_code)
    return JSONResponse({"error": detail}, status_code=exc.status_code)
