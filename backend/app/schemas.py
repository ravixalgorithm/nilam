from typing import Literal

from pydantic import BaseModel, Field

from .india_ref import STATES

SOIL_TYPES = ("Alluvial", "Black", "Clay", "Laterite", "Red", "Sandy", "Saline", "Other")
SEASONS = ("kharif", "rabi", "zaid")
WATER_SOURCES = ("irrigated", "rainfed")
STATE_NAMES = STATES

# key -> (dataset column, label, unit, min, max, step)
NUMERIC_FIELDS = {
    "N": ("N", "Nitrogen", "", 0, 450, 1),
    "P": ("P", "Phosphorus", "", 0, 80, 1),
    "K": ("K", "Potassium", "", 0, 450, 1),
    "ph": ("ph", "Soil pH", "", 4, 9.5, 0.1),
    "temperature": ("temperature", "Temperature", "°C", 0, 50, 0.5),
    "humidity": ("humidity", "Humidity", "%", 0, 100, 1),
    "water": ("rainfall", "Seasonal rainfall", "mm", 100, 4000, 10),
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
    state: Literal[STATE_NAMES] = Field(..., description="Indian state")


class CropPrediction(BaseModel):
    crop: str
    confidence: float


class CropResponse(BaseModel):
    best_crop: str
    top_recommendations: list[CropPrediction]
