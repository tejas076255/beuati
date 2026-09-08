"""Public lead submission endpoint (replaces the TS submitPortfolioLeadFn
server function). The submit_lead RPC is the sole authority for validation."""
from __future__ import annotations

import logging

from fastapi import APIRouter

from ..schemas.leads import SubmitLeadIn, SubmitLeadOut
from ..services.leads import submit_portfolio_lead

logger = logging.getLogger("beautyfolio.api.leads")

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("", response_model=SubmitLeadOut)
def submit_lead(payload: SubmitLeadIn) -> SubmitLeadOut:
    result = submit_portfolio_lead(payload.rpc_args())
    return SubmitLeadOut(**result)
