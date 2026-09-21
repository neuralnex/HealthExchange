"""In-process federated exchange: MPI, consent, FHIR fan-out, audit."""

from __future__ import annotations

import copy
import hashlib
import time
import os
import json
from datetime import datetime, timezone
from typing import Any

from .matching import score_match

STAR_UHID = "NG-IM-00018472"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clone(value: Any) -> Any:
    return copy.deepcopy(value)


def _fhir_patient(pid: str, mrn: str, family: str, given: str, birth: str, sex: str, phone=None, nin=None, address=None):
    ident = [{"system": "urn:ng:mrn", "value": mrn}]
    if nin:
        ident.append({"system": "urn:ng:nin", "value": nin})
    return {
        "resourceType": "Patient",
        "id": pid,
        "identifier": ident,
        "name": [{"family": family, "given": [given]}],
        "gender": sex,
        "birthDate": birth,
        "telecom": [{"system": "phone", "value": phone}] if phone else [],
        "address": [{"text": address}] if address else [],
    }


def _seed() -> dict[str, Any]:
    facilities = [
        {
            "id": "futomc",
            "code": "NG-IM-FUTOMC",
            "name": "FUTO Medical Centre",
            "shortName": "FUTO MC",
            "type": "teaching",
            "lga": "Owerri West",
            "state": "Imo",
            "fhirBaseUrl": "https://fhir.mc.futo.edu.ng/fhir",
            "status": "active",
        },
        {
            "id": "fmco",
            "code": "NG-IM-FMCO",
            "name": "Federal Medical Centre Owerri",
            "shortName": "FMC Owerri",
            "type": "teaching",
            "lga": "Owerri Municipal",
            "state": "Imo",
            "fhirBaseUrl": "https://fhir.fmcowerri.gov.ng/fhir",
            "status": "active",
        },
        {
            "id": "ihiagwa",
            "code": "NG-IM-PHC-IHI",
            "name": "Ihiagwa Primary Health Centre",
            "shortName": "Ihiagwa PHC",
            "type": "phc",
            "lga": "Owerri West",
            "state": "Imo",
            "fhirBaseUrl": "https://fhir.ihiagwa.phc.im.gov.ng/fhir",
            "status": "active",
        },
    ]
    practitioners = [
        {"id": "prac-emeeka", "email": "emeeka.nwosu@fmcowerri.gov.ng", "password": "FutoER2026", "name": "Emeka Nwosu", "title": "Dr.", "role": "clinician", "facilityId": "fmco", "licence": "MDCN-IM-44821", "specialty": "Emergency Medicine"},
        {"id": "prac-adaeze", "email": "adaeze.okonkwo@futo.edu.ng", "password": "CampusWard2026", "name": "Adaeze Okonkwo", "title": "Dr.", "role": "clinician", "facilityId": "futomc", "licence": "MDCN-IM-33019", "specialty": "Internal Medicine"},
        {"id": "prac-blessing", "email": "blessing.amadi@ihiagwa.phc.im.gov.ng", "password": "PhcDesk2026", "name": "Blessing Amadi", "title": "CHEW", "role": "clinician", "facilityId": "ihiagwa", "licence": "CHPRBN-IM-10211", "specialty": "Primary Care"},
        {"id": "prac-ngozi", "email": "ngozi.hart@hie.futo.edu.ng", "password": "Registry2026", "name": "Ngozi Hart", "title": "Mrs.", "role": "registrar", "facilityId": None, "licence": None, "specialty": "Client Registry"},
        {"id": "prac-ibrahim", "email": "ibrahim.sani@hie.futo.edu.ng", "password": "AuditTrail2026", "name": "Ibrahim Sani", "title": "Mr.", "role": "auditor", "facilityId": None, "licence": None, "specialty": "Compliance"},
        {"id": "prac-admin", "email": "campus.admin@hie.futo.edu.ng", "password": "CampusNode2026", "name": "Kelechi Wokoma", "title": "Dr.", "role": "state_admin", "facilityId": None, "licence": "MDCN-IM-11880", "specialty": "Digital Health"},
        {"id": "pat-chidinma", "email": "chidinma.okafor@student.futo.edu.ng", "password": "MyHealth2026", "name": "Chidinma Okafor-Adeyemi", "title": "", "role": "patient", "facilityId": None, "licence": None, "specialty": None},
    ]
    chidinma = {
        "given": "Chidinma",
        "family": "Okafor",
        "otherNames": "Grace",
        "sex": "female",
        "birthDate": "1994-03-12",
        "phone": "08034412291",
        "nin": "23489105673",
        "addressLine": "14 University Road, Ihiagwa",
        "city": "Owerri",
        "lga": "Owerri West",
        "state": "Imo",
    }
    clients = [
        {"uhid": STAR_UHID, "demographics": chidinma, "createdAt": "2025-11-02T09:00:00Z"},
        {"uhid": "NG-IM-00019001", "demographics": {"given": "Ikenna", "family": "Eze", "sex": "male", "birthDate": "1998-07-04", "phone": "08055501901", "nin": "11223344556", "addressLine": "7 Works Layout", "city": "Owerri", "lga": "Owerri Municipal", "state": "Imo"}, "createdAt": "2025-11-02T09:00:00Z"},
        {"uhid": "NG-IM-00019002", "demographics": {"given": "Ikechukwu", "family": "Eze", "sex": "male", "birthDate": "1998-07-04", "phone": "08055501902", "nin": "11223344557", "addressLine": "7 Works Layout", "city": "Owerri", "lga": "Owerri Municipal", "state": "Imo"}, "createdAt": "2025-11-02T09:00:00Z"},
        {"uhid": "NG-IM-00023015", "demographics": {"given": "Fatima", "family": "Bello", "sex": "female", "birthDate": "2001-05-09", "phone": "09014443321", "nin": "77889900112", "addressLine": "Control Post", "city": "Owerri", "lga": "Owerri West", "state": "Imo"}, "createdAt": "2025-11-02T09:00:00Z"},
        {"uhid": "NG-IM-00022008", "demographics": {"given": "Tari", "family": "Dappa", "sex": "male", "birthDate": "1968-01-30", "phone": "08033330008", "addressLine": "Douglas Road", "city": "Owerri", "lga": "Owerri Municipal", "state": "Imo"}, "createdAt": "2025-11-02T09:00:00Z"},
    ]
    links = [
        {"id": "link-18472-futomc", "uhid": STAR_UHID, "facilityId": "futomc", "mrn": "FUTOMC-1001", "localPatientId": "futomc-pt-1001", "categories": ["AllergyIntolerance", "MedicationRequest", "Condition", "Encounter"], "lastUpdated": "2026-08-14T16:40:00Z", "status": "active"},
        {"id": "link-19001-futomc", "uhid": "NG-IM-00019001", "facilityId": "futomc", "mrn": "FUTOMC-2044", "localPatientId": "futomc-pt-2044", "categories": ["Condition"], "lastUpdated": "2026-06-01T10:00:00Z", "status": "active"},
        {"id": "link-19002-fmco", "uhid": "NG-IM-00019002", "facilityId": "fmco", "mrn": "FMCO-3310", "localPatientId": "fmco-pt-3310", "categories": ["Condition"], "lastUpdated": "2026-05-20T11:00:00Z", "status": "active"},
        {"id": "link-22008-futomc", "uhid": "NG-IM-00022008", "facilityId": "futomc", "mrn": "FUTOMC-5510", "localPatientId": "futomc-pt-5510", "categories": ["Condition"], "lastUpdated": "2026-08-28T12:00:00Z", "status": "active"},
        {"id": "link-23015-fmco", "uhid": "NG-IM-00023015", "facilityId": "fmco", "mrn": "FMCO-7781", "localPatientId": "fmco-pt-7781", "categories": ["Condition"], "lastUpdated": "2026-09-12T18:00:00Z", "status": "active"},
    ]
    consent = [
        {"id": "con-18472-net", "uhid": STAR_UHID, "scope": "network", "directive": "permit", "purpose": ["treatment", "emergency"], "note": "Opt-in captured at FUTO Medical Centre registration, March 2025.", "updatedAt": "2025-03-18T10:00:00Z"},
        {"id": "con-23015-net", "uhid": "NG-IM-00023015", "scope": "network", "directive": "deny", "purpose": ["treatment", "emergency"], "note": "Network opt-out. Emergency break-glass still available.", "updatedAt": "2026-01-15T08:00:00Z"},
        {"id": "con-22008-net", "uhid": "NG-IM-00022008", "scope": "network", "directive": "permit", "purpose": ["treatment", "emergency"], "updatedAt": "2025-06-01T08:00:00Z"},
    ]
    stores = {
        "futomc": [
            _fhir_patient("futomc-pt-1001", "FUTOMC-1001", "Okafor", "Chidinma Grace", "1994-03-12", "female", "08034412291", "23489105673", "14 University Road, Ihiagwa"),
            {
                "resourceType": "AllergyIntolerance",
                "id": "futomc-al-1001",
                "clinicalStatus": {"coding": [{"code": "active"}]},
                "criticality": "high",
                "code": {"text": "Penicillin G"},
                "patient": {"reference": "Patient/futomc-pt-1001"},
                "recordedDate": "2019-06-11",
                "reaction": [{"manifestation": [{"text": "Anaphylaxis: facial swelling, wheeze, hypotension (2019)"}], "severity": "severe"}],
            },
            {"resourceType": "MedicationRequest", "id": "futomc-med-1001a", "status": "active", "intent": "order", "medicationCodeableConcept": {"text": "Amlodipine 10 mg tablet"}, "subject": {"reference": "Patient/futomc-pt-1001"}, "authoredOn": "2026-02-01", "dosageInstruction": [{"text": "10 mg oral daily"}]},
            {"resourceType": "MedicationRequest", "id": "futomc-med-1001b", "status": "active", "intent": "order", "medicationCodeableConcept": {"text": "Metformin 500 mg tablet"}, "subject": {"reference": "Patient/futomc-pt-1001"}, "authoredOn": "2025-11-20", "dosageInstruction": [{"text": "500 mg oral twice daily"}]},
            {"resourceType": "Condition", "id": "futomc-cd-1001a", "clinicalStatus": {"coding": [{"code": "active"}]}, "code": {"text": "Essential hypertension"}, "subject": {"reference": "Patient/futomc-pt-1001"}, "recordedDate": "2024-01-08"},
            {"resourceType": "Condition", "id": "futomc-cd-1001b", "clinicalStatus": {"coding": [{"code": "active"}]}, "code": {"text": "Type 2 diabetes mellitus"}, "subject": {"reference": "Patient/futomc-pt-1001"}, "recordedDate": "2025-11-20"},
            {"resourceType": "Encounter", "id": "futomc-enc-1001", "status": "finished", "class": {"code": "IMP", "display": "Inpatient"}, "type": [{"text": "Inpatient: hypertensive urgency with malaria"}], "subject": {"reference": "Patient/futomc-pt-1001"}, "period": {"start": "2026-08-11T09:10:00Z", "end": "2026-08-14T16:20:00Z"}},
            {"resourceType": "Observation", "id": "futomc-obs-1001a", "status": "final", "code": {"text": "Blood pressure"}, "subject": {"reference": "Patient/futomc-pt-1001"}, "effectiveDateTime": "2026-08-11T09:20:00Z", "valueQuantity": {"value": "168/102", "unit": "mmHg"}},
            {"resourceType": "DocumentReference", "id": "futomc-doc-1001", "status": "current", "type": {"text": "Discharge summary"}, "subject": {"reference": "Patient/futomc-pt-1001"}, "date": "2026-08-14T16:30:00Z", "description": "FUTO Medical Centre discharge summary, 14 Aug 2026", "content": [{"attachment": {"contentType": "text/plain", "title": "Discharge", "data": "Mrs Chidinma Okafor, 32F. Known T2DM and hypertension. Documented penicillin anaphylaxis; do not give beta-lactams."}}]},
            _fhir_patient("futomc-pt-2044", "FUTOMC-2044", "Eze", "Ikenna", "1998-07-04", "male", "08055501901", "11223344556"),
            {"resourceType": "Condition", "id": "futomc-cd-2044", "clinicalStatus": {"coding": [{"code": "active"}]}, "code": {"text": "Sickle cell disease (HbSS)"}, "subject": {"reference": "Patient/futomc-pt-2044"}},
            _fhir_patient("futomc-pt-5510", "FUTOMC-5510", "Dappa", "Tari", "1968-01-30", "male", "08033330008"),
            {"resourceType": "Condition", "id": "futomc-cd-5510", "clinicalStatus": {"coding": [{"code": "active"}]}, "code": {"text": "Heart failure with reduced EF"}, "subject": {"reference": "Patient/futomc-pt-5510"}},
        ],
        "fmco": [
            _fhir_patient("fmco-pt-8842", "FMCO-8842", "Okafor-Adeyemi", "Chidinma", "1994-03-12", "female", "0803 441 2291", None, "New Owerri"),
            {"resourceType": "Encounter", "id": "fmco-enc-8842", "status": "in-progress", "class": {"code": "EMER", "display": "Emergency"}, "type": [{"text": "Emergency: suspected pyelonephritis"}], "subject": {"reference": "Patient/fmco-pt-8842"}, "period": {"start": "2026-09-20T11:05:00Z"}},
            {"resourceType": "Observation", "id": "fmco-obs-8842a", "status": "final", "code": {"text": "Triage blood pressure"}, "subject": {"reference": "Patient/fmco-pt-8842"}, "effectiveDateTime": "2026-09-20T11:08:00Z", "valueQuantity": {"value": "158/96", "unit": "mmHg"}},
            {"resourceType": "Observation", "id": "fmco-obs-8842b", "status": "final", "code": {"text": "Temperature"}, "subject": {"reference": "Patient/fmco-pt-8842"}, "effectiveDateTime": "2026-09-20T11:08:00Z", "valueQuantity": {"value": "38.6", "unit": "°C"}},
            _fhir_patient("fmco-pt-3310", "FMCO-3310", "Eze", "Ikechukwu", "1998-07-04", "male", "08055501902", "11223344557"),
            {"resourceType": "Condition", "id": "fmco-cd-3310", "clinicalStatus": {"coding": [{"code": "active"}]}, "code": {"text": "Asthma, moderate persistent"}, "subject": {"reference": "Patient/fmco-pt-3310"}},
            _fhir_patient("fmco-pt-7781", "FMCO-7781", "Bello", "Fatima", "2001-05-09", "female", "09014443321", "77889900112"),
            {"resourceType": "Condition", "id": "fmco-cd-7781", "clinicalStatus": {"coding": [{"code": "active"}]}, "code": {"text": "First episode psychosis (provisional)"}, "subject": {"reference": "Patient/fmco-pt-7781"}},
        ],
        "ihiagwa": [
            _fhir_patient("ihi-pt-077", "PHC-IHI-077", "Dappa", "Tari", "1968-01-30", "male", "08033330008"),
            {"resourceType": "Immunization", "id": "ihi-imm-077", "status": "completed", "vaccineCode": {"text": "Influenza (inactivated)"}, "patient": {"reference": "Patient/ihi-pt-077"}, "occurrenceDateTime": "2026-09-10"},
        ],
    }
    er_demo = {
        "given": "Chidinma",
        "family": "Okafor-Adeyemi",
        "sex": "female",
        "birthDate": "1994-03-12",
        "phone": "0803 441 2291",
        "addressLine": "New Owerri",
        "city": "Owerri",
        "lga": "Owerri Municipal",
        "state": "Imo",
    }
    scored = score_match(er_demo, chidinma)
    queue = [
        {
            "id": "q-er-chidinma",
            "left": {"facilityId": "fmco", "mrn": "FMCO-8842", "demographics": er_demo},
            "rightUhid": STAR_UHID,
            "score": scored.score,
            "band": scored.band,
            "reasons": scored.reasons,
            "status": "pending",
        }
    ]
    return {
        "facilities": facilities,
        "practitioners": practitioners,
        "clients": clients,
        "links": links,
        "consent": consent,
        "stores": stores,
        "queue": queue,
        "audit": [],
    }


