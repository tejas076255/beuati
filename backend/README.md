# BeautyFolio Backend (Python / FastAPI / Supabase)

Standalone API service for BeautyFolio. Owns all business logic and DB access;
the React frontend (TanStack Start SSR) calls these endpoints from its server
functions, forwarding the user's Supabase bearer token.

## Stack

- **FastAPI** + **Uvicorn**
- **supabase-py** (service-role client) — same Supabase project as the frontend
- **PyJWT** — local verification of Supabase access tokens
- **Pydantic / pydantic-settings** — schemas + env config

## Project layout

```
backend/
├── app/
│   ├── main.py            # FastAPI app, CORS, router registration
│   ├── core/
│   │   ├── config.py      # env settings (Supabase, CORS, Resend)
│   │   ├── supabase.py    # service-role client singleton
│   │   └── security.py    # JWT verify + current_user / require_admin deps
│   ├── schemas/           # Pydantic models (mirror frontend TS types)
│   ├── services/          # ported business logic (one module per *.server.ts)
│   └── api/               # routers: health, leads, portfolio
├── requirements.txt
├── requirements-dev.txt
├── .env                   # git-ignored — fill in real values (see below)
└── README.md
```

## Quick Setup

```sh
cd backend

# 1. Create virtual environment (already present as .venv if cloned)
python -m venv .venv

# 2. Activate it
# Windows CMD:        .venv\Scripts\activate.bat
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux:        source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt   # for tests
```

## Configure .env

Edit `backend/.env` and fill in the missing secrets:

```env
# Required — get from Supabase dashboard > Project Settings > API
SUPABASE_URL=https://ivbujlyilzmlublqzalu.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...    # already filled
SUPABASE_SERVICE_ROLE_KEY=                     # ← FILL THIS (service_role secret)
SUPABASE_JWT_SECRET=                           # ← FILL THIS (JWT Secret)

# Optional — for email notifications via Resend
RESEND_API_KEY=
LEAD_NOTIFICATION_FROM_EMAIL=
```

**Where to find them:**
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Project Settings → API → `service_role` (secret key)
- `SUPABASE_JWT_SECRET`: Supabase Dashboard → Project Settings → API → JWT Secret

> **Without these two keys:**
> - Public portfolio reads and lead submission still work (`is_supabase_configured = true`)
> - Dashboard/admin operations won't work (`is_admin_configured = false`)
> - Auth (JWT verification) on protected routes will return 500

## Run (Development)

```sh
# Make sure venv is activated first (see above)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- **API docs (Swagger):** http://localhost:8000/docs
- **Health check:** http://localhost:8000/api/health
- **DB connectivity:** http://localhost:8000/api/health/db

## Run (Windows — one-liner using .venv)

```powershell
# From backend/ directory:
.venv\Scripts\uvicorn.exe app.main:app --reload
```

## Run Tests

```sh
pytest
```

## Health check response explained

```json
{
  "status": "ok",
  "supabase_configured": true,   // public reads work
  "admin_configured": false      // service_role key needed for admin/billing
}
```

## Current feature coverage

| Route | Description | Auth |
|-------|-------------|------|
| `GET /api/health` | Config health check | None |
| `GET /api/health/db` | DB connectivity check | None |
| `GET /api/portfolio/{slug}` | Full public portfolio bundle | None |
| `GET /api/portfolio/{slug}/services/{slug}` | Service SEO page | None |
| `POST /api/leads` | Submit lead enquiry | None (anon RPC) |

## Security notes

- The service-role client bypasses RLS — never expose it to the browser.
- Identity comes from the Supabase access token the frontend forwards; role and
  ownership checks reuse the existing Postgres RPCs (`has_role`,
  `owns_beautician_profile*`) so policy stays in the database.
- JWT verification uses `SUPABASE_JWT_SECRET` locally — no round-trip to Supabase Auth.

## Environment status

| Variable | Status | Impact if missing |
|----------|--------|-------------------|
| `SUPABASE_URL` | ✅ Set | Required for everything |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ Set | Required for public reads |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ Missing | Admin/billing ops unavailable |
| `SUPABASE_JWT_SECRET` | ❌ Missing | Auth on protected routes returns 500 |
| `RESEND_API_KEY` | ❌ Missing | Email uses mock (safe, sends nothing) |
