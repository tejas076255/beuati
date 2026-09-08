"""Public portfolio data-access (Python port of src/data/portfolio-query.
server.ts and src/data/service-page-query.server.ts).

Read-only bundle assembly for the public portfolio page and the public
service-detail SEO landing page. The FastAPI service uses the service-role
client (decided architecture), so the same explicit filters the TS code
applies (status='published', billing_hold=false, is_active/is_published)
are preserved here — those filters are what keep unpublished/draft content
out of the public response.
"""
from __future__ import annotations

import logging
from typing import Optional

from ..core.supabase import get_client
from . import billing

logger = logging.getLogger("beautyfolio.portfolio")

# Same public-safe column allow-list as PUBLIC_BEAUTICIAN_PROFILE_COLUMNS in
# portfolio-query.server.ts — never select("*") on beautician_profiles.
PUBLIC_BEAUTICIAN_PROFILE_COLUMNS = (
    "id, slug, business_name, display_name, professional_title, short_tagline, "
    "bio, bio_secondary, profile_image_url, primary_city, locality, state, "
    "country, years_experience, phone, whatsapp_number, email, instagram_url, "
    "facebook_url, youtube_url, website_url, address, working_hours, "
    "travel_note, map_query, about_highlights, why_choose_points, is_verified"
)


def _data(response) -> list:
    """List rows from an execute() result.

    supabase-py >= 2.31 returns ``APIResponse`` (``.data`` list) on success and
    *raises* ``postgrest.APIError`` on failure — genuine failures propagate,
    matching the "throws on genuine query failures" contract below.
    """
    return getattr(response, "data", None) or []


def _row(response) -> Optional[dict]:
    """Single row from a maybe_single() result, or None when absent.

    maybe_single().execute() returns None for zero rows and a
    ``SingleAPIResponse`` (``.data`` dict) for one; API failures raise."""
    data = getattr(response, "data", None)
    return data if isinstance(data, dict) and data else None


def _slugify(value: str) -> str:
    """Rough slug for legacy services without a persisted slug (Python port
    of the slugify() fallback in seo-helpers.ts). Kept intentionally simple —
    only used for URL stability of legacy rows."""
    import re
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", value.lower()).strip()
    return re.sub(r"[\s_]+", "-", s)


def resolve_service_slug(service: dict) -> str:
    return (service.get("slug") or "").strip() or _slugify(service.get("name") or "")


def get_published_portfolio_by_slug(slug: str) -> Optional[dict]:
    """Fully-assembled read-only portfolio bundle, or None when the profile
    doesn't exist / isn't published / fails the billing-safety gate (all
    three indistinguishable by design). Throws on genuine query failures."""
    client = get_client()

    # Billing-safety gate, before the content read (service-role, fail-closed).
    public_access_safe = True
    try:
        id_lookup = _row(
            client.table("beautician_profiles").select("id").eq("slug", slug).maybe_single().execute()
        )
        if id_lookup:
            public_access_safe = billing.ensure_public_access_safe(id_lookup["id"])
    except Exception:  # noqa: BLE001
        logger.exception('[portfolio] billing-safety lookup failed for slug "%s"', slug)
        public_access_safe = False

    if not public_access_safe:
        return None

    profile = _row(
        client.table("beautician_profiles")
        .select(PUBLIC_BEAUTICIAN_PROFILE_COLUMNS)
        .eq("slug", slug)
        .eq("status", "published")
        .eq("billing_hold", False)
        .maybe_single()
        .execute()
    )
    if profile is None:
        return None

    bp_id = profile["id"]

    beautician_specializations = _data(
        client.table("beautician_specializations")
        .select("specialization_id, sort_order")
        .eq("beautician_profile_id", bp_id)
        .order("sort_order")
        .execute()
    )
    services = _data(
        client.table("services")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_active", True)
        .order("sort_order")
        .execute()
    )
    packages = _data(
        client.table("packages")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_active", True)
        .order("sort_order")
        .execute()
    )
    portfolio_items = _data(
        client.table("portfolio_items")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_published", True)
        .order("sort_order")
        .execute()
    )
    before_after_items = _data(
        client.table("before_after_items")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_published", True)
        .order("sort_order")
        .execute()
    )
    videos = _data(
        client.table("portfolio_videos")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_published", True)
        .order("sort_order")
        .execute()
    )
    reviews = _data(
        client.table("reviews")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_published", True)
        .order("review_date", desc=True)
        .execute()
    )
    service_areas = _data(
        client.table("service_areas")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_active", True)
        .order("sort_order")
        .execute()
    )
    availability = _row(
        client.table("availability_settings")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .maybe_single()
        .execute()
    )
    blocked_dates = _data(
        client.table("availability_blocked_dates")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .order("blocked_date")
        .execute()
    )
    faqs = _data(
        client.table("faqs")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_published", True)
        .order("sort_order")
        .execute()
    )
    seo = _row(
        client.table("portfolio_seo").select("*").eq("beautician_profile_id", bp_id).maybe_single().execute()
    )

    # QA-only table until its migration is approved — best-effort, never a
    # broken page if it doesn't exist.
    tracking_gtm_container_id = None
    try:
        tracking = _row(
            client.table("portfolio_tracking_settings")
            .select("gtm_container_id")
            .eq("beautician_profile_id", bp_id)
            .maybe_single()
            .execute()
        )
        tracking_gtm_container_id = (tracking or {}).get("gtm_container_id")
    except Exception:  # noqa: BLE001
        logger.exception(
            '[portfolio] tracking settings unavailable for slug "%s" (treated as unconfigured)', slug
        )

    # Specializations join (preserve requested order).
    specialization_ids = [r["specialization_id"] for r in beautician_specializations]
    specializations: list[dict] = []
    if specialization_ids:
        spec_rows = _data(
            client.table("specializations").select("*").in_("id", specialization_ids).execute()
        )
        by_id = {s["id"]: s for s in spec_rows}
        specializations = [by_id[i] for i in specialization_ids if i in by_id]

    # Image joins.
    portfolio_images_by_item: dict[str, list[dict]] = {}
    if portfolio_items:
        for img in _data(
            client.table("portfolio_images")
            .select("*")
            .in_("portfolio_item_id", [i["id"] for i in portfolio_items])
            .order("sort_order")
            .execute()
        ):
            portfolio_images_by_item.setdefault(img["portfolio_item_id"], []).append(img)

    before_after_images_by_item: dict[str, list[dict]] = {}
    if before_after_items:
        for img in _data(
            client.table("before_after_images")
            .select("*")
            .in_("before_after_id", [i["id"] for i in before_after_items])
            .order("sort_order")
            .execute()
        ):
            before_after_images_by_item.setdefault(img["before_after_id"], []).append(img)

    return {
        "profile": profile,
        "specializations": specializations,
        "services": services,
        "packages": packages,
        "portfolioItems": [
            {**item, "images": portfolio_images_by_item.get(item["id"], [])}
            for item in portfolio_items
        ],
        "beforeAfter": [
            {**item, "images": before_after_images_by_item.get(item["id"], [])}
            for item in before_after_items
        ],
        "videos": videos,
        "reviews": reviews,
        "serviceAreas": service_areas,
        "availability": availability,
        "blockedDates": blocked_dates,
        "faqs": faqs,
        "seo": seo,
        "trackingGtmContainerId": tracking_gtm_container_id,
    }


