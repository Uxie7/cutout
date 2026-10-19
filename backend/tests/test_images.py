import io
import os
import sys
import types
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.routes.images import require_user


def png_bytes() -> bytes:
    image = Image.new("RGBA", (2, 2), (30, 80, 140, 255))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


class ImageRouteTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ,
            {
                "SUPABASE_URL": "https://project.supabase.co",
                "SUPABASE_ANON_KEY": "public-anon-key",
            },
        )
        self.environment.start()
        app.dependency_overrides[require_user] = lambda: {"id": "user-123"}
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        self.http_client = app.state.http_client

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        app.dependency_overrides.clear()
        self.environment.stop()

    def test_rejects_unsupported_mime_type(self):
        response = self.client.post(
            "/api/images/remove-background",
            files={"image": ("document.txt", b"not an image", "text/plain")},
        )

        self.assertEqual(response.status_code, 415)
        self.assertIn("PNG, JPG, or WebP", response.json()["detail"])

    def test_endpoint_rejects_an_invalid_bearer_token(self):
        app.dependency_overrides.pop(require_user)

        class AuthClient:
            async def get(self, *_args, **_kwargs):
                return httpx.Response(401, json={"message": "invalid token"})

        app.state.http_client = AuthClient()
        try:
            response = self.client.post(
                "/api/images/remove-background",
                headers={"Authorization": "Bearer invalid-token"},
                files={"image": ("input.png", png_bytes(), "image/png")},
            )
        finally:
            app.state.http_client = self.http_client
            app.dependency_overrides[require_user] = lambda: {"id": "user-123"}

        self.assertEqual(response.status_code, 401)

    def test_rejects_invalid_image_content(self):
        response = self.client.post(
            "/api/images/remove-background",
            files={"image": ("fake.png", b"not a real image", "image/png")},
        )

        self.assertEqual(response.status_code, 400)

    def test_returns_png_from_authenticated_removal_service(self):
        output_bytes = png_bytes()
        rembg_module = types.ModuleType("rembg")
        rembg_module.remove = lambda content, session: output_bytes
        with (
            patch.dict(sys.modules, {"rembg": rembg_module}),
            patch("app.routes.images.get_removal_session", return_value=object()),
        ):
            response = self.client.post(
                "/api/images/remove-background",
                files={"image": ("input.png", png_bytes(), "image/png")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertEqual(response.content, output_bytes)


if __name__ == "__main__":
    unittest.main()
