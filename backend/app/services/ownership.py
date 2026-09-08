"""Ownership + role resolution for the FastAPI service.

The backend talks to Supabase through the **service-role** client, which
bypasses RLS. That means the RLS-enforced ownership (`owns_beautician_profile`)
that protected the TS dashboard server functions no longer applies at the
database layer — so the FastAPI layer must re-impose it explicitly:

- Dashboard endpoints derive the acting user's own ``beautician_profile_id``
  from their token's ``sub`` (auth_user_id) and scope every query to it. They
  never accept a ``beautician_profile_id`` from the caller.
- Admin endpoints require ``admin`` (via ``has_role``) and act on an explicit
  target ``beautician_profile_id``.

Ports of ``src/data/dashboard/shared.server.ts`` (``getOwnBeauticianProfileId``)
and the admin authorization in ``src/data/admin/shared.server.ts``
(``assertIsAdmin``).
"""
from __future__ import annotations

from typing import Optional

from postgrest.exceptions import APIError

from ..core.supabase import get_admin_client

# ---- shared row helpers (same contract as portfolio.services) -------------


def _data(response) -> list:
    return getattr(response, "data", None) or []


def _row(response) -> Optional[dict]:
    data = getattr(response, "data", None)
    return data if isinstance(data, dict) and data else None


# ---- ownership -------------------------------------------------------------


class OwnershipError(RuntimeError):
    """No own beautician profile resolvable for the authenticated user."""


def resolve_own_bp_id(user_id: str) -> str:
    """Return the caller's own ``beautician_profile_id`` (via auth_user_id).

    Mirrors ``getOwnBeauticianProfileId``: ``profiles.auth_user_id -> sub``,
    then ``beautician_profiles.profile_id -> profiles.id``. Raises
    ``OwnershipError`` when no own portfolio/account exists.
    """
    client = get_admin_client()
    if client is None:
        raise OwnershipError("Service-role key not configured — dashboard operations unavailable")
    try:
        profile = _row(
            client.table("profiles")
            .select("id")
            .eq("auth_user_id", user_id)
            .maybe_single()
            .execute()
        )
        if not profile:
            raise OwnershipError("No account profile for the current user")
        bp = _row(
            client.table("beautician_profiles")
            .select("id")
            .eq("profile_id", profile["id"])
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise OwnershipError(str(exc.message)) from exc
    if not bp:
        raise OwnershipError("No portfolio for the current account")
    return bp["id"]


# ---- admin -----------------------------------------------------------------


class AdminError(RuntimeError):
    """Authenticated user is not an admin."""


def assert_is_admin(user_id: str) -> None:
    """Raise ``AdminError`` unless the user holds the ``admin`` role.

    Backend port of ``assertIsAdmin`` in ``src/data/admin/shared.server.ts``.
    """
    client = get_admin_client()
    if client is None:
        raise AdminError("Service-role key not configured — admin operations unavailable")
    try:
        row = _row(
            client.table("user_roles")
            .select("role")
            .eq("user_id", user_id)
            .eq("role", "admin")
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise AdminError(str(exc.message)) from exc
    if not row:
        raise AdminError("Admin access required.")