def get_published_service_page(profile_slug: str, service_slug: str) -> Optional[dict]:
    """Bundle for the public service-detail SEO page, or None (genuine 404)."""
    client = get_client()

    profile = _row(
        client.table("beautician_profiles")
        .select(PUBLIC_BEAUTICIAN_PROFILE_COLUMNS)
        .eq("slug", profile_slug)
        .eq("status", "published")
        .maybe_single()
        .execute()
    )
    if profile is None:
        return None

    bp_id = profile["id"]

    services = _data(
        client.table("services")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_active", True)
        .execute()
    )
    seo = _row(
        client.table("portfolio_seo").select("*").eq("beautician_profile_id", bp_id).maybe_single().execute()
    )
    service_areas = _data(
        client.table("service_areas")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_active", True)
        .order("sort_order")
        .execute()
    )
    reviews = _data(
        client.table("reviews")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("is_published", True)
        .execute()
    )
    availability = _row(
        client.table("availability_settings")
        .select("working_hours, appointment_type, travel_available")
        .eq("beautician_profile_id", bp_id)
        .maybe_single()
        .execute()
    )

    service = next((s for s in services if resolve_service_slug(s) == service_slug), None)
    if service is None:
        return None

    related_gallery_images = _data(
        client.table("portfolio_images")
        .select("*, portfolio_items!inner(is_published, service_id, title, category)")
        .eq("portfolio_items.service_id", service["id"])
        .eq("portfolio_items.is_published", True)
        .execute()
    )

    related_before_after_items = _data(
        client.table("before_after_items")
        .select("*")
        .eq("beautician_profile_id", bp_id)
        .eq("service_id", service["id"])
        .eq("is_published", True)
        .execute()
    )
    before_after_images: list[dict] = []
    if related_before_after_items:
        before_after_images = _data(
            client.table("before_after_images")
            .select("*")
            .in_("before_after_id", [i["id"] for i in related_before_after_items])
            .execute()
        )
    by_item: dict[str, list[dict]] = {}
    for img in before_after_images:
        by_item.setdefault(img["before_after_id"], []).append(img)
    related_before_after = [
        {**item, "images": by_item.get(item["id"], [])} for item in related_before_after_items
    ]

    return {
        "profile": profile,
        "seo": seo,
        "service": service,
        "otherServices": [s for s in services if s["id"] != service["id"]],
        "serviceAreas": service_areas,
        "reviews": reviews,
        "relatedGalleryImages": related_gallery_images,
        "relatedBeforeAfter": related_before_after,
        "appointmentType": (availability or {}).get("appointment_type"),
        "travelAvailable": bool((availability or {}).get("travel_available", False)),
        "workingHours": (availability or {}).get("working_hours"),
    }
