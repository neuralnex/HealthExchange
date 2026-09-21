# U-HRES
**Unified Health Record Exchange System.** A federated Health Information Exchange (HIE) prototype for the Federal University of Technology, Owerri (FUTO) closed network.

## 🌟 Project Vision
U-HRES solves the problem of fragmented patient data across different healthcare facilities. Instead of a centralized warehouse (which poses security and ownership risks), U-HRES implements a **Federated Architecture**. Clinical data stays at the facility of origin, while a central "Exchange Plane" manages identity, consent, and a tamper-evident audit trail.

## 🛠 Core Architecture (The "Defendable" Part)

### 1. The Facility Plane (Data Sovereignty)
Each facility (FUTO MC, FMC Owerri, Ihiagwa PHC) maintains its own **FHIR Facade**. 
- **Data Model**: FHIR R4 resources (Patient, Observation, Condition, etc.).
- **Persistence**: Facility-specific JSON stores.
- **Sovereignty**: Facilities retain full control over their records; data is only shared upon valid consent or emergency override.

### 2. The Exchange Plane (The Glue)
The central node handles the "administrative" side of the exchange:
- **Master Patient Index (MPI)**: Uses weighted string matching (Jaro-Winkler) to resolve identities across facilities without requiring a perfect NIN.
- **Unified Health ID (UHID)**: Generates a global identifier (`NG-IM-########`) to link fragmented records.
- **Consent Engine**: Manages "Permit" or "Deny" directives at the network or facility level.
- **Cryptographic Audit Trail**: Every access event is hashed and chained (`sha256(prevHash + payload)`), making the log tamper-evident.

### 3. The Consumer Plane (The Interface)
A modern React-based portal providing:
- **Clinician View**: Search, UHID confirmation, and a "Minimum Care Summary" (assembled on-the-fly from federated stores).
- **Patient View**: Transparency log showing exactly who accessed their data and why.
- **Emergency Access**: "Break-Glass" functionality for life-critical situations, which triggers a high-priority audit flag.

## 🚀 End-to-End Flow
1. **Onboarding**: Registrar $\rightarrow$ MPI Search $\rightarrow$ UHID Assignment $\rightarrow$ Record Linkage.
2. **Contribution**: Clinician $\rightarrow$ Add FHIR Resource $\rightarrow$ Facility Store $\rightarrow$ Update Link Categories.
3. **Retrieval**: Search $\rightarrow$ Consent Check $\rightarrow$ Federated Query $\rightarrow$ Summary Assembly.
4. **Audit**: Access Event $\rightarrow$ Hash Chain $\rightarrow$ Auditor Verification.

## 📦 Repository Structure
```
backend/          FastAPI exchange (MPI, consent, gateway, audit, persistence)
src/              React clinician + patient portal
src/lib/hie/      Domain engine used by the portal
docker-compose.yml  Full stack orchestration with persistent volumes
```

## 🛠 Getting Started

### Backend (API)
```bash
docker-compose up -d --build
```
The API runs on port `8000`. Data is persisted in a Docker volume (`hie_data`).

### Frontend (Portal)
```bash
npm install
npm run dev
```

## ⚠️ Project Scope
This is a **final-year academic prototype**.
- **Included**: Role-Based Access Control (RBAC), Token Auth, FHIR-like data model, Cryptographic Audit.
- **Out of Scope**: Live EHR integration, HIPAA/NDPA certification, Blockchain, National-scale rollout.
