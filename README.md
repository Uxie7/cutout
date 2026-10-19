# Cutout

Cutout is a small HTML, CSS, and JavaScript image workspace with Supabase Auth, PostgreSQL metadata, private Supabase Storage, and an optional Python background-removal API.

## 1. Create the Supabase project

1. Create a Supabase project and enable email/password authentication.
2. Set the Auth site URL to the frontend origin you use locally (for example `http://127.0.0.1:8765`) and allow that origin as a redirect URL; password recovery returns to the site root.
3. Open the Supabase SQL editor and run [`supabase/migrations/001_images.sql`](./supabase/migrations/001_images.sql). This creates the image metadata table, user-scoped row policies, a private storage bucket, and matching per-user storage policies.
4. In [`js/config.js`](./js/config.js), replace `SUPABASE_URL` with the project URL and `SUPABASE_ANON_KEY` with the project's public anon/publishable key. The browser key is public by design; the database and storage policies are the security boundary.

Never put a Supabase service-role key in `js/config.js` or any browser-delivered file. This project does not require a service-role key.

## 2. Run the frontend

From this folder:

```powershell
python -m http.server 8765
```

Open <http://127.0.0.1:8765>. The frontend loads the Supabase JavaScript client from `esm.sh`, so an internet connection is required for authentication and cloud image operations.

## 3. Run the Python background-removal API

In another PowerShell window:

```powershell
Set-Location .\backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
Copy-Item .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Edit `backend/.env` and set the same Supabase project URL and public anon/publishable key. The API sends the signed-in access token to Supabase Auth to verify the user; it does not accept a user ID from the browser as proof of identity. The default CPU model is `u2net` and is downloaded on first use by `rembg`. Expect that first request to take longer and need additional memory.

Set `CORS_ORIGINS` to the exact frontend origins used by your deployment; do not use `*` for a production deployment. For deployment, also change `BACKGROUND_REMOVAL_API_URL` in `js/config.js` to the HTTPS API URL. Both frontend and API should use HTTPS.

## What is connected

- Email/password sign-up and sign-in, sign-out, session restore, password-reset email, and password update after recovery.
- Per-user image metadata in PostgreSQL and image files in a private Storage bucket.
- Signed gallery previews, downloads, deletion, and browser-side watermarking.
- Authenticated background removal via `POST /api/images/remove-background`.
- 20 MB input/output image limit and user-scoped SQL/storage policies.

## Tests

```powershell
Set-Location .\backend
python -m unittest discover -s tests
python -m compileall -q app tests
```

The Python tests cover the API's Supabase token-verification boundary. They do not call Supabase or download/run the image model.

## Before production

Configure Supabase email delivery, allowed redirect URLs, and storage policies for the real domain. Add rate limits and per-user processing quotas to the image API, monitor model memory/runtime, and test access isolation with two separate accounts. The background-removal API and frontend are not deployed by these local run commands.
