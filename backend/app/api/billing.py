"""Billing Phase B — Razorpay checkout endpoints.

Endpoints:
  POST /api/billing/create-order   — authenticated: creates/returns a Razorpay order
  POST /api/billing/webhook        — public: Razorpay webhook (HMAC-verified)
  GET  /api/billing/status         — authenticated: current plan + order status

Design invariants (from order.server.ts):
- Local billing_orders row is ALWAYS created before any gateway call.
- plan/amount are looked up server-side from billing-prices — never trusted
  from the client.
- Payment capture/activation happens ONLY via the verified webhook, never
  from the checkout success redirect (which can be forged).
- The /webhook endpoint is intentionally public (no bearer auth) — Razorpay
  cannot send a bearer token; we verify via HMAC-SHA256 signature instead.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel

from ..core.config import settings
from ..core.security import CurrentUser, current_user
from ..core.supabase import get_admin_client
from ..services.ownership import resolve_own_bp_id, OwnershipError
from ..services.razorpay_service import (
    create_razorpay_order,
    activate_plan_after_payment,
)

logger = logging.getLogger("beautyfolio.api.billing")

router = APIRouter(prefix="/billing", tags=["billing"])

VALID_PLANS = ("starter", "silver", "gold", "platinum")
VALID_CYCLES = ("monthly", "yearly")

# ─── Pydantic models ─────────────────────────────────────────────────────────

class CreateOrderIn(BaseModel):
    plan: str
    billing_cycle: str


class CreateOrderOut(BaseModel):
    local_order_id: str
    razorpay_order_id: str
    amount_paise: int
    currency: str
    key_id: str   # safe to expose — this is the public key only


class BillingStatusOut(BaseModel):
    plan: str
    billing_hold: bool
    razorpay_configured: bool


# ─── Helpers ─────────────────────────────────────────────────────────────────

BILLING_PRICES_PAISE = {
    "starter": {"monthly": 39900, "yearly": 399000},
    "silver":  {"monthly": 79900, "yearly": 799000},
    "gold":    {"monthly": 149900, "yearly": 1499000},
    "platinum":{"monthly": 299900, "yearly": 2999000},
}


def _get_amount(plan: str, cycle: str) -> int:
    return BILLING_PRICES_PAISE[plan][cycle]


def _cancel_stale_orders(bp_id: str) -> None:
    """Cancel created orders older than 30 minutes (mirrors TS logic)."""
    admin = get_admin_client()
    if not admin:
        return
    from datetime import datetime, timezone, timedelta
    stale_before = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    try:
        admin.table("billing_orders").update({"status": "cancelled"}).eq(
            "beautician_profile_id", bp_id
        ).eq("status", "created").lt("created_at", stale_before).execute()
    except Exception:  # noqa: BLE001
        pass


def _get_or_create_local_order(bp_id: str, plan: str, cycle: str) -> dict:
    admin = get_admin_client()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing service unavailable — service-role key not configured",
        )

    _cancel_stale_orders(bp_id)

    # Check for an existing open order
    existing = admin.table("billing_orders").select(
        "id, status, gateway_order_id, amount_paise, currency"
    ).eq("beautician_profile_id", bp_id).eq("status", "created").maybe_single().execute()

    if existing.data:
        return existing.data

    # Lookup current commercial_state_version for snapshot
    profile_resp = admin.table("beautician_profiles").select(
        "commercial_state_version"
    ).eq("id", bp_id).single().execute()
    state_version = (profile_resp.data or {}).get("commercial_state_version", 0)

    amount = _get_amount(plan, cycle)

    created = admin.table("billing_orders").insert({
        "beautician_profile_id": bp_id,
        "plan": plan,
        "billing_cycle": cycle,
        "amount_paise": amount,
        "currency": "INR",
        "gateway": "razorpay",
        "status": "created",
        "expected_state_version": state_version,
    }).select("id, status, gateway_order_id, amount_paise, currency").single().execute()

    if not created.data:
        # Race condition — another request won; reload
        reload = admin.table("billing_orders").select(
            "id, status, gateway_order_id, amount_paise, currency"
        ).eq("beautician_profile_id", bp_id).eq("status", "created").maybe_single().execute()
        if reload.data:
            return reload.data
        raise HTTPException(status_code=500, detail="Failed to create billing order")

    return created.data


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/create-order", response_model=CreateOrderOut)
def create_order(
    payload: CreateOrderIn,
    user: CurrentUser = Depends(current_user),
) -> CreateOrderOut:
    """Authenticated. Creates (or returns existing) local + Razorpay order.

    The frontend receives the Razorpay order id and opens the Razorpay
    checkout modal. Payment capture happens via /webhook only.
    """
    if not settings.is_razorpay_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Razorpay is not configured on this server",
        )
    if payload.plan not in VALID_PLANS:
        raise HTTPException(status_code=422, detail=f"Invalid plan: {payload.plan!r}")
    if payload.billing_cycle not in VALID_CYCLES:
        raise HTTPException(status_code=422, detail=f"Invalid billing_cycle: {payload.billing_cycle!r}")

    try:
        bp_id = resolve_own_bp_id(user.user_id)
    except OwnershipError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    local_order = _get_or_create_local_order(bp_id, payload.plan, payload.billing_cycle)

    # If we already have a Razorpay order id, return it (idempotent)
    if local_order.get("gateway_order_id"):
        return CreateOrderOut(
            local_order_id=local_order["id"],
            razorpay_order_id=local_order["gateway_order_id"],
            amount_paise=local_order["amount_paise"],
            currency=local_order.get("currency", "INR"),
            key_id=settings.razorpay_key_id,
        )

    # Create at Razorpay
    rz_order = create_razorpay_order(
        local_order_id=local_order["id"],
        amount_paise=local_order["amount_paise"],
        currency=local_order.get("currency", "INR"),
        notes={"local_order_id": local_order["id"], "beautician_profile_id": bp_id},
    )

    return CreateOrderOut(
        local_order_id=local_order["id"],
        razorpay_order_id=rz_order["id"],
        amount_paise=local_order["amount_paise"],
        currency=rz_order.get("currency", "INR"),
        key_id=settings.razorpay_key_id,
    )


@router.post("/webhook", status_code=200)
async def razorpay_webhook(request: Request) -> dict:
    """Public endpoint — verified by Razorpay HMAC-SHA256 signature.

    Handles:
    - payment.captured  → activate the plan (only path that triggers activation)
    - payment.failed    → mark order failed
    - order.paid        → (informational; activation via payment.captured)
    """
    body_bytes = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    # Signature verification — reject if secret is configured but mismatch
    if settings.razorpay_webhook_secret:
        expected = hmac.new(
            settings.razorpay_webhook_secret.encode("utf-8"),
            body_bytes,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            logger.warning("[webhook] HMAC mismatch — rejecting")
            raise HTTPException(status_code=400, detail="Invalid webhook signature")
    else:
        logger.warning("[webhook] RAZORPAY_WEBHOOK_SECRET not set — signature not verified")

    try:
        event = json.loads(body_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = event.get("event")
    logger.info("[webhook] received event=%s", event_type)

    if event_type == "payment.captured":
        payment = event.get("payload", {}).get("payment", {}).get("entity", {})
        rz_payment_id = payment.get("id")
        rz_order_id = payment.get("order_id")

        if not rz_payment_id or not rz_order_id:
            logger.error("[webhook] payment.captured missing payment/order id")
            return {"ok": True}

        # Find local order by gateway_order_id
        admin = get_admin_client()
        if not admin:
            logger.error("[webhook] admin client unavailable — cannot activate plan")
            return {"ok": True}

        order_resp = admin.table("billing_orders").select(
            "id, status"
        ).eq("gateway_order_id", rz_order_id).maybe_single().execute()

        local_order = order_resp.data
        if not local_order:
            logger.warning("[webhook] no local order found for rz_order_id=%s", rz_order_id)
            return {"ok": True}

        if local_order["status"] == "paid":
            logger.info("[webhook] order %s already paid — skipping", local_order["id"])
            return {"ok": True}

        try:
            activate_plan_after_payment(
                local_order_id=local_order["id"],
                razorpay_payment_id=rz_payment_id,
                razorpay_order_id=rz_order_id,
            )
        except Exception as exc:
            logger.exception("[webhook] activate_plan_after_payment failed: %s", exc)
            # Return 200 to prevent Razorpay from retrying; failure is logged

    elif event_type == "payment.failed":
        payment = event.get("payload", {}).get("payment", {}).get("entity", {})
        rz_order_id = payment.get("order_id")
        if rz_order_id:
            admin = get_admin_client()
            if admin:
                try:
                    admin.table("billing_orders").update(
                        {"status": "failed"}
                    ).eq("gateway_order_id", rz_order_id).eq("status", "gateway_pending").execute()
                    logger.info("[webhook] order marked failed for rz_order_id=%s", rz_order_id)
                except Exception:  # noqa: BLE001
                    pass

    return {"ok": True}


@router.get("/status", response_model=BillingStatusOut)
def billing_status(user: CurrentUser = Depends(current_user)) -> BillingStatusOut:
    """Authenticated. Returns the caller's current plan + billing hold state."""
    admin = get_admin_client()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing service unavailable",
        )

    try:
        bp_id = resolve_own_bp_id(user.user_id)
    except OwnershipError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    profile_resp = admin.table("beautician_profiles").select(
        "plan, billing_hold"
    ).eq("id", bp_id).single().execute()

    profile = profile_resp.data or {}
    return BillingStatusOut(
        plan=profile.get("plan", "free"),
        billing_hold=bool(profile.get("billing_hold", False)),
        razorpay_configured=settings.is_razorpay_configured,
    )
