# U-HRES exchange (FastAPI)

Campus-node services for the FUTO federated prototype: client registry (UHID), record locator, consent, FHIR fan-out, and hash-chained audit.

Clinical data is **not** stored here. Each hospital module in `engine.py` is a stand-in for a HAPI FHIR façade.

## Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp env.example .env   # optional; defaults work for local demo
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

OpenAPI: `http://127.0.0.1:8000/docs`

## Tests

```bash
cd backend
PYTHONPATH=. python3 -m pytest tests -q
```

The matcher tests cover the ER name-variant, NIN+DOB auto-link, and the Eze twins (must not auto-merge).
