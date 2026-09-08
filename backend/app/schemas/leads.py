"""Pydantic schemas for the public lead-submission flow.

Mirrors `Database["public"]["Functions"]["submit_lead"]["Args"]` from
`src/integrations/supabase/types.ts`. The RPC parameter names are
underscore-prefixed (`_slug`, `_name`, ...), so the JSON the frontend sends
uses those keys — here represented as Pydantic aliases (Pydantic forbids
leading-underscore field names).
"""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field

# Full current submit_lead signature (20 params) — see migration
# 20260827090000_p2_security_relational_hardening.sql. A stale 11-param
# overload survives in the DB from an earlier migration; PostgREST can only
# resolve the current one when ALL 20 keys are present, so rpc_args() must
# emit every key (None for absent optionals).
SUBMIT_LEAD_RPC_KEYS = (
    "_slug", "_name", "_phone", "_email", "_message", "_event_date", "_location",
    "_service_id", "_package_id", "_source", "_service_requested",
    "_utm_source", "_utm_medium", "_utm_campaign", "_utm_content", "_utm_term",
    "_landing_path", "_conversion_path", "_referrer_host", "_cta_location",
)


class SubmitLeadIn(BaseModel):
    slug: str = Field(alias="_slug")
    name: str = Field(alias="_name")
    phone: str = Field(alias="_phone")
    email: Optional[str] = Field(default=None, alias="_email")
    message: Optional[str] = Field(default=None, alias="_message")
    event_date: Optional[str] = Field(default=None, alias="_event_date")
    location: Optional[str] = Field(default=None, alias="_location")
    service_id: Optional[uuid.UUID] = Field(default=None, alias="_service_id")
    package_id: Optional[uuid.UUID] = Field(default=None, alias="_package_id")
    source: str = Field(default="portfolio", alias="_source")
    service_requested: Optional[str] = Field(default=None, alias="_service_requested")

    # Attribution fields (Phase 2.9 lead_inquiries_attribution)
    conversion_path: Optional[str] = Field(default=None, alias="_conversion_path")
    cta_location: Optional[str] = Field(default=None, alias="_cta_location")
    landing_path: Optional[str] = Field(default=None, alias="_landing_path")
    referrer_host: Optional[str] = Field(default=None, alias="_referrer_host")
    utm_source: Optional[str] = Field(default=None, alias="_utm_source")
    utm_medium: Optional[str] = Field(default=None, alias="_utm_medium")
    utm_campaign: Optional[str] = Field(default=None, alias="_utm_campaign")
    utm_term: Optional[str] = Field(default=None, alias="_utm_term")
    utm_content: Optional[str] = Field(default=None, alias="_utm_content")

    model_config = {"populate_by_name": True}

    def rpc_args(self) -> dict:
        """Exact kwargs for supabase-py's rpc('submit_lead', **args).

        Always emits the full 20-parameter key set (alias keys `_slug`, ...;
        None for absent optionals). Dropping Nones (as the TS client's
        *omission* does) makes PostgREST unable to disambiguate the stale
        11-param overload from the current one — the frontend avoids this by
        unconditionally sending `_conversion_path` + `_cta_location`; here we
        guarantee it structurally.
        """
        dumped = self.model_dump(by_alias=True)
        return {k: dumped.get(k) for k in SUBMIT_LEAD_RPC_KEYS}


class SubmitLeadOut(BaseModel):
    error: Optional[str] = None
    lead_id: Optional[uuid.UUID] = None
