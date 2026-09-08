"""Razorpay payment gateway integration — Billing Phase B.

Uses httpx directly against the Razorpay REST API (v1) rather than the
razorpay Python SDK, which has a pkg_resources dependency broken on
Python 3.12+.

Handles:
- Creating a Razorpay order (linked to our local billing_orders row)
- Verifying payment signature (webhook + client-side callback)
- Activating the plan after confirmed payment

Design follows the local-order-first pattern from order.server.ts:
1. Our local billing_orders row is ALWAYS created first (Phase A foundation)
2. We then create the Razorpay order and store gateway_order_id
3. Payment capture / plan activation happens ONLY in the webhook handler —
   never from the checkout return URL (that path can be forged)

Security:
- Signature verification uses RAZORPAY_KEY_SECRET (never exposed to browser)
- billing_orders.status transitions: created -> gateway_pending -> paid/failed
- Plan activation calls reconcile_commercial_state() after marking paid
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from typing import Optional

import httpx
from postgrest.exceptions import APIError

from ..core.config import settings
from ..core.supabase import get_admin_client

logger = logging.getLogger("beautyfolio.razorpay")

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"
RAZORPAY_TIMEOUT = 10.0  # seconds


def _auth_header() -> str:
    """Basic auth header value using key_id:key_secret."""
    credentials = f"{settings.razorpay_key_id}:{settings.razorpay_key_secret}"
    encoded = base64.b64encode(credentials.encode("utf-8")).decode("utf-8")
    return f"Basic {encoded}"


def create_razorpay_order(
    local_order_id: str,
    amount_paise: int,
    currency: str = "INR",
    notes: Optional[dict] = None,
) -> dict:
    """Create a Razorpay order and update our local billing_orders row.

    Returns the Razorpay order dict (id, amount, currency, status, …).
    Raises RuntimeError on gateway failure — caller should surface a 502.
    """
    if not settings.is_razorpay_configured:
        raise RuntimeError(
            "Razorpay is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env"
        )

    admin = get_admin_client()
    if admin is None:
        raise RuntimeError("Service-role key not configured — billing ops unavailable")

    try:
        resp = httpx.post(
            f"{RAZORPAY_API_BASE}/orders",
            headers={
                "Authorization": _auth_header(),
                "Content-Type": "application/json",
            },
            json={
                "amount": amount_paise,
                "currency": currency,
                "receipt": local_order_id[:40],  # Razorpay receipt max 40 chars
                "notes": notes or {},
            },
            timeout=RAZORPAY_TIMEOUT,
        )
        resp.raise_for_status()
        rz_order = resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error("[razorpay] order create HTTP %d: %s", exc.response.status_code, exc.response.text)
        raise RuntimeError(f"Razorpay API error {exc.response.status_code}: {exc.response.text}") from exc
    except httpx.TimeoutException:
        raise RuntimeError(f"Razorpay API timed out after {RAZORPAY_TIMEOUT}s")
    except Exception as exc:
        logger.error("[razorpay] order.create failed: %s", exc)
        raise RuntimeError(f"Failed to create Razorpay order: {exc}") from exc

    rz_order_id = rz_order.get("id")
    if not rz_order_id:
        raise RuntimeError("Razorpay returned an order without an id")

    # Persist the Razorpay order id on our local row so the webhook can
    # match it back to a profile.
    try:
        admin.table("billing_orders").update({
            "gateway_order_id": rz_order_id,
            "gateway": "razorpay",
            "status": "gateway_pending",
        }).eq("id", local_order_id).execute()
    except APIError as exc:
        logger.error("[razorpay] failed to persist gateway_order_id: %s", exc.message)
        # Don't abort — the order exists at Razorpay; log and continue.

    logger.info(
        "[razorpay] created order rz=%s local=%s amount=%d %s",
        rz_order_id, local_order_id, amount_paise, currency,
    )
    return rz_order


def verify_payment_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    """Verify Razorpay's HMAC-SHA256 payment signature.

    Must be called before marking any order as paid. Returns True when the
    signature is authentic; False on any mismatch or missing secret.
    """
    if not settings.razorpay_key_secret:
        logger.error("[razorpay] signature verification skipped — RAZORPAY_KEY_SECRET not set")
        return False

    message = f"{razorpay_order_id}|{razorpay_payment_id}"
    expected = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, razorpay_signature)


def activate_plan_after_payment(
    local_order_id: str,
    razorpay_payment_id: str,
    razorpay_order_id: str,
) -> dict:
    """Mark the local order paid and trigger plan activation.

    Called ONLY from the verified webhook handler — never from a client
    callback. Returns the updated billing_orders row (for logging).

    Idempotent: if the order is already 'paid', returns the existing row
    without re-running activation.
    """
    admin = get_admin_client()
    if admin is None:
        raise RuntimeError("Service-role key not configured")

    try:
        order_resp = admin.table("billing_orders").select(
            "id, status, beautician_profile_id, plan, billing_cycle"
        ).eq("id", local_order_id).single().execute()
        order = order_resp.data
    except APIError as exc:
        raise RuntimeError(f"Could not read billing order: {exc.message}") from exc

    if not order:
        raise RuntimeError(f"billing_orders row {local_order_id!r} not found")

    if order["status"] == "paid":
        logger.info("[razorpay] order %s already marked paid — skipping", local_order_id)
        return order

    # Mark paid with Razorpay payment reference
    try:
        admin.table("billing_orders").update({
            "status": "paid",
            "gateway_payment_id": razorpay_payment_id,
        }).eq("id", local_order_id).eq("gateway_order_id", razorpay_order_id).execute()
    except APIError as exc:
        raise RuntimeError(f"Failed to mark order paid: {exc.message}") from exc

    bp_id = order["beautician_profile_id"]
    new_plan = order["plan"]

    # Apply the plan to the beautician_profile
    try:
        admin.table("beautician_profiles").update({
            "plan": new_plan,
            "billing_hold": False,
        }).eq("id", bp_id).execute()
    except APIError as exc:
        logger.error("[razorpay] failed to apply plan %s to bp %s: %s", new_plan, bp_id, exc.message)

    # Best-effort state reconciliation (fail-soft)
    try:
        admin.rpc("reconcile_commercial_state", {"_bp_id": bp_id}).execute()
    except Exception:  # noqa: BLE001
        logger.exception("[razorpay] reconcile_commercial_state failed after payment for %s", bp_id)

    logger.info(
        "[razorpay] plan %s activated for bp %s via payment %s",
        new_plan, bp_id, razorpay_payment_id,
    )
    return order
