# U-HRES

**Unified Health Record Exchange System.** A federated Health Information Exchange prototype for the Federal University of Technology, Owerri (FUTO) closed network.

Hospitals keep their own records. The campus node holds identity (UHID linked to optional NIN and facility MRNs), a record locator, consent, and an audit trail. Clinical data is queried on demand as FHIR R4 and assembled into a minimum care summary.

This is a **final-year product prototype** on synthetic patients. It is not a live clinical system, not HIPAA/NDPA certified, and not a national warehouse of charts.

## Closed network

| Site | Role | LGA |
| --- | --- | --- |
| FUTO Medical Centre (Ihiagwa) | Campus teaching hospital | Owerri West |
| Federal Medical Centre Owerri | Referral / ER | Owerri Municipal |
| Ihiagwa Primary Health Centre | PHC | Owerri West |

UHID namespace: `NG-IM-########`. NIN is optional.

## Demo story (five minutes)

1. Chidinma Okafor is known at **FUTO Medical Centre** with a penicillin anaphylaxis, hypertension, and T2DM.
2. She arrives at **FMC Owerri Emergency** registered as **Chidinma Okafor-Adeyemi** (no NIN captured).
3. Dr. Emeka Nwosu searches. The matcher proposes **0.91 / confirm**.
4. Summary appears: penicillin allergy from FUTO Medical Centre.
5. Audit shows who accessed what.
6. Patient (or clerk) flips network consent off. Retrieve is denied. Break-glass with a reason. The event is flagged on the audit trail.

Sign in as **Dr. Emeka Nwosu** (`emeeka.nwosu@fmcowerri.gov.ng` / `FutoER2026`).

## Repository

```
backend/          FastAPI exchange (MPI, consent, gateway, audit)
src/              React clinician + patient portal
src/lib/hie/      Domain engine used by the portal (same contract as FastAPI)
env.example       Copy to .env. Never commit secrets.
docker-compose.yml  Optional API container
```

Canonical FHIR resources in v1: Patient, Encounter, AllergyIntolerance, MedicationRequest, Condition, Observation, Immunization, DocumentReference, Consent, AuditEvent.

## Portal (this workspace)

```bash
npm install
npm run dev
```

Run the ER lookup from the overview card.

## FastAPI exchange

See [backend/README.md](backend/README.md). Same `/api/hie/*` contract as the portal.

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Architecture (what you defend)

- **Facility plane.** Local FHIR store / EMR façade (FUTO MC, FMC Owerri, Ihiagwa PHC).
- **Exchange plane.** UHID, matcher, consent, locator, audit. No full-chart warehouse.
- **Consumer plane.** Clinician portal, patient consent page, auditor export.

UHID is the internal key (`NG-IM-########`). NIN is an identifier when present. Matching covers the rest because NIN coverage is incomplete.

Security in this prototype is **role-based access, token authentication, purpose-of-use, break-glass, and full audit**. It is aligned with zero-trust principles. It is not a full zero-trust programme.

## Out of scope

Real EHR vendors, real PHI, VLM/AI diagnosis, HL7 v2 adapters, Kafka, SMART-on-FHIR embed, DHIS2, nationwide rollout, blockchain.
