"""Application configuration loaded from environment variables.

Mirrors the frontend's `.env.example` (see `../.env.example`) so the FastAPI
service can talk to the same Supabase project with the same credentials.
All values are read at import time via pydantic-settings.

Secrets (service-role key, JWT secret, Resend key) live in `backend/.env`
(git-ignored) and are NEVER committed.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- Supabase (same values as the frontend's env) ----
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_project_id: str = ""

    # ---- CORS ----
    # Comma-separated list of allowed origins (frontend dev/prod origins).
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    # ---- Email notification (Resend) ----
    resend_api_key: str = ""
    lead_notification_from_email: str = ""

    # ---- Razorpay (Billing Phase B) ----
    # Get from Razorpay Dashboard -> Settings -> API Keys
    razorpay_key_id: str = ""       # rzp_live_... or rzp_test_...
    razorpay_key_secret: str = ""   # Never expose to browser
    razorpay_webhook_secret: str = ""  # Razorpay Dashboard -> Webhooks -> Secret

    # Where the frontend reaches this backend (used for logs / self-links).
    fastapi_url: str = "http://localhost:8000"

    # Canonical frontend site origin (same as frontend VITE_SITE_URL). Used to
    # build absolute URLs in email content. Empty -> relative paths only.
    site_url: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_supabase_configured(self) -> bool:
        """Public surface usable: URL + publishable (anon) key present.
        This covers public portfolio reads and anon-callable RPCs
        (submit_lead) via get_client()."""
        return bool(self.supabase_url and self.supabase_publishable_key)

    @property
    def is_admin_configured(self) -> bool:
        """Admin/billing ops usable: service-role key present (get_admin_client
        returns None without it, so those operations degrade/404)."""
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def is_razorpay_configured(self) -> bool:
        """Razorpay gateway usable: both key_id and key_secret present."""
        return bool(self.razorpay_key_id and self.razorpay_key_secret)


settings = Settings()
