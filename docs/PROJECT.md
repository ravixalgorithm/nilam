# NILAM — Project documentation

Detailed technical reference for the NILAM **India-wide** crop recommendation system. UI craft: [`frontend/DESIGN.md`](../frontend/DESIGN.md).

---

## 1. Purpose

Match a field’s conditions (including **Indian state**) to suitable crops with confidence, calendars, and profile bands.

---

## 2. Architecture

```text
React UI  ←→  FastAPI  →  RandomForest (soil + season + state one-hot)
                │
                └─ india_crops.csv (16 states, ~8k rows)
```

---

## 3. Dataset

| Property | Value |
|----------|--------|
| File | `backend/data/india_crops.csv` |
| Coverage | 16 states |
| Crops | 25 (rice, wheat, millets, plantation, spices, …) |
| Columns | N, P, K, temperature, humidity, ph, rainfall, soil_type, state, season, crop |
| Nature | Synthetic samples from state soil/climate/crop suitability ranges |

Archived TN set: `backend/data/tamilnadu_crops.csv` (not used by the live model).

---

## 4. Model

| Item | Detail |
|------|--------|
| Path | `backend/models/crop_model_india_v1.joblib` |
| Features | numerics + `soil`, `season`, `state` |
| Target | crop slug (`rice`, `wheat`, …) |
| UI-only | `water_source` (derived for display / soft checks) |

Confirm live metrics with `GET /model-info`.

---

## 5. API

`POST /predict` body includes `state` plus soil/season/water_source and numeric fields (`water` maps to rainfall mm).

`GET /metadata` exposes `options.state` and per-crop `states` lists.

`GET /dataset` returns multi-state rows for the raw-data modal.

---

## 6. Frontend

- Required inputs: state, season, soil, water source, all numeric bars  
- Samples: rice, wheat, cotton, maize, sugarcane, groundnut  
- Storage keys: `nilam.saved-analyses.v2` / `nilam.active-analysis.v2`  

---

## 7. Honesty checklist

- [ ] Say the training set is **synthetic multi-state**, not ICAR farm surveys  
- [ ] Quote metrics from live `/model-info`  
- [ ] Credit that recommendations are demos for education  
