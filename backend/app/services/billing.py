"""Commercial-state wrappers (Python port of src/data/billing/
commercial-state.server.ts).

Thin wrappers around the SECURITY DEFINER RPCs:
- reconcile_commercial_state() / is_commercial_access_current() are
  service_role-only EXECUTE — we always call them via the service-role client.
- confirm_continue_on_free() requires the acting user's own authenticated
  client (auth.uid() must resolve) — the API layer passes the caller's token,
  so it is invoked on a client built from that token, never the service role.

NOTE: supabase-py >= 2.31 reports PostgREST failures as *raised*
``postgrest.exceptions.APIError`` — there is no result.error attribute anymore —
so every RPC call here is wrapped and failures degrade exactly as the TS design
intended (best-effort reconcile, fail-closed safety checks).
"""
from __future__ import annotations

import logging

from postgrest.exceptions import APIError
from supabase import Client

from ..core.supabase import get_admin_client

logger = logging.getLogger("beautyfolio.billing")


def reconcile_commercial_state(beautician_profile_id: str) -> None:
    """Best-effort, fail-soft reconciliation trigger. Never raises to the
    caller — stored state remains the gate; a failure is the same bounded
    staleness risk already accepted in the TS design."""
    client = get_admin_client()
    if client is None:
        logger.warning(
            "[billing] reconcile_commercial_state skipped for %s — no service-role key configured",
            beautician_profile_id,
        )
        return
    try:
        client.rpc("reconcile_commercial_state", {"_bp_id": beautician_profile_id}).execute()
    except APIError as exc:
        logger.error(
            "[billing] reconcile_commercial_state failed for %s: %s",
            beautician_profile_id,
            exc.message,
        )
    except Exception:  # noqa: BLE001
        logger.exception("[billing] reconcile_commercial_state threw for %s", beautician_profile_id)


def is_commercial_access_current(beautician_profile_id: str) -> bool | None:
    """Narrow read-only safety check. Returns None when the check itself
    fails (caller must fail closed)."""
    client = get_admin_client()
    if client is None:
        logger.warning(
            "[billing] is_commercial_access_current skipped for %s — no service-role key configured",
            beautician_profile_id,
        )
        return None
    try:
        result = client.rpc(
            "is_commercial_access_current", {"_bp_id": beautician_profile_id}
        ).execute()
    except APIError as exc:
        logger.error(
            "[billing] is_commercial_access_current failed for %s: %s",
            beautician_profile_id,
            exc.message,
        )
        return None
    except Exception:  # noqa: BLE001
        logger.exception("[billing] is_commercial_access_current threw for %s", beautician_profile_id)
        return None
    return bool(result.data)


def ensure_public_access_safe(beautician_profile_id: str) -> bool:
    """Public-visibility safety gate (see the TS doc comment for policy):
    1. reconcile_commercial_state() succeeds -> safe.
    2. Otherwise fall back to is_commercial_access_current().
    3. That also fails -> FAIL CLOSED (return False).

    Service-role only in the TS app; when no service-role key is configured
    (locally, or in the current Lovable runtime where it is unused) the RPCs
    cannot run, so we log and rely on PostgREST RLS — which already restricts
    anonymous reads to *published* profiles — rather than falsely 404'ing.
    """
    client = get_admin_client()
    if client is None:
        logger.warning(
            "[billing] ensure_public_access_safe: no service-role key — relying on RLS "
            "(published-only) for %s",
            beautician_profile_id,
        )
        return True

    try:
        client.rpc(
            "reconcile_commercial_state", {"_bp_id": beautician_profile_id}
        ).execute()
        return True
    except APIError as exc:
        logger.error(
            "[billing] reconcile_commercial_state failed for %s: %s",
            beautician_profile_id,
            exc.message,
        )
    except Exception:  # noqa: BLE001
        logger.exception("[billing] reconcile_commercial_state threw for %s", beautician_profile_id)

    current = is_commercial_access_current(beautician_profile_id)
    if current is None:
        return False  # required safety lookup failed — fail closed.
    return current


def confirm_continue_on_free(client: Client, beautician_profile_id: str) -> None:
    """Billing-hold -> Free recovery. `client` must be the acting user's OWN
    authenticated client (never service role) — the RPC's ownership check
    relies on auth.uid() resolving. Throws on failure (like the TS version)."""
    try:
        client.rpc("confirm_continue_on_free", {"_bp_id": beautician_profile_id}).execute()
    except APIError as exc:
        raise RuntimeError(f"Could not continue on Free: {exc.message}")
