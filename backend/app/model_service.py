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

from .schemas import NUMERIC_FIELDS, SEASONS, SOIL_TYPES, WATER_SOURCES

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "tamilnadu_crops.csv"
MODELS_DIR = BASE_DIR / "models"
MODEL_PATH = MODELS_DIR / "crop_model_tamilnadu_v1.joblib"

NUMERIC = [col for col, *_ in NUMERIC_FIELDS.values()]
CATEGORICAL = ["soil", "season", "water_source"]
TARGET = "CROPS"

# Dataset labels -> readable names (Tamil Nadu local names get their common English name).
CROP_NAMES = {
    "bengalgram": "Bengal gram", "blackgram": "Black gram", "greengram": "Green gram", "redgram": "Red gram",
    "horsegram": "Horse gram", "bhendi": "Okra", "gingely": "Sesame", "tapoica": "Tapioca",
    "chowchow": "Chow chow", "kudiraivali": "Barnyard millet", "panivaragu": "Proso millet",
    "samai": "Little millet", "thinai": "Foxtail millet", "varagu": "Kodo millet", "soyabean": "Soybean",
    "ragi": "Ragi (finger millet)", "Root&tuber": "Root & tuber",
}
CROP_TYPES = {
    "cereals": "Cereal", "millets": "Millet", "pulses": "Pulse", "oil seeds": "Oilseed", "vegetables": "Vegetable",
    "colecrops": "Cole crop", "bulbvegetables": "Bulb vegetable", "Root&tuber": "Root & tuber",
    "sugar crops": "Sugar crop", "fibre crop": "Fibre crop",
}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def soil_group(raw: str) -> str:
    """Collapse the dataset's 34 inconsistent soil labels into the 9 types the API accepts."""
    s = raw.replace("\xa0", " ").strip().lower()
    for key, group in [("alluvial", "Alluvial"), ("black", "Black"), ("cotton", "Black"), ("laterit", "Laterite"),
                       ("red", "Red"), ("clay", "Clay"), ("sandy loam", "Sandy loam"), ("sandy", "Sandy"),
                       ("loam", "Loamy")]:
        if key in s:
            return group
    return "Other"


def load_dataset() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH)
    df["soil"] = df["SOIL"].map(soil_group)
    df["season"] = df["SEASON"].str.lower()
    df["water_source"] = df["WATER_SOURCE"].str.lower()
    return df


def month_indexes(series: pd.Series) -> list[int]:
    """0-based months (Jan=0) seen for a crop, in calendar order."""
    return sorted({MONTHS.index(m) for m in series.str.strip().str[:3].str.title()})


def build_metadata(df: pd.DataFrame) -> dict:
    def month_span(series: pd.Series) -> str:
        months = sorted(series.str.strip().str[:3].str.title().unique(), key=MONTHS.index)
        return months[0] if len(months) == 1 else f"{months[0]}–{months[-1]}"

    crops = {}
    for crop, g in df.groupby(TARGET):
        crops[crop] = {
            "name": CROP_NAMES.get(crop, crop[:1].upper() + crop[1:]),
            "type": CROP_TYPES.get(g["TYPE_OF_CROP"].iloc[0], g["TYPE_OF_CROP"].iloc[0]),
            "season": g["season"].iloc[0],
            "duration_days": int(round(g["CROPDURATION"].median())),
            "sown": month_span(g["SOWN"]),
            "harvested": month_span(g["HARVESTED"]),
            "sow_months": month_indexes(g["SOWN"]),
            "harvest_months": month_indexes(g["HARVESTED"]),
            "soils": g["soil"].value_counts(normalize=True).loc[lambda s: s >= 0.1].index.tolist(),
            "water_source": g["water_source"].mode().iloc[0],
            # [p10, median, p90] per numeric input: the "typical" band shown in the UI
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
        "options": {"soil": SOIL_TYPES, "season": SEASONS, "water_source": WATER_SOURCES},
        "crops": crops,
        "rows": len(df),
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
            "top3_accuracy": round(float(top_k_accuracy_score(y_test, model.predict_proba(x_test), k=3, labels=model.classes_)), 4),
            "test_rows": len(x_test),
        }
        joblib.dump({"model": model, "metrics": self.metrics}, MODEL_PATH, compress=3)
        self.model = model

    def sample_dataset(self, *, limit: int = 80, offset: int = 0, crop: str | None = None) -> dict:
        if self.df is None:
            self.load_or_train()

        view = self.df
        if crop:
            view = view[view[TARGET] == crop]

        total = len(view)
        limit = max(1, min(limit, 200))
        offset = max(0, min(offset, max(total - 1, 0)))
        page = view.iloc[offset : offset + limit]

        columns = [
            ("CROPS", "crop"),
            ("TYPE_OF_CROP", "type"),
            ("soil", "soil"),
            ("season", "season"),
            ("water_source", "water"),
            ("N", "N"),
            ("P", "P"),
            ("K", "K"),
            ("SOIL_PH", "pH"),
            ("TEMP", "temp"),
            ("RELATIVE_HUMIDITY", "RH"),
            ("WATERREQUIRED", "water_mm"),
            ("CROPDURATION", "days"),
            ("SOWN", "sown"),
            ("HARVESTED", "harvest"),
        ]

        rows = []
        for _, r in page.iterrows():
            rows.append({
                key: (round(float(r[col]), 1) if isinstance(r[col], (int, float)) and not isinstance(r[col], bool) else str(r[col]))
                for col, key in columns
            })

        return {
            "columns": [key for _, key in columns],
            "rows": rows,
            "total": total,
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
