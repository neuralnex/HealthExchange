# U-HRES
**Unified Health Record Exchange System.** A federated Health Information Exchange (HIE) prototype for the Federal University of Technology, Owerri (FUTO) closed network.

## 🌟 Project Vision
U-HRES solves the problem of fragmented patient data across different healthcare facilities. Instead of a centralized warehouse, U-HRES implements a **Federated Architecture**. Clinical data stays at the facility of origin, while a central "Exchange Plane" manages identity, consent, and a tamper-evident audit trail.

## 🛠 Core Architecture
- **Facility Plane**: Data sovereignty via FHIR Facades (FUTO MC, FMC Owerri, Ihiagwa PHC).
- **Exchange Plane**: MPI (Identity resolution), UHID generation, Consent management, and Hash-chained auditing.
- **Consumer Plane**: Clinician Portal (Summary assembly) and Patient Portal (Transparency log).

---

## 🚀 Operations Guide

### 1. Starting the System
The project uses a dual-stack architecture (FastAPI Backend + React Frontend).

**A. Start the Backend (API & Data Store)**
```bash
# Navigate to project root
cd /home/meru/Desktop/FINAL_YEAR/Ebuka/HealthExchange

# Build and start the containerized exchange node
docker-compose up -d --build
```
*The backend runs on `http://localhost:8000`.*

**B. Start the Frontend (User Portal)**
```bash
# Install dependencies (first time only)
npm install

# Launch the development server
npm run dev
```
*The frontend runs on `http://localhost:8080`.*

### 2. Stopping the System
```bash
# Stop the backend containers
docker-compose down

# Stop the frontend (Ctrl+C in the terminal where npm run dev is running)
```

### 3. Maintenance
- **Reset Data**: To wipe all records and return to seed data:
  `curl -X POST http://localhost:8000/api/hie/demo/reset`
- **Check Health**: `curl http://localhost:8000/api/hie/health`

---

## 🧪 UI Testing Checklist (End-to-End)

Follow these steps in the browser to verify the full clinical lifecycle:

### Phase 1: Patient Onboarding (The Registrar)
1.  **Login**: Use `ngozi.hart@hie.futo.edu.ng` / `Registry2026`.
2.  **Action**: Go to **Registration** $\rightarrow$ Enter new patient details (e.g., Kelechi Amadi) $\rightarrow$ Submit.
3.  **Verify**: Note the generated **UHID** (e.g., `NG-IM-00018472`).

### Phase 2: Clinical Contribution (The Clinician)
1.  **Login**: Use `adaeze.okonkwo@futo.edu.ng` / `CampusWard2026`.
2.  **Action**: Search for the patient $\rightarrow$ Confirm identity $\rightarrow$ Click **"Add Record"**.
3.  **Input**: Add a "Condition" (e.g., "Acute Malaria") $\rightarrow$ Save.
4.  **Verify**: The record is now persisted in the `futomc` facility store.

### Phase 3: Secure Access (The Emergency)
1.  **Login**: Use `emeeka.nwosu@fmcowerri.gov.ng` / `FutoER2026`.
2.  **Action**: Search for the patient $\rightarrow$ Attempt to view summary.
3.  **Observe**: You should see **"Consent Denied"** (since the patient hasn't opted-in).
4.  **Action**: Enter an emergency reason (e.g., "Patient unconscious") $\rightarrow$ Click **"Break Glass"**.
5.  **Verify**: The "Minimum Care Summary" now appears, showing the "Acute Malaria" record from FUTO MC.

### Phase 4: Trust Verification (The Auditor)
1.  **Login**: Use `ibrahim.sani@hie.futo.edu.ng` / `AuditTrail2026`.
2.  **Action**: Navigate to the **Audit** page.
3.  **Verify**: Click **"Verify Chain Integrity"**. Observe the green "Verified" badge, confirming the audit log has not been tampered with.

---

## 📦 Repository Structure
```
backend/          FastAPI exchange (MPI, consent, gateway, audit, persistence)
src/              React clinician + patient portal
src/lib/hie/      Domain engine used by the portal
docker-compose.yml  Full stack orchestration with persistent volumes
```
