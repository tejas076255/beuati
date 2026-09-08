"""Supabase clients.

Matches the real app's runtime model (see docs/architecture/
backend-portability-manifest.json): the application runs on the **anon /
publishable** key + RLS for public reads and anon-callable RPCs, and the
**service-role** key (trusted server-side, bypasses RLS) for admin/billing
operations. Two separate clients:

- ``get_client()`` -> anon/publishable client (RLS-scoped).
  Used by the public portfolio read and the public lead submission
  (``submit_lead`` is ``callable_by: anon``).

- ``get_admin_client()`` -> service-role client (bypasses RLS).
  Used only by admin/billing logic. Returns ``None`` when
  ``SUPABASE_SERVICE_ROLE_KEY`` is not configured.

Neither client object is ever exposed to the HTTP response path.
"""
from __future__ import annotations

from typing import Optional

from supabase import Client, create_client

from .config import settings


def _build_client(url: str, key: str) -> Client:
    return create_client(url, key)


def get_client() -> Client:
    """RLS-scoped anon/publishable client (public reads + anon RPCs).

    Raises if Supabase isn't configured at all (URL or publishable key
    missing) — these are required for the backend to be usable.
    """
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise RuntimeError(
            "Supabase is not configured: set SUPABASE_URL and "
            "SUPABASE_PUBLISHABLE_KEY in backend/.env"
        )
    return _build_client(settings.supabase_url, settings.supabase_publishable_key)


_client: Optional[Client] = None


def get_admin_client() -> Optional[Client]:
    """Service-role client (bypasses RLS), or None when not configured.

    Callers must handle None explicitly — the TS code's admin operations
    always had the service-role key injected by the Lovable runtime, so a
    None here on a local/deploy env means those operations cannot run.
    """
    if not settings.supabase_service_role_key:
        return None
    global _client
    if _client is None:
        _client = _build_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client