"""Public portfolio + service-detail endpoints (replace the TS
loadPortfolioData / loadServicePage server functions). Return the same JSON
bundle shapes the frontend's portfolio-mapper consumes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from ..services.portfolio import get_published_portfolio_by_slug, get_published_service_page

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/{slug}")
def portfolio_bundle(slug: str) -> dict:
    bundle = get_published_portfolio_by_slug(slug)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return bundle


@router.get("/{profile_slug}/services/{service_slug}")
def service_page(profile_slug: str, service_slug: str) -> dict:
    bundle = get_published_service_page(profile_slug, service_slug)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Service page not found")
    return bundle


# A bare GET to keep empty-response routes from being conflated with 404s.
@router.get("")
def portfolio_index(response: Response) -> dict:
    response.status_code = 404
    return {"detail": "Portfolio slug required"}
