"""Transactional-email transport + lead-arrival notification content.

Python port of `src/lib/email/transport.ts` and `src/lib/email/
lead-notification.ts`. Same behavior:
- No Resend credentials -> a mock transport that sends nothing, logs a
  sanitized one-line summary (subject only), and reports success.
- Resend configured -> POST https://api.resend.com/emails via httpx with a
  5s timeout; a slow/hanging provider is just another failed result, never a
  customer-visible failure.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

import httpx

from ..core.config import settings

logger = logging.getLogger("beautyfolio.email")

RESEND_TIMEOUT_MS = 5_000
RESEND_URL = "https://api.resend.com/emails"


@dataclass
class EmailPayload:
    to: str
    subject: str
    text: str


@dataclass
class EmailSendResult:
    ok: bool
    provider: str  # "mock" | "resend"
    error: str | None = None


def create_mock_transport():
    def send(payload: EmailPayload) -> EmailSendResult:
        logger.info(
            "[lead-notification] provider=mock (unconfigured) subject=%r", payload.subject
        )
        return EmailSendResult(ok=True, provider="mock")

    return send


def create_resend_transport(api_key: str, from_email: str, timeout_ms: int = RESEND_TIMEOUT_MS):
    def send(payload: EmailPayload) -> EmailSendResult:
        try:
            resp = httpx.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"from": from_email, "to": [payload.to], "subject": payload.subject, "text": payload.text},
                timeout=timeout_ms / 1000,
            )
            if resp.status_code >= 400:
                return EmailSendResult(
                    ok=False, provider="resend", error=f"Resend responded {resp.status_code}"
                )
            return EmailSendResult(ok=True, provider="resend")
        except httpx.TimeoutException:
            return EmailSendResult(
                ok=False, provider="resend", error=f"Resend request timed out after {timeout_ms}ms"
            )
        except httpx.HTTPError as exc:
            return EmailSendResult(ok=False, provider="resend", error=str(exc))

    return send


def resolve_email_transport():
    """Select transport for the current environment — mirrors
    resolveEmailTransport() in transport.ts."""
    api_key = settings.resend_api_key
    from_email = settings.lead_notification_from_email
    if api_key and from_email:
        return create_resend_transport(api_key, from_email)
    return create_mock_transport()


# ---------------------------------------------------------------------------
# Lead-arrival notification content / decision helpers (lead-notification.ts)
# ---------------------------------------------------------------------------


def should_notify_for_inquiry(
    request_started_at_iso: str, latest_inquiry_created_at_iso: str | None
) -> bool:
    """A lead_inquiries row created at/after the request start means the RPC
    created a genuine new enquiry -> notify. A row from before means the RPC
    took its idempotent-replay branch -> the original already notified."""
    if not latest_inquiry_created_at_iso:
        return False
    try:
        latest = datetime.fromisoformat(latest_inquiry_created_at_iso.replace("Z", "+00:00"))
        started = datetime.fromisoformat(request_started_at_iso.replace("Z", "+00:00"))
    except ValueError:
        return False
    return latest >= started


def _line(label: str, value: str | None) -> str | None:
    trimmed = (value or "").strip()
    return f"{label}: {trimmed}" if trimmed else None


def absolute_url(path: str) -> str:
    """Same fallback semantics as src/lib/site-url.ts: relative path when the
    site URL isn't configured, never a fabricated domain."""
    if path.startswith("http://") or path.startswith("https://"):
        return path
    normalized = path if path.startswith("/") else f"/{path}"
    site = settings.site_url.rstrip("/")
    return f"{site}{normalized}" if site else normalized


def build_lead_notification_email(lead: dict, professional_name: str) -> dict:
    """Port of buildLeadNotificationEmail() — operational ENQUIRY/AVAILABILITY
    wording, not booking/reservation language."""
    subject = "New BeautyFolio enquiry"
    lines = [
        f"Hi {professional_name},",
        "",
        "You've received a new enquiry / availability request through your BeautyFolio portfolio.",
        "",
        _line("Customer name", lead.get("name")),
        _line("Phone", lead.get("phone")),
        _line("Location", lead.get("location")),
        _line("Requested service", lead.get("service_requested")),
        _line("Preferred date", lead.get("event_date")),
        _line("Message", lead.get("message")),
        _line("Source", lead.get("source")),
        "",
        f"Open your BeautyFolio Leads dashboard to respond: {absolute_url('/dashboard/leads')}",
        "",
        "This is an enquiry, not a confirmed booking.",
    ]
    return {"subject": subject, "text": "\n".join(line for line in lines if line is not None)}
