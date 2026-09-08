"""Unit tests for the lead-submission orchestration with a mocked Supabase
client. Mirrors the frontend's premise: submit_lead RPC is the authority,
the email notification is best-effort and can never break the lead.

The fakes model supabase-py >= 2.31: execute() returns an APIResponse-like
object (``.data``) and RPC/query failures are raised as APIError.
"""
from __future__ import annotations

from postgrest.exceptions import APIError

from app.services import leads


class FakeRowRes:
    """A supabase-py execute() result carrying a single dict row."""

    def __init__(self, data):
        self.data = data


class FakeListRes:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    """Minimal chainable stand-in for a supabase-py query builder."""

    def __init__(self, final):
        self._final = final

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if isinstance(self._final, dict):
            return FakeRowRes(self._final)
        return FakeListRes(self._final)


def make_fake_client(lead_row=None, profile_row=None, has_inquiry=True, inquiry_created_at=None):
    """Returns a fake client wired so its tables respond like a real flow."""

    class FakeTable:
        def __init__(self, name):
            self.name = name

        def select(self, *a, **k):
            return self

        def eq(self, *a, **k):
            return self

        def order(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

        def maybe_single(self):
            return self

        def execute(self):
            if self.name == "leads":
                return FakeRowRes(lead_row) if lead_row else FakeRowRes({})
            if self.name == "lead_inquiries":
                created_at = inquiry_created_at
                if created_at is None and has_inquiry:
                    from datetime import datetime, timedelta, timezone
                    created_at = (datetime.now(timezone.utc) + timedelta(seconds=5)).isoformat()
                return FakeRowRes({"created_at": created_at}) if created_at else FakeRowRes(None)
            if self.name == "beautician_profiles":
                return FakeRowRes(profile_row)
            return FakeRowRes({})

    class FakeRpcLike:
        """Chained builder produced by client.rpc() — matches supabase-py,
        where rpc() returns a builder you then .execute() on."""

        def __init__(self, final):
            self._final = final

        def execute(self):
            return FakeRowRes(self._final)

    class FakeClient:
        def __init__(self):
            self.calls = {"rpc": []}

        def table(self, name):
            return FakeTable(name)

        def rpc(self, fn, args):
            self.calls["rpc"].append({"fn": fn, "args": args})
            if fn == "submit_lead":
                return FakeRpcLike("lead-123")
            raise AssertionError(f"Unexpected rpc {fn}")

    return FakeClient()


def test_submit_portfolio_lead_happy_path(monkeypatch):
    client = make_fake_client(
        lead_row={
            "beautician_profile_id": "bp-1",
            "name": "Priya",
            "phone": "9876543210",
            "service_requested": "Bridal",
            "source": "portfolio",
        },
        profile_row={"display_name": "Dharti", "profiles": {"email": "dharti@example.com"}},
    )
    monkeypatch.setattr(leads, "get_client", lambda: client)
    sent = []
    monkeypatch.setattr(
        leads, "resolve_email_transport", lambda: (lambda payload: sent.append(payload) or leads.EmailSendResult(ok=True, provider="mock"))
    )

    result = leads.submit_portfolio_lead({"_slug": "demo-dharti", "_name": "Priya", "_phone": "9876543210"})

    assert result["error"] is None
    assert result["lead_id"] == "lead-123"
    # email notification was attempted
    assert sent and sent[0].to == "dharti@example.com"


def test_submit_portfolio_lead_missing_profile_logs_no_email(monkeypatch):
    client = make_fake_client(
        lead_row={"beautician_profile_id": "bp-1", "name": "Priya", "phone": "9876543210"},
        profile_row=None,  # no account email -> no send
    )
    monkeypatch.setattr(leads, "get_client", lambda: client)
    sent = []
    monkeypatch.setattr(
        leads, "resolve_email_transport", lambda: (lambda payload: sent.append(payload) or leads.EmailSendResult(ok=True, provider="mock"))
    )

    result = leads.submit_portfolio_lead({"_slug": "demo-dharti", "_name": "Priya", "_phone": "9876543210"})

    assert result["lead_id"] == "lead-123"
    assert sent == []  # no email when account email unresolvable


def test_submit_portfolio_lead_rpc_error_returns_error(monkeypatch):
    class ErrRpc:
        def execute(self):
            raise APIError({"message": "Portfolio not available", "code": "P0001"})

    class ErrClient:
        def rpc(self, fn, args):
            return ErrRpc()

    monkeypatch.setattr(leads, "get_client", lambda: ErrClient())

    result = leads.submit_portfolio_lead({"_slug": "missing", "_name": "x", "_phone": "1234567890"})
    # A raised RPC error (supabase-py >= 2.31) must surface as the error dict.
    assert result["error"] == "Portfolio not available"
    assert result["lead_id"] is None