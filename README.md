# Hybrid Farm Support System

This repository contains a complete full-stack crop recommendation system for the Hybrid Farm Support System:

- A machine learning notebook and dataset
- A FastAPI backend that predicts crops from soil/weather inputs
- A React frontend for user-friendly prediction

The app takes the following inputs:

- Soil: `N`, `P`, `K`, `ph`, and `soil` type (Alluvial, Black, Clay, Laterite, Loamy, Red, Sandy, Sandy loam, Other)
- Climate and water: `temperature` (°C), `humidity` (%), `water` (seasonal water, mm), `season` (kharif, rabi, zaid), `water_source` (irrigated, rainfed)

And returns:

- Best recommended crop out of 57 crops
- Top 3 crop recommendations with confidence
- Each crop's growing profile (typical ranges, season, duration, sowing and harvest months), served by `GET /metadata`

## Dataset

The model is trained on the **Crop recommendation dataset for Tamil Nadu** (57,000 rows, 57 crops, 1,000 rows per crop):
Mendeley Data, [doi:10.17632/vynxnppr7j.1](https://data.mendeley.com/datasets/vynxnppr7j/1), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The data is synthetic: it was generated with CTGAN from Tamil Nadu agriculture references, so treat accuracy figures as a demo, not field validation.

Preprocessing in `backend/app/model_service.py`:

- The 34 raw soil labels are merged into 9 soil types.
- The `*_MAX` columns and per-crop attributes (crop type, duration, sowing and harvest months) are **not** used as inputs, because each one identifies the crop. They are shown in the UI as crop facts instead.
- The model is a RandomForest (200 trees) with one-hot encoded soil, season and water source. Held-out accuracy is 99.3% and top-3 accuracy is 100% (see `GET /model-info`).

The original 22-crop dataset (`backend/data/Crop_recommendation.csv`) is kept for reference but no longer used.

## Repository Structure

```text
Hybrid Farm Support System/
|-- backend/
|   |-- app/
|   |   |-- main.py
|   |   |-- model_service.py
|   |   |-- schemas.py
|   |   `-- __init__.py
|   |-- data/
|   |   `-- Crop_recommendation.csv
|   |-- models/
|   `-- requirements.txt
|-- frontend/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- main.jsx
|   |   `-- styles.css
|   |-- index.html
|   |-- package.json
|   `-- vite.config.js
|-- notebooks/
|   `-- Crop_Recommendation_Testing_Final.ipynb
|-- .gitignore
`-- README.md
```

## Prerequisites

Install these before running:

1. Python 3.10+
2. Node.js 18+ and npm
3. Git

## 1) Clone the Repository

```bash
git clone https://github.com/dikshantahlawat/B.Tech_Project.git
cd B.Tech_Project
```

## 2) Fastest Demo Start (Windows)

If you want to show it quickly to your teacher, use the one-click launcher:

1. Double-click `start_all.bat` from the repository root.
2. It opens two terminals automatically:
	- Backend on `http://127.0.0.1:8000`
	- Frontend on `http://127.0.0.1:5173`
3. Open the app in browser: `http://127.0.0.1:5173`

You can also launch each side separately:

- `start_backend.bat`
- `start_frontend.bat`

## 3) Run Backend (FastAPI)

Open terminal 1:

```bash
cd backend
python -m venv .venv
```

Activate environment:

- Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

- Windows CMD:

```cmd
.venv\Scripts\activate.bat
```

- macOS/Linux:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start backend server:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:

- API base: `http://127.0.0.1:8000`
- Health check: `http://127.0.0.1:8000/health`
- Swagger docs: `http://127.0.0.1:8000/docs`

Note:

- On first startup, the backend auto-trains and saves a RandomForest model from `backend/data/Crop_recommendation.csv` if no saved model is found.

## 4) Run Frontend (React + Vite)

Open terminal 2:

```bash
cd frontend
npm install
```

Create `.env` file in `frontend/` (optional, default already points to localhost):

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Run frontend:

```bash
npm run dev
```

Open:

- `http://127.0.0.1:5173`

## 5) Use the Web App

1. The dashboard opens with a sample rice field. Click **New analysis** in the sidebar to start from a blank input panel.
2. Set each reading on its solid bar: click or drag anywhere on the bar, use the arrow keys, or type the number at the right end. Pick soil type, season and water source. **Fill with sample** loads an example field.
3. Results update live once every value is set:
	 - Summary cards: recommended crop and confidence, readings in range, growing window, soil match
	 - Crops for this field: the model's pick, then same-season crops ranked by readings in their typical range, each with a sow, grow and harvest calendar and a pass/fail mark per reading
	 - Click a crop to see its facts and what to change, for example "Add about 12 N"
4. Name the analysis in the top bar and click **Save result**. Saved results are listed in the sidebar (stored in this browser's localStorage). Click one to reopen it, or hover and click × twice to delete it.

## 6) Notebook

Notebook is included at (it explores the original 22-crop dataset):

- `notebooks/Crop_Recommendation_Testing_Final.ipynb`

Open this notebook in Jupyter/VS Code to review EDA, model experiments, and tuning work.

## API Example

### Request

`POST /predict`

```json
{
	"N": 90,
	"P": 50,
	"K": 50,
	"ph": 6.5,
	"temperature": 30,
	"humidity": 70,
	"water": 1700,
	"soil": "Clay",
	"season": "kharif",
	"water_source": "irrigated"
}
```

### Response

```json
{
	"best_crop": "rice",
	"top_recommendations": [
		{ "crop": "rice", "confidence": 0.99 },
		{ "crop": "cotton", "confidence": 0.004 },
		{ "crop": "jute", "confidence": 0.001 }
	]
}
```

## macOS / Linux quick start

The pinned packages need Python 3.10+. If your system Python is older, [uv](https://docs.astral.sh/uv/) can create the environment:

```bash
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python train_model.py        # optional: startup trains automatically if no model exists
.venv/bin/uvicorn app.main:app --reload --port 8000

cd ../frontend
npm install
npm run dev
```

After changing the dataset or preprocessing, delete `backend/models/*.joblib` to retrain.

## Troubleshooting

1. `ModuleNotFoundError` in backend:
	 - Activate virtual environment
	 - Run `pip install -r backend/requirements.txt`

2. Frontend cannot reach backend:
	 - Ensure backend is running on port `8000`
	 - Ensure `VITE_API_BASE_URL` points to backend URL

3. CORS issues:
	 - Backend already enables CORS for development (`allow_origins=["*"]`)

## Future Improvements

- User authentication for saved predictions
- Deployment with Docker and cloud hosting
- Better explainability dashboard for feature impact
- Periodic retraining pipeline