"""Unit tests for the lead submission schema and the public portfolio helpers."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.leads import SUBMIT_LEAD_RPC_KEYS, SubmitLeadIn
from app.services.portfolio import resolve_service_slug


class TestSubmitLeadIn:
    def test_accepts_underscore_json_keys(self):
        payload = SubmitLeadIn.model_validate(
            {"_slug": "demo-dharti", "_name": "Priya", "_phone": "9876543210"}
        )
        args = payload.rpc_args()
        assert args["_slug"] == "demo-dharti"
        assert args["_name"] == "Priya"
        assert args["_source"] == "portfolio"  # default applied

    def test_rpc_args_always_emits_full_overload_key_set(self):
        # A stale 11-param submit_lead overload lives in the DB; the current
        # 20-param one is only resolvable when every key is present, so
        # absent optionals must be emitted as None (not dropped).
        payload = SubmitLeadIn.model_validate(
            {"_slug": "s", "_name": "n", "_phone": "1234567890", "_message": None}
        )
        args = payload.rpc_args()
        assert set(args) == set(SUBMIT_LEAD_RPC_KEYS)
        assert args["_message"] is None
        assert args["_conversion_path"] is None  # key present, value None

    def test_accepts_clear_name_fields_too(self):
        payload = SubmitLeadIn.model_validate({"slug": "s", "name": "n", "phone": "1234567890"})
        assert payload.rpc_args()["_slug"] == "s"

    def test_requires_required_fields(self):
        with pytest.raises(ValidationError):
            SubmitLeadIn.model_validate({"_name": "Priya"})


class TestResolveServiceSlug:
    def test_persisted_slug_wins(self):
        assert resolve_service_slug({"slug": "bridal-makeup", "name": "Bridal Makeup"}) == "bridal-makeup"

    def test_falls_back_to_slugified_name(self):
        assert resolve_service_slug({"slug": None, "name": "Bridal Makeup!"}) == "bridal-makeup"

    def test_empty_slug_falls_back(self):
        assert resolve_service_slug({"slug": "", "name": "Nail Art"}) == "nail-art"