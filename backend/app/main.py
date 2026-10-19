from __future__ import annotations

import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.images import router as images_router

load_dotenv()


def required_setting(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value or value.startswith("YOUR_") or "YOUR-PROJECT" in value:
        raise RuntimeError(f"Required environment setting {name} is missing or still has its example placeholder.")
    return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.supabase_url = required_setting("SUPABASE_URL").rstrip("/")
    app.state.supabase_anon_key = required_setting("SUPABASE_ANON_KEY")
    app.state.max_image_bytes = int(os.environ.get("MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))
    if not 0 < app.state.max_image_bytes <= 20 * 1024 * 1024:
        raise RuntimeError("MAX_IMAGE_BYTES must be between 1 and 20 MB.")
    app.state.http_client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0))
    try:
        yield
    finally:
        await app.state.http_client.aclose()


cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://127.0.0.1:8765,http://localhost:8765,http://127.0.0.1:8080,http://localhost:8080",
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="Cutout Image API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(images_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
