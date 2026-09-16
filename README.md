# NILAM

**Generalized crop recommendation for Indian fields** — pick a state, enter soil and climate readings, get ranked crop fits with confidence, calendars, and growing profiles.

<p align="center">
  <img src="docs/dashboard.png" alt="NILAM dashboard — crop analysis with confidence, ranking, and field readings" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/ravixalgorithm/nilam"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-ravixalgorithm%2Fnilam-0e0e10?style=flat-square" /></a>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img alt="Coverage" src="https://img.shields.io/badge/Coverage-16%20Indian%20states-2e7d32?style=flat-square" />
</p>

---

## Overview

NILAM is a full-stack advisor for matching field conditions to crops **across India**. A Random Forest model trained on a **multi-state** dataset (16 states · 25 crops · 8,000 rows) ranks candidates from NPK, pH, temperature, humidity, rainfall, soil type, season, and **state**.

The UI is a floated desktop-style app: dark sidebar, Chrome-style tabs, hatch-framed metric shells, live rankings, and a raw dataset viewer.

**Docs:** [Project documentation](docs/PROJECT.md) · [UI design system](frontend/DESIGN.md)

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Vite, Iconsax, Plus Jakarta Sans |
| Backend | FastAPI, scikit-learn, pandas, joblib |
| Model | RandomForest (200 trees), one-hot soil / season / state |
| Data | Multi-state India crop set (synthetic from Indian agro references) |

> **Note:** Training rows are synthetic (generated from state-wise soil/climate/crop suitability ranges). Metrics are for demo / coursework — not farm-validated agronomy advice.

**States covered:** Andhra Pradesh, Assam, Bihar, Gujarat, Haryana, Karnataka, Kerala, Madhya Pradesh, Maharashtra, Odisha, Punjab, Rajasthan, Tamil Nadu, Telangana, Uttar Pradesh, West Bengal.

---

## Features

- **State-aware recommendations** — location is a model feature, not just a label  
- **Live results** — update as soon as every reading is set  
- **Confidence & fit** — top pick with %, reading marks, soil match, sow/harvest window  
- **Crop ranking** — model pick plus same-season alternatives by in-range fit  
- **Growing calendar** — sow / grow / harvest months per crop  
- **Field panel** — state, season, soil chips, craft sliders  
- **Saved analyses** — sidebar history (`localStorage`)  
- **Raw data viewer** — browse training rows from the sidebar footer  

---

## Quick start

### Prerequisites

- Python **3.10+**
- Node.js **18+** and npm

### Clone

```bash
git clone https://github.com/ravixalgorithm/nilam.git
cd nilam
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

First boot trains (or loads) `backend/models/crop_model_india_v1.joblib`.

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:8000/docs | Swagger |
| http://127.0.0.1:8000/metadata | Fields, states, crop profiles |
| http://127.0.0.1:8000/model-info | Metrics |
| http://127.0.0.1:8000/dataset | Paginated training rows |

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173**

---

## API example

`POST /predict`

```json
{
  "N": 90,
  "P": 40,
  "K": 40,
  "ph": 6.5,
  "temperature": 28,
  "humidity": 80,
  "water": 1200,
  "soil": "Alluvial",
  "season": "kharif",
  "water_source": "irrigated",
  "state": "Punjab"
}
```

---

## Model & data

| Item | Detail |
|------|--------|
| File | `backend/data/india_crops.csv` |
| Scale | ~8,000 rows · 25 crops · 16 states |
| Features | N, P, K, pH, temp, RH, rainfall, soil, season, **state** |
| Held-out | See live `GET /model-info` (top-3 typically ≫ single-label accuracy) |

Source construction: multi-state synthetic samples aligned to Indian state agro references (soil ranges, climate bands, major crops). The earlier Tamil Nadu Mendeley CSV remains under `backend/data/tamilnadu_crops.csv` for reference only.

---

## Repository layout

```text
nilam/
├── backend/
│   ├── app/           # FastAPI + India model service
│   ├── data/          # india_crops.csv (+ archived TN CSV)
│   └── models/        # crop_model_india_v1.joblib (generated)
├── frontend/
│   ├── src/
│   └── DESIGN.md
├── docs/
│   ├── dashboard.png
│   └── PROJECT.md
└── README.md
```

---

## License & attribution

Application code is for education and demonstration.

Training data is a synthetic multi-state India crop set derived from public agro reference patterns; treat outputs as illustrative.
