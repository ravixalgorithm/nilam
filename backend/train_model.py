from app.model_service import CropModelService


if __name__ == "__main__":
    service = CropModelService()
    service.load_or_train()
    print(f"Model ready: {service.metrics}")
