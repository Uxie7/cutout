import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
from fastapi import HTTPException

from app.auth import get_authenticated_user


class AuthenticationTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_bearer_token_returns_supabase_user(self):
        client = SimpleNamespace(
            get=AsyncMock(
                return_value=httpx.Response(
                    200,
                    json={"id": "user-123", "email": "person@example.com"},
                )
            )
        )
        request = SimpleNamespace(
            app=SimpleNamespace(
                state=SimpleNamespace(
                    http_client=client,
                    supabase_url="https://project.supabase.co",
                    supabase_anon_key="public-anon-key",
                )
            )
        )

        user = await get_authenticated_user(request, "Bearer valid-token")

        self.assertEqual(user["id"], "user-123")
        client.get.assert_awaited_once_with(
            "https://project.supabase.co/auth/v1/user",
            headers={
                "apikey": "public-anon-key",
                "Authorization": "Bearer valid-token",
            },
        )

    async def test_missing_token_is_rejected_without_request(self):
        client = SimpleNamespace(get=AsyncMock())
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(http_client=client)))

        with self.assertRaises(HTTPException) as raised:
            await get_authenticated_user(request, None)

        self.assertEqual(raised.exception.status_code, 401)
        client.get.assert_not_awaited()

    async def test_supabase_rejects_invalid_token(self):
        client = SimpleNamespace(
            get=AsyncMock(return_value=httpx.Response(401, json={"message": "invalid token"}))
        )
        request = SimpleNamespace(
            app=SimpleNamespace(
                state=SimpleNamespace(
                    http_client=client,
                    supabase_url="https://project.supabase.co",
                    supabase_anon_key="public-anon-key",
                )
            )
        )

        with self.assertRaises(HTTPException) as raised:
            await get_authenticated_user(request, "Bearer invalid-token")

        self.assertEqual(raised.exception.status_code, 401)

    async def test_supabase_network_failure_is_reported_as_unavailable(self):
        client = SimpleNamespace(get=AsyncMock(side_effect=httpx.ConnectError("offline")))
        request = SimpleNamespace(
            app=SimpleNamespace(
                state=SimpleNamespace(
                    http_client=client,
                    supabase_url="https://project.supabase.co",
                    supabase_anon_key="public-anon-key",
                )
            )
        )

        with self.assertRaises(HTTPException) as raised:
            await get_authenticated_user(request, "Bearer valid-token")

        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
