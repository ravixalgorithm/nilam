from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .model_service import CATEGORICAL, NUMERIC, CropModelService
from .schemas import CropRequest, CropResponse

model_service = CropModelService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    model_service.load_or_train()
    yield


app = FastAPI(
    title="Crop Recommendation API",
    version="2.0.0",
    description="Predicts the best crop from soil, climate and season inputs (Tamil Nadu crop dataset, 57 crops).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict", response_model=CropResponse)
def predict_crop(payload: CropRequest) -> CropResponse:
    best_crop, top_recommendations = model_service.predict_top_k(payload.model_dump(), k=3)
    return CropResponse(best_crop=best_crop, top_recommendations=top_recommendations)


@app.get("/metadata")
def metadata() -> dict:
    """Input fields, allowed options and per-crop growing profiles for the UI."""
    return model_service.metadata


@app.get("/model-info")
def model_info() -> dict[str, object]:
    return {
        "model": "RandomForestClassifier (one-hot soil/season/water source)",
        "features": NUMERIC + CATEGORICAL,
        "crops": len(model_service.metadata.get("crops", {})),
        "training_rows": model_service.metadata.get("rows"),
        "metrics": model_service.metrics,
        "dataset": "Crop recommendation dataset for Tamil Nadu (Mendeley Data, doi:10.17632/vynxnppr7j.1, CC BY 4.0)",
    }


@app.get("/dataset")
def dataset(limit: int = 80, offset: int = 0, crop: str | None = None) -> dict:
    """Paginated sample of the Tamil Nadu training rows for the raw-data viewer."""
    return model_service.sample_dataset(limit=limit, offset=offset, crop=crop or None)
