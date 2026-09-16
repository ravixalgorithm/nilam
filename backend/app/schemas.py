from typing import Literal

from pydantic import BaseModel, Field

SOIL_TYPES = ("Alluvial", "Black", "Clay", "Laterite", "Loamy", "Red", "Sandy", "Sandy loam", "Other")
SEASONS = ("kharif", "rabi", "zaid")
WATER_SOURCES = ("irrigated", "rainfed")

# key -> (dataset column, label, unit, min, max, step). Single source for validation, training and the UI.
NUMERIC_FIELDS = {
    "N": ("N", "Nitrogen", "", 0, 200, 1),
    "P": ("P", "Phosphorus", "", 0, 100, 1),
    "K": ("K", "Potassium", "", 0, 150, 1),
    "ph": ("SOIL_PH", "Soil pH", "", 4, 9.5, 0.1),
    "temperature": ("TEMP", "Temperature", "°C", 0, 50, 0.5),
    "humidity": ("RELATIVE_HUMIDITY", "Humidity", "%", 0, 100, 1),
    "water": ("WATERREQUIRED", "Seasonal water", "mm", 300, 2500, 10),
}


def _num(key: str):
    _, label, _, lo, hi, _ = NUMERIC_FIELDS[key]
    return Field(..., ge=lo, le=hi, description=label)


class CropRequest(BaseModel):
    N: float = _num("N")
    P: float = _num("P")
    K: float = _num("K")
    ph: float = _num("ph")
    temperature: float = _num("temperature")
    humidity: float = _num("humidity")
    water: float = _num("water")
    soil: Literal[SOIL_TYPES] = Field(..., description="Soil type")
    season: Literal[SEASONS] = Field(..., description="Growing season")
    water_source: Literal[WATER_SOURCES] = Field(..., description="Irrigated or rainfed")


class CropPrediction(BaseModel):
    crop: str
    confidence: float


class CropResponse(BaseModel):
    best_crop: str
    top_recommendations: list[CropPrediction]
