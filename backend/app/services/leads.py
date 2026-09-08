"""Lead submission orchestration.

Python port of `src/data/leads-submit.server.ts`. The `submit_lead` Postgres
RPC remains the sole authority for validation / phone-normalization /
dedup / creation — nothing here reproduces that logic. A best-effort email
notification is attempted only after the RPC reports success and can never
turn that success into a customer-visible failure.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from postgrest.exceptions import APIError

from ..core.supabase import get_client
from .email import (
    EmailPayload,
    build_lead_notification_email,
    resolve_email_transport,
    should_notify_for_inquiry,
)

logger = logging.getLogger("beautyfolio.leads")


def submit_portfolio_lead(args: dict) -> dict:
    """Submit a lead via the submit_lead RPC, then best-effort email notify.

    Returns {"error": <str|null>, "lead_id": <uuid|null>} — never raises on
    the notification path.
    """
    now = datetime.now(timezone.utc)
    request_started_at = now.isoformat()

    client = get_client()
    try:
        rpc_result = client.rpc("submit_lead", args).execute()
    except APIError as exc:
        # supabase-py >= 2.31 raises instead of returning result.error; a
        # raised RPC error is exactly the TS `error` case -> report it.
        return {"error": str(exc.message), "lead_id": None}

    lead_id = rpc_result.data
    # Notification is AWAITED (like the TS code) because a serverless deploy
    # doesn't guarantee post-response work runs; every failure is caught so
    # it can never turn a successful lead into a visible failure.
    try:
        _attempt_lead_notification(lead_id, request_started_at)
    except Exception:  # noqa: BLE001 - deliberate swallow-and-log
        logger.exception("[lead-notification] unexpected failure, lead unaffected:")

    return {"error": None, "lead_id": lead_id}


def _attempt_lead_notification(lead_id: str, request_started_at: str) -> None:
    client = get_client()

    # Lead snapshot + latest inquiry — independent lookups run as two queries
    # (supabase-py has no Promise.all; the DB round trips are cheap and the
    # notification is already best-effort).
    lead = _maybe_row(
        client.table("leads")
        .select("beautician_profile_id, name, phone, location, event_date, message, service_requested, source")
        .eq("id", lead_id)
        .maybe_single()
        .execute()
    )
    if lead is None:
        logger.error("[lead-notification] could not load lead for notification")
        return

    latest_inquiry = _maybe_row(
        client.table("lead_inquiries")
        .select("created_at")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    latest_inquiry_created_at = (latest_inquiry or {}).get("created_at")

    if not should_notify_for_inquiry(request_started_at, latest_inquiry_created_at):
        # Idempotent replay (submit_lead()'s own 5-minute duplicate guard) —
        # the original submission already triggered a notification.
        return

    # Canonical recipient: the auth-account email (profiles.email via
    # beautician_profiles.profile_id), not the optional public-facing
    # beautician_profiles.email field.
    profile_with_account = _maybe_row(
        client.table("beautician_profiles")
        .select("display_name, profiles!inner(email)")
        .eq("id", lead["beautician_profile_id"])
        .maybe_single()
        .execute()
    )
    if profile_with_account is None or not profile_with_account.get("profiles", {}).get("email"):
        logger.error(
            "[lead-notification] could not resolve beautician profile or account email"
        )
        return

    professional_name = profile_with_account.get("display_name") or ""
    account_email = profile_with_account["profiles"]["email"]

    lead_context = {
        "name": lead.get("name"),
        "phone": lead.get("phone"),
        "location": lead.get("location"),
        "event_date": lead.get("event_date"),
        "message": lead.get("message"),
        "service_requested": lead.get("service_requested"),
        "source": lead.get("source"),
    }
    email = build_lead_notification_email(lead_context, professional_name)

    transport = resolve_email_transport()
    result = transport(EmailPayload(to=account_email, subject=email["subject"], text=email["text"]))
    if not result.ok:
        logger.error(
            "[lead-notification] delivery failed provider=%s error=%s",
            result.provider,
            result.error,
        )


def _maybe_row(response) -> Optional[dict]:
    """Single row (or None) from a maybe_single() result.

    maybe_single().execute() returns None for zero rows; query failures raise
    ``postgrest.APIError``, which the caller's best-effort guard swallows."""
    data = getattr(response, "data", None)
    return data if isinstance(data, dict) and data else None
