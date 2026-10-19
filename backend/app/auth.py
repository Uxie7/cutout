from __future__ import annotations

import httpx
from fastapi import HTTPException, Request


async def get_authenticated_user(request: Request, authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in to process images.")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to process images.")

    try:
        response = await request.app.state.http_client.get(
            f"{request.app.state.supabase_url}/auth/v1/user",
            headers={
                "apikey": request.app.state.supabase_anon_key,
                "Authorization": f"Bearer {token}",
            },
        )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=503,
            detail="Could not verify your session with Supabase.",
        ) from error

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Your session expired. Sign in again.")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Supabase could not verify your session.")

    try:
        user = response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Supabase returned an invalid session response.") from error
    if not isinstance(user, dict) or not user.get("id"):
        raise HTTPException(status_code=401, detail="Supabase returned an invalid user session.")
    return user