class AuthError(Exception):
    pass


class AccessDeniedError(Exception):
    def __init__(self, message: str, uhid: str):
        super().__init__(message)
        self.uhid = uhid
        self.code = "CONSENT_DENIED"


class Engine:
    def __init__(self) -> None:
        self.data_dir = "data"
        self.stores_dir = os.path.join(self.data_dir, "stores")
        self.registry_dir = os.path.join(self.data_dir, "registry")
        self.system_dir = os.path.join(self.data_dir, "system")

        # Ensure directories exist
        os.makedirs(self.stores_dir, exist_ok=True)
        os.makedirs(self.registry_dir, exist_ok=True)
        os.makedirs(self.system_dir, exist_ok=True)

        self.reset()

    def _save_json(self, path: str, data: Any) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)

    def _load_json(self, path: str, default: Any) -> Any:
        if not os.path.exists(path):
            return default
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return default

    def reset(self) -> None:
        # Load registries
        self.state = {
            "facilities": self._load_json(os.path.join(self.registry_dir, "facilities.json"), []),
            "practitioners": self._load_json(os.path.join(self.system_dir, "practitioners.json"), []),
            "clients": self._load_json(os.path.join(self.registry_dir, "clients.json"), []),
            "links": self._load_json(os.path.join(self.registry_dir, "links.json"), []),
            "consent": self._load_json(os.path.join(self.registry_dir, "consent.json"), []),
            "queue": self._load_json(os.path.join(self.system_dir, "queue.json"), []),
            "audit": self._load_json(os.path.join(self.system_dir, "audit.json"), []),
            "stores": {}, # Loaded on demand
        }

        # First-run migration: if critical registries are empty, use seed
        if not self.state["facilities"]:
            seed_data = _seed()
            self.state.update(seed_data)

            # Persist seeded data
            self._save_json(os.path.join(self.registry_dir, "facilities.json"), self.state["facilities"])
            self._save_json(os.path.join(self.system_dir, "practitioners.json"), self.state["practitioners"])
            self._save_json(os.path.join(self.registry_dir, "clients.json"), self.state["clients"])
            self._save_json(os.path.join(self.registry_dir, "links.json"), self.state["links"])
            self._save_json(os.path.join(self.registry_dir, "consent.json"), self.state["consent"])
            self._save_json(os.path.join(self.system_dir, "queue.json"), self.state["queue"])
            self._save_json(os.path.join(self.system_dir, "audit.json"), self.state["audit"])

            # Persist stores
            for fid, resources in self.state["stores"].items():
                self._save_json(os.path.join(self.stores_dir, f"{fid}.json"), resources)

            self._audit(
                actorId="system",
                actorName="U-HRES",
                orgId=None,
                orgName="State node",
                action="system.seed",
                resource="ClientRegistry",
                outcome="success",
                breakGlass=False,
            )


    def _facility_name(self, fid: str | None) -> str:
        if not fid:
            return "FUTO Health Exchange"
        for f in self.state["facilities"]:
            if f["id"] == fid:
                return f["shortName"]
        return fid or "FUTO Health Exchange"

    def _audit(self, **partial: Any) -> dict:
        prev = self.state["audit"][-1]["hash"] if self.state["audit"] else "genesis"
        ts = _now()
        event_id = f"aud-{len(self.state['audit']) + 1}"
        payload = json_dumps({**partial, "ts": ts, "id": event_id, "prevHash": prev})
        digest = hashlib.sha256((prev + payload).encode()).hexdigest()[:16]
        event = {**partial, "id": event_id, "ts": ts, "ip": "10.20.4.12", "prevHash": prev, "hash": digest}
        self.state["audit"].append(event)

        # Persist audit trail
        self._save_json(os.path.join(self.system_dir, "audit.json"), self.state["audit"])

        return event

    def _generate_uhid(self) -> str:
        """Generates a unique UHID following the NG-IM-######## pattern."""
        existing_uhids = [c["uhid"] for c in self.state["clients"]]
        suffixes = []
        for u in existing_uhids:
            if u.startswith("NG-IM-") and len(u) == 15:
                try:
                    suffixes.append(int(u[6:]))
                except ValueError:
                    continue

        next_id = max(suffixes) + 1 if suffixes else 18472
        return f"NG-IM-{next_id:08d}"

    def register_client(self, demographics: dict, actor: dict, mrn: str) -> dict:
        """
        Generates a UHID, stores demographics, links to facility MRN, and audits.
        """
        uhid = self._generate_uhid()

        # 1. Create and store the client record
        client = {
            "uhid": uhid,
            "demographics": demographics,
            "createdAt": _now(),
        }
        self.state["clients"].append(client)
        self._save_json(os.path.join(self.registry_dir, "clients.json"), self.state["clients"])

        # 2. Create initial link to the registering facility
        facility_id = actor.get("facilityId")
        local_id = f"{facility_id}-{mrn}" if facility_id else f"unknown-{mrn}"

        link = {
            "id": f"link-{uhid.split('-')[-1]}-{facility_id}",
            "uhid": uhid,
            "facilityId": facility_id,
            "mrn": mrn,
            "localPatientId": local_id,
            "categories": [],
            "lastUpdated": _now(),
            "status": "active",
        }
        self.state["links"].append(link)
        self._save_json(os.path.join(self.registry_dir, "links.json"), self.state["links"])

        # 3. Audit the registration event
        self._audit(
            actorId=actor["id"],
            actorName=f"{actor.get('title', '')} {actor['name']}".strip(),
            orgId=facility_id,
            orgName=self._facility_name(facility_id),
            action="mpi.register",
            resource="ClientRegistry",
            outcome="success",
            breakGlass=False,
            uhid=uhid,
            purpose="treatment",
        )

        return {"client": client, "link": link}

    def contribute_record(self, actor: dict, facility_id: str, local_patient_id: str, resource: dict) -> dict:
        """
        Appends a clinical resource to a facility store and updates the Record Link categories.
        """
        # 1. Facility Validation
        if not any(f["id"] == facility_id for f in self.state["facilities"]):
            raise ValueError(f"Facility {facility_id} not found")

        # 2. Append to store (File-based FHIR Facade)
        store_path = os.path.join(self.stores_dir, f"{facility_id}.json")
        resources = self._load_json(store_path, [])
        resources.append(resource)
        self._save_json(store_path, resources)

        # Update in-memory cache
        self.state["stores"][facility_id] = resources

        # 3. Update Record Link categories
        link = next(
            (l for l in self.state["links"]
             if l["facilityId"] == facility_id and l["localPatientId"] == local_patient_id),
            None
        )

        uhid = None
        if link:
            rtype = resource.get("resourceType")
            if rtype and rtype not in link["categories"]:
                link["categories"].append(rtype)
            link["lastUpdated"] = _now()
            self._save_json(os.path.join(self.registry_dir, "links.json"), self.state["links"])
            uhid = link["uhid"]

        # 4. Audit event
        self._audit(
            actorId=actor["id"],
            actorName=f"{actor.get('title', '')} {actor['name']}".strip(),
            orgId=facility_id,
            orgName=self._facility_name(facility_id),
            action="clinical.contribute",
            resource=f"{resource.get('resourceType', 'Unknown')}/{resource.get('id', 'new')}",
            outcome="success",
            breakGlass=False,
            uhid=uhid,
            purpose="treatment",
        )

        return {"ok": True, "link": link}

    def verify_audit_chain(self) -> dict:
        """
        Verifies the integrity of the audit trail by re-calculating the hash chain.
        Returns a report indicating if the chain is verified or where corruption occurred.
        """
        expected_prev_hash = "genesis"

        for index, event in enumerate(self.state["audit"]):
            # 1. Verify the pointer (previous hash link)
            if event["prevHash"] != expected_prev_hash:
                return {
                    "verified": False,
                    "corruptionIndex": index,
                    "details": f"Chain broken at event {event['id']}: expected prevHash {expected_prev_hash}, found {event['prevHash']}"
                }

            # 2. Reconstruct payload for hash verification
            # Remove 'hash' to get the original data used for the digest
            payload_data = {k: v for k, v in event.items() if k != "hash"}
            reconstructed_payload = json_dumps(payload_data)

            # 3. Recalculate digest: sha256(prevHash + payload)
            calculated_hash = hashlib.sha256(
                (expected_prev_hash + reconstructed_payload).encode()
            ).hexdigest()[:16]

            if calculated_hash != event["hash"]:
                return {
                    "verified": False,
                    "corruptionIndex": index,
                    "details": f"Data corruption at event {event['id']}: calculated {calculated_hash}, stored {event['hash']}"
                }

            # Move the pointer forward
            expected_prev_hash = event["hash"]

        return {
            "verified": True,
            "corruptionIndex": None,
            "details": "Audit chain integrity verified. All hashes match.",
            "chainLength": len(self.state["audit"])
        }

    def to_session(self, prac: dict) -> dict:
        fac = next((f for f in self.state["facilities"] if f["id"] == prac["facilityId"]), None)
        return {
            "id": prac["id"],
            "email": prac["email"],
            "name": prac["name"],
            "title": prac["title"],
            "role": prac["role"],
            "facilityId": prac["facilityId"],
            "facilityName": fac["name"] if fac else "FUTO Health Exchange",
            "licence": prac["licence"],
            "specialty": prac["specialty"],
        }

    def login(self, email: str, password: str) -> dict:
        prac = next(
            (
                p
                for p in self.state["practitioners"]
                if p["email"].lower() == email.strip().lower() and p["password"] == password
            ),
            None,
        )
        if not prac:
            raise AuthError("Email or password is not recognised")
        session = self.to_session(prac)
        self._audit(
            actorId=prac["id"],
            actorName=f"{prac['title']} {prac['name']}".strip(),
            orgId=prac["facilityId"],
            orgName=self._facility_name(prac["facilityId"]),
            action="auth.login",
            resource="Session",
            outcome="success",
            breakGlass=False,
        )
        return session

    def practitioner(self, user_id: str) -> dict | None:
        return next((p for p in self.state["practitioners"] if p["id"] == user_id), None)

    def personas(self) -> list[dict]:
        hints = {
            "emeeka.nwosu@fmcowerri.gov.ng": "FutoER2026",
            "adaeze.okonkwo@futo.edu.ng": "CampusWard2026",
            "blessing.amadi@ihiagwa.phc.im.gov.ng": "PhcDesk2026",
            "ngozi.hart@hie.futo.edu.ng": "Registry2026",
            "ibrahim.sani@hie.futo.edu.ng": "AuditTrail2026",
            "campus.admin@hie.futo.edu.ng": "CampusNode2026",
            "chidinma.okafor@student.futo.edu.ng": "MyHealth2026",
        }
        out = []
        for p in self.state["practitioners"]:
            s = self.to_session(p)
            s["passwordHint"] = hints.get(p["email"], "")
            out.append(s)
        return out

    def search(self, query: dict, actor: dict) -> list[dict]:
        results = []
        for client in self.state["clients"]:
            scored = score_match(query, client["demographics"])
            if scored.band == "no-match" and scored.score < 0.45:
                continue
            links = [l for l in self.state["links"] if l["uhid"] == client["uhid"] and l["status"] == "active"]
            results.append(
                {
                    "uhid": client["uhid"],
                    "score": scored.score,
                    "band": scored.band,
                    "reasons": scored.reasons,
                    "demographics": client["demographics"],
                    "links": links,
                    "alreadyLinkedToRequester": any(l["facilityId"] == actor.get("facilityId") for l in links),
                }
            )
        results.sort(key=lambda r: r["score"], reverse=True)
        self._audit(
            actorId=actor["id"],
            actorName=f"{actor.get('title', '')} {actor['name']}".strip(),
            orgId=actor.get("facilityId"),
            orgName=self._facility_name(actor.get("facilityId")),
            action="mpi.search",
            resource="ClientRegistry",
            outcome="success",
            breakGlass=False,
            uhid=results[0]["uhid"] if results else None,
            purpose="treatment",
        )
        return results[:8]

    def confirm(self, actor: dict, uhid: str, facility_id: str, mrn: str, queue_id: str | None = None) -> dict:
        existing = next((l for l in self.state["links"] if l["uhid"] == uhid and l["facilityId"] == facility_id and l["mrn"] == mrn), None)
        if existing:
            existing["status"] = "active"
            self._save_json(os.path.join(self.registry_dir, "links.json"), self.state["links"])
            return existing
        local_id = "fmco-pt-8842" if mrn == "FMCO-8842" else f"{facility_id}-{mrn}"
        link = {
            "id": f"link-{uhid}-{facility_id}",
            "uhid": uhid,
            "facilityId": facility_id,
            "mrn": mrn,
            "localPatientId": local_id,
            "categories": [],
            "lastUpdated": _now(),
            "status": "active",
        }
        self.state["links"].append(link)
        self._save_json(os.path.join(self.registry_dir, "links.json"), self.state["links"])
        if queue_id:
            for item in self.state["queue"]:
                if item["id"] == queue_id:
                    item["status"] = "confirmed"
            self._save_json(os.path.join(self.system_dir, "queue.json"), self.state["queue"])
        self._audit(
            actorId=actor["id"],
            actorName=f"{actor.get('title', '')} {actor['name']}".strip(),
            orgId=actor.get("facilityId"),
            orgName=self._facility_name(actor.get("facilityId")),
            action="mpi.confirm",
            resource=f"RecordLink/{link['id']}",
            outcome="success",
            breakGlass=False,
            uhid=uhid,
            purpose="treatment",
        )
        return link

    def reject(self, actor: dict, queue_id: str, note: str | None = None) -> None:
        item = next((q for q in self.state["queue"] if q["id"] == queue_id), None)
        if not item:
            raise ValueError("Unknown queue item")
        item["status"] = "rejected"
        self._save_json(os.path.join(self.system_dir, "queue.json"), self.state["queue"])
        self._audit(
            actorId=actor["id"],
            actorName=f"{actor.get('title', '')} {actor['name']}".strip(),
            orgId=actor.get("facilityId"),
            orgName=self._facility_name(actor.get("facilityId")),
            action="mpi.reject",
            resource=f"MatchQueue/{queue_id}",
            outcome="success",
            breakGlass=False,
            uhid=item["rightUhid"],
            reason=note,
            purpose="treatment",
        )

    def _consent(self, uhid: str, requester_org: str | None) -> dict:
        policies = [c for c in self.state["consent"] if c["uhid"] == uhid]
        facility_deny = next((p for p in policies if p["scope"] == "facility" and p.get("targetFacilityId") == requester_org and p["directive"] == "deny"), None)
        if facility_deny:
            return {"allowed": False, "directive": "deny", "note": facility_deny.get("note") or "Patient has blocked this facility."}
        network = next((p for p in policies if p["scope"] == "network"), None)
        if network and network["directive"] == "deny":
            return {"allowed": False, "directive": "deny", "note": network.get("note") or "Patient has opted out of network sharing."}
        if network and network["directive"] == "permit":
            return {"allowed": True, "directive": "permit", "note": network.get("note") or "Network treatment consent on file."}
        return {"allowed": False, "directive": "deny", "note": "No consent on file. Capture consent or use emergency break-glass."}

    def summary(self, actor: dict, uhid: str, purpose: str, break_glass: str | None = None) -> dict:
        started = time.perf_counter()
        client = next((c for c in self.state["clients"] if c["uhid"] == uhid), None)
        if not client:
            raise ValueError("Unknown UHID")
        consent = self._consent(uhid, actor.get("facilityId"))
        emergency = purpose == "emergency" and bool(break_glass)
        actor_name = f"{actor.get('title', '')} {actor['name']}".strip()
        if not consent["allowed"] and not emergency:
            self._audit(
                actorId=actor["id"], actorName=actor_name, orgId=actor.get("facilityId"),
                orgName=self._facility_name(actor.get("facilityId")), action="summary.denied",
                resource=f"Patient/{uhid}", outcome="denied", breakGlass=False, uhid=uhid,
                purpose=purpose, reason=consent["note"],
            )
            raise AccessDeniedError(consent["note"], uhid)
        if emergency and not consent["allowed"]:
            self._audit(
                actorId=actor["id"], actorName=actor_name, orgId=actor.get("facilityId"),
                orgName=self._facility_name(actor.get("facilityId")), action="break-glass",
                resource=f"Patient/{uhid}", outcome="flagged", breakGlass=True, uhid=uhid,
                purpose="emergency", reason=break_glass,
            )
        buckets: dict[str, list] = {k: [] for k in ("AllergyIntolerance", "MedicationRequest", "Condition", "Encounter", "Observation", "Immunization", "DocumentReference")}
        sources = []
        for link in [l for l in self.state["links"] if l["uhid"] == uhid and l["status"] == "active"]:
            fac = next(f for f in self.state["facilities"] if f["id"] == link["facilityId"])
            sources.append({"facilityId": link["facilityId"], "facilityName": fac["shortName"], "lastUpdated": link["lastUpdated"]})

            # Load store from file
            store_path = os.path.join(self.stores_dir, f"{link['facilityId']}.json")
            resources = self._load_json(store_path, [])

            for res in resources:
                ref = _patient_ref(res)
                if res["resourceType"] != "Patient" and ref == link["localPatientId"]:
                    item = {**res, "meta": {"source": fac["shortName"]}}
                    buckets.setdefault(res["resourceType"], []).append(item)
        self._audit(
            actorId=actor["id"], actorName=actor_name, orgId=actor.get("facilityId"),
            orgName=self._facility_name(actor.get("facilityId")), action="summary.read",
            resource=f"Patient/{uhid}",
            outcome="flagged" if emergency and not consent["allowed"] else "success",
            breakGlass=bool(emergency and not consent["allowed"]),
            uhid=uhid, purpose=purpose, reason=break_glass,
        )


        def pack(rtype: str) -> dict:
            return {"items": buckets.get(rtype, []), "provenance": [s for s in sources]}

        return {
            "uhid": uhid,
            "patient": {**client["demographics"], "uhid": uhid},
            "consent": {
                "allowed": True,
                "directive": "break-glass" if emergency and not consent["allowed"] else consent["directive"],
                "note": f"Emergency override: {break_glass}" if emergency and not consent["allowed"] else consent["note"],
            },
            "allergies": pack("AllergyIntolerance"),
            "medications": pack("MedicationRequest"),
            "conditions": pack("Condition"),
            "encounters": pack("Encounter"),
            "observations": pack("Observation"),
            "immunizations": pack("Immunization"),
            "documents": pack("DocumentReference"),
            "sources": sources,
            "assembledAt": _now(),
            "elapsedMs": int((time.perf_counter() - started) * 1000),
        }

    def set_consent(self, actor: dict, body: dict) -> dict:
        existing = next(
            (
                c
                for c in self.state["consent"]
                if c["uhid"] == body["uhid"]
                and c["scope"] == body["scope"]
                and (body["scope"] == "network" or c.get("targetFacilityId") == body.get("targetFacilityId"))
            ),
            None,
        )
        policy = existing or {
            "id": f"con-{body['uhid']}-{body['scope']}-{body.get('targetFacilityId') or 'net'}",
            "uhid": body["uhid"],
            "scope": body["scope"],
            "targetFacilityId": body.get("targetFacilityId"),
            "directive": body["directive"],
            "purpose": body.get("purpose") or ["treatment", "emergency"],
            "note": body.get("note"),
            "updatedAt": _now(),
        }
        policy["directive"] = body["directive"]
        policy["note"] = body.get("note", policy.get("note"))
        policy["updatedAt"] = _now()
        if not existing:
            self.state["consent"].append(policy)
        self._save_json(os.path.join(self.registry_dir, "consent.json"), self.state["consent"])
        self._audit(
            actorId=actor["id"],
            actorName=f"{actor.get('title', '')} {actor['name']}".strip(),
            orgId=actor.get("facilityId"),
            orgName=self._facility_name(actor.get("facilityId")),
            action="consent.update",
            resource=f"Consent/{policy['id']}",
            outcome="success",
            breakGlass=False,
            uhid=body["uhid"],
            purpose="treatment",
            reason=f"{body['scope']} {body['directive']}",
        )
        return policy

    def stats(self) -> dict:
        return {
            "facilities": len(self.state["facilities"]),
            "clients": len(self.state["clients"]),
            "links": len([l for l in self.state["links"] if l["status"] == "active"]),
            "pendingMatches": len([q for q in self.state["queue"] if q["status"] == "pending"]),
            "auditEvents": len(self.state["audit"]),
            "breakGlass": len([a for a in self.state["audit"] if a.get("breakGlass")]),
        }


def _patient_ref(res: dict) -> str | None:
    raw = (res.get("patient") or {}).get("reference") or (res.get("subject") or {}).get("reference")
    if not raw:
        return res["id"] if res.get("resourceType") == "Patient" else None
    return raw.replace("Patient/", "")


def json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, sort_keys=True, default=str)


engine = Engine()
