from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import top_k_accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder

from .india_ref import CROP_META, MONTHS, crop_slug, month_span
from .schemas import NUMERIC_FIELDS, SEASONS, SOIL_TYPES, STATE_NAMES, WATER_SOURCES

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "india_crops.csv"
MODELS_DIR = BASE_DIR / "models"
MODEL_PATH = MODELS_DIR / "crop_model_india_v1.joblib"

NUMERIC = [col for col, *_ in NUMERIC_FIELDS.values()]
CATEGORICAL = ["soil", "season", "state"]
TARGET = "crop"


def load_dataset() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH)
    df["soil"] = df["soil_type"].astype(str).str.strip()
    df.loc[~df["soil"].isin(SOIL_TYPES), "soil"] = "Other"
    df["season"] = df["season"].astype(str).str.strip().str.lower()
    df["state"] = df["state"].astype(str).str.strip()
    df["crop"] = df["crop"].map(crop_slug)
    # Soft label for UI / raw viewer (not a model feature)
    df["water_source"] = df["rainfall"].map(lambda r: "rainfed" if float(r) >= 900 else "irrigated")
    return df


def build_metadata(df: pd.DataFrame) -> dict:
    crops = {}
    for crop, g in df.groupby(TARGET):
        meta = CROP_META.get(crop, {})
        name = meta.get("name") or crop[:1].upper() + crop[1:]
        sow = meta.get("sow") or [5, 6]
        harvest = meta.get("harvest") or [8, 9]
        soils = g["soil"].value_counts(normalize=True).loc[lambda s: s >= 0.08].index.tolist()
        crops[crop] = {
            "name": name,
            "type": meta.get("type", "Crop"),
            "season": meta.get("season") or g["season"].mode().iloc[0],
            "duration_days": int(meta.get("days") or 120),
            "sown": month_span(sow),
            "harvested": month_span(harvest),
            "sow_months": list(sow),
            "harvest_months": list(harvest),
            "soils": soils or ["Alluvial"],
            "water_source": g["water_source"].mode().iloc[0],
            "states": g["state"].value_counts().head(8).index.tolist(),
            "profile": {
                key: [round(float(g[col].quantile(q)), 1) for q in (0.1, 0.5, 0.9)]
                for key, (col, *_) in NUMERIC_FIELDS.items()
            },
        }

    fields = [
        {"key": key, "label": label, "unit": unit, "min": lo, "max": hi, "step": step}
        for key, (_, label, unit, lo, hi, step) in NUMERIC_FIELDS.items()
    ]
    return {
        "fields": fields,
        "options": {
            "soil": list(SOIL_TYPES),
            "season": list(SEASONS),
            "water_source": list(WATER_SOURCES),
            "state": list(STATE_NAMES),
        },
        "crops": crops,
        "rows": len(df),
        "coverage": "16 Indian states · multi-state synthetic training set",
    }


class CropModelService:
    def __init__(self) -> None:
        self.model = None
        self.metrics: dict[str, float] = {}
        self.metadata: dict = {}
        self.df: pd.DataFrame | None = None

    def load_or_train(self) -> None:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        if not DATA_PATH.exists():
            raise FileNotFoundError(f"Dataset not found at {DATA_PATH}.")

        df = load_dataset()
        self.df = df
        self.metadata = build_metadata(df)

        if MODEL_PATH.exists():
            bundle = joblib.load(MODEL_PATH)
            self.model, self.metrics = bundle["model"], bundle["metrics"]
            return

        x = df[NUMERIC + CATEGORICAL]
        y = df[TARGET]
        x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42, stratify=y)

        model = make_pipeline(
            ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL)], remainder="passthrough"),
            RandomForestClassifier(n_estimators=200, min_samples_leaf=2, random_state=42, n_jobs=-1),
        )
        model.fit(x_train, y_train)
        self.metrics = {
            "accuracy": round(float(model.score(x_test, y_test)), 4),
            "top3_accuracy": round(
                float(top_k_accuracy_score(y_test, model.predict_proba(x_test), k=3, labels=model.classes_)),
                4,
            ),
            "test_rows": len(x_test),
        }
        joblib.dump({"model": model, "metrics": self.metrics}, MODEL_PATH, compress=3)
        self.model = model

    def sample_dataset(self, *, limit: int = 80, offset: int = 0, crop: str | None = None) -> dict:
        if self.df is None:
            self.load_or_train()

        view = self.df
        if crop:
            view = view[view[TARGET] == crop_slug(crop)]

        total = len(view)
        limit = max(1, min(limit, 200))
        offset = max(0, min(offset, max(total - 1, 0)))
        page = view.iloc[offset : offset + limit]

        columns = [
            ("crop", "crop"),
            ("state", "state"),
            ("soil", "soil"),
            ("season", "season"),
            ("water_source", "water"),
            ("N", "N"),
            ("P", "P"),
            ("K", "K"),
            ("ph", "pH"),
            ("temperature", "temp"),
            ("humidity", "RH"),
            ("rainfall", "rain_mm"),
        ]

        rows = []
        for _, r in page.iterrows():
            item = {}
            for col, key in columns:
                val = r[col]
                if key == "crop":
                    item[key] = CROP_META.get(str(val), {}).get("name", str(val))
                elif isinstance(val, (int, float)) and not isinstance(val, bool):
                    item[key] = round(float(val), 1)
                else:
                    item[key] = str(val)
            rows.append(item)

        return {
            "columns": [key for _, key in columns],
            "rows": rows,
            "total": int(total),
            "limit": limit,
            "offset": offset,
            "crop": crop,
        }

    def predict_top_k(self, payload: dict, k: int = 3) -> tuple[str, list[dict[str, float | str]]]:
        if self.model is None:
            self.load_or_train()

        row = {col: [payload[key]] for key, (col, *_) in NUMERIC_FIELDS.items()}
        row.update({c: [payload[c]] for c in CATEGORICAL})
        probabilities = self.model.predict_proba(pd.DataFrame(row))[0]
        classes = self.model.classes_

        top = sorted(zip(classes, probabilities), key=lambda p: p[1], reverse=True)[:k]
        results = [{"crop": str(c), "confidence": round(float(p), 4)} for c, p in top]
        return results[0]["crop"], results
