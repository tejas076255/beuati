"""Authentication & authorization dependencies.

Token verification uses the Supabase Auth API (getUser) instead of local
JWT decoding — this works with both legacy HS256 and new ECC P-256 keys,
and requires no SUPABASE_JWT_SECRET configuration.
"""
from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

logger = logging.getLogger("beautyfolio.security")
bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser:
    def __init__(self, user_id: str, email: str | None = None, role: str | None = None):
        self.user_id = user_id
        self.email = email
        self.role = role


def _verify_token_via_supabase(token: str) -> dict:
    """Verify token by calling Supabase Auth getUser — works with all key types."""
    import httpx

    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase is not configured",
        )

    try:
        resp = httpx.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_publishable_key,
            },
            timeout=10.0,
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token verification timed out",
        )
    except httpx.HTTPError as exc:
        logger.error("Supabase getUser request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token verification failed",
        )

    if resp.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed ({resp.status_code})",
        )

    data = resp.json()
    return data


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    data = _verify_token_via_supabase(credentials.credentials)
    user_id = data.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has no subject",
        )
    return CurrentUser(user_id=user_id, email=data.get("email"))


def current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser | None:
    if credentials is None or not credentials.credentials:
        return None
    try:
        data = _verify_token_via_supabase(credentials.credentials)
    except HTTPException:
        return None
    user_id = data.get("id")
    if not user_id:
        return None
    return CurrentUser(user_id=user_id, email=data.get("email"))


def require_role(role: str):
    def _require(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        from .supabase import get_client

        try:
            result = get_client().rpc(
                "has_role", {"_role": role, "_user_id": user.user_id}
            ).execute()
            has = bool(result.data)
        except Exception:
            logger.exception("has_role RPC failed for user %s role %s", user.user_id, role)
            has = False
        if not has:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {role}",
            )
        user.role = role
        return user

    return _require


require_admin = require_role("admin")
