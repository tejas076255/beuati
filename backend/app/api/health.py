"""Health check endpoint for load balancers / uptime probes."""
from __future__ import annotations

from fastapi import APIRouter

from ..core.config import settings
from ..core.supabase import get_client

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "supabase_configured": settings.is_supabase_configured,
        "admin_configured": settings.is_admin_configured,
        "razorpay_configured": settings.is_razorpay_configured,
    }


@router.get("/health/db")
def health_db() -> dict:
    """Checks DB connectivity by issuing a trivial query against Supabase."""
    try:
        client = get_client()
        client.table("beautician_profiles").select("id").limit(1).execute()
        return {"status": "ok"}
    except Exception as exc:  # pragma: no cover - defensive
        return {"status": "error", "detail": str(exc)}
