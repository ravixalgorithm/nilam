# NILAM — Project documentation

Detailed technical reference for the NILAM crop recommendation system: architecture, data, model, API, and frontend behaviour. For UI craft tokens and layout rules, see [`frontend/DESIGN.md`](../frontend/DESIGN.md).

---

## 1. Purpose

NILAM helps a user describe a field (nutrients, pH, climate, soil, season, water source) and receive:

1. A **best crop** prediction with confidence  
2. A **ranked list** of same-season alternatives scored by how many readings fall inside each crop’s typical range  
3. **Growing profiles** (duration, soils, sow/harvest months, per-feature bands)  
4. Optional **raw training-row** browsing for transparency  

The product name **NILAM** references land/field; the app UI brands as **NILAM** with a furrow-contour mark.

---

## 2. Architecture

```text
┌─────────────────────┐         HTTP JSON          ┌──────────────────────────┐
│  React + Vite UI    │  ←──────────────────────→  │  FastAPI (uvicorn)        │
│  localhost:5173     │   /predict /metadata       │  localhost:8000           │
│  localStorage saves │   /dataset /model-info     │  CropModelService         │
└─────────────────────┘                            │  RandomForest + joblib    │
                                                   │  tamilnadu_crops.csv      │
                                                   └──────────────────────────┘
```

| Concern | Implementation |
|---------|----------------|
| Serving | FastAPI lifespan loads or trains the model once |
| Persistence (model) | `backend/models/crop_model_tamilnadu_v1.joblib` |
| Persistence (UI) | Browser `localStorage` keys `hfs.saved-analyses.v1`, `hfs.active-analysis.v1` |
| CORS | Open (`*`) for local demo |

---

## 3. Dataset

### Primary training set

| Property | Value |
|----------|--------|
| File | `backend/data/tamilnadu_crops.csv` |
| Scale | 57 crops × 1,000 rows = **57,000** samples |
| Origin | [Mendeley Data doi:10.17632/vynxnppr7j.1](https://data.mendeley.com/datasets/vynxnppr7j/1) |
| License | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Nature | Synthetic (CTGAN from Tamil Nadu agricultural references) |

**Important:** Treat accuracy numbers as coursework/demo metrics, not real-world agronomic validation.

### Label cleanup

- Raw `SOIL` strings (34 noisy labels) → **9** groups: Alluvial, Black, Clay, Laterite, Loamy, Red, Sandy, Sandy loam, Other (`soil_group()` in `model_service.py`).  
- `SEASON` / `WATER_SOURCE` lowercased for categorical encoding.  
- Columns that effectively **identify** the crop (`*_MAX`, duration extremes used as identity, etc.) are **not** model inputs; they inform UI profiles only.

### Legacy / notebook set

`backend/data/Crop_recommendation.csv` — classic ~22-crop set, used by `notebooks/Crop_Recommendation_Testing_Final.ipynb`, **not** by the live API.

---

## 4. Model

| Item | Detail |
|------|--------|
| Algorithm | `RandomForestClassifier` (200 trees, `min_samples_leaf=2`) |
| Pipeline | `OneHotEncoder` on `soil`, `season`, `water_source` + numeric passthrough |
| Numeric inputs | N, P, K, SOIL_PH, TEMP, RELATIVE_HUMIDITY, WATERREQUIRED |
| Target | `CROPS` |
| Split | 80/20 stratified, `random_state=42` |
| Typical metrics | ~**99.3%** accuracy, **100%** top-3 on held-out test (confirm via `GET /model-info`) |

Training runs automatically on first API boot if the joblib file is missing; thereafter the artifact is loaded.

### Inference product

`predict_top_k` returns the argmax crop plus the top‑k probability list. The UI uses k=3 for the API response, then builds a richer **same-season ranking** client-side using metadata profiles (in-range counts), so the table is not limited to three rows.

---

## 5. API reference

Base URL (local): `http://127.0.0.1:8000`  
Interactive docs: `/docs`

### `GET /health`

```json
{ "status": "ok" }
```

### `GET /metadata`

Drives the entire form and result chrome:

- `fields` — key, label, unit, min, max, step  
- `options.soil` / `season` / `water_source`  
- `crops[id]` — name, type, season, duration, sown/harvested spans, month indexes, soils, water_source, `profile` bands `[p10, median, p90]` per numeric field  
- `rows` — training row count  

### `GET /model-info`

Model name, feature list, crop count, training rows, metrics, dataset citation string.

### `POST /predict`

**Body (JSON):**

| Field | Type | Notes |
|-------|------|--------|
| `N`, `P`, `K` | float | Nutrients |
| `ph` | float | Soil pH |
| `temperature` | float | °C |
| `humidity` | float | % RH |
| `water` | float | Seasonal water (mm) |
| `soil` | string | One of nine soil types |
| `season` | string | `kharif` \| `rabi` \| `zaid` |
| `water_source` | string | `irrigated` \| `rainfed` |

**Response:**

```json
{
  "best_crop": "rice",
  "top_recommendations": [
    { "crop": "rice", "confidence": 0.99 },
    { "crop": "sorghum", "confidence": 0.005 }
  ]
}
```

### `GET /dataset`

Paginated sample of training rows for the in-app raw-data modal.

| Query | Default | Notes |
|-------|---------|--------|
| `limit` | 80 | Capped (max 200 server-side) |
| `offset` | 0 | |
| `crop` | omit | Filter by crop id (e.g. `rice`) |

Returns `columns`, `rows`, `total`, `limit`, `offset`, `crop`.

---

## 6. Frontend behaviour

### Shell

- Dark **sidebar**: brand, saved analyses, primary **New analysis**, footer stats (opens dataset modal).  
- Floated **app**: Chrome-like **tabs**, workspace (results) + inputs pane.  

### Analysis loop

1. User fills season / soil / water + numeric bars (`Slider`).  
2. When complete, debounced `POST /predict`.  
3. UI merges prediction with `/metadata` profiles → bento metrics, calendar, ranked list.  
4. Crop row click opens detail modal; fit shown as **percentage** (confidence for top pick; in-range ratio otherwise).  

### Samples

Empty state can fill known profiles (`rice`, `ragi`, `groundnut`, `sugarcane`, `tomato`, `wheat`) from metadata medians / modal soils.

### Design system

See [`frontend/DESIGN.md`](../frontend/DESIGN.md) — OKLCH tokens, hatch shells, bento tiles, motion, anti-patterns.

---

## 7. Local development

```bash
# API
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# UI
cd frontend && npm install && npm run dev
```

Windows helpers: `start_all.bat`, `start_backend.bat`, `start_frontend.bat`.

Optional: `frontend/.env` → `VITE_API_BASE_URL=http://127.0.0.1:8000`

---

## 8. Evaluation & honesty checklist

When presenting NILAM (demo, viva, README):

- [ ] State that data is **synthetic** and TN-inspired  
- [ ] Quote metrics from live `GET /model-info`, not memorised slides  
- [ ] Distinguish **model confidence** vs **in-range fit %** in the crop table  
- [ ] Credit the Mendeley dataset (CC BY 4.0)  

---

## 9. Related files

| Path | Role |
|------|------|
| `README.md` | Public overview + screenshot |
| `docs/dashboard.png` | Dashboard capture used in README |
| `docs/PROJECT.md` | This document |
| `frontend/DESIGN.md` | Interface system |
| `backend/app/model_service.py` | Load, train, predict, dataset sample |
| `backend/app/main.py` | HTTP routes |
| `backend/app/schemas.py` | Request/response + field catalogue |
