from __future__ import annotations

import io
import logging
import os
import warnings
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from app.auth import get_authenticated_user

router = APIRouter(tags=["images"])
ALLOWED_INPUT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_MODELS = {
    "u2net",
    "u2netp",
    "u2net_human_seg",
    "u2net_cloth_seg",
    "silueta",
    "isnet-general-use",
    "isnet-anime",
}


@lru_cache(maxsize=4)
def get_removal_session(model_name: str):
    from rembg import new_session

    return new_session(model_name)


async def require_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    return await get_authenticated_user(request, authorization)


@router.post("/images/remove-background")
async def remove_background(
    request: Request,
    image: Annotated[UploadFile, File()],
    _user: Annotated[dict, Depends(require_user)],
) -> Response:
    if image.content_type not in ALLOWED_INPUT_TYPES:
        raise HTTPException(status_code=415, detail="Upload a PNG, JPG, or WebP image.")

    max_bytes = request.app.state.max_image_bytes
    image_bytes = await image.read(max_bytes + 1)
    await image.close()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(image_bytes) > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"The image exceeds the {limit_mb} MB upload limit.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(image_bytes)) as source:
                source.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid image.") from error

    model_name = os.environ.get("BACKGROUND_REMOVAL_MODEL", "u2netp")
    if model_name not in ALLOWED_MODELS:
        raise HTTPException(status_code=500, detail="The configured background-removal model is not supported.")

    try:
        from rembg import remove

        session = await run_in_threadpool(get_removal_session, model_name)
        processed_bytes = await run_in_threadpool(
            remove,
            image_bytes,
            session=session,
        )
    except Exception as error:
        logging.getLogger(__name__).exception("Background removal failed.")
        raise HTTPException(
            status_code=500,
            detail="Background removal failed. Check the service logs and model setup.",
        ) from error

    return Response(
        content=processed_bytes,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )
