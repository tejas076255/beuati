"""Authentication & authorization dependencies.

The frontend already attaches the user's Supabase access token as
`Authorization: Bearer <token>` on every server-function call (see
`src/integrations/supabase/auth-attacher.ts`). The TanStack server proxies that
header straight through to FastAPI, so this module verifies the JWT locally
with the project's JWT secret and derives the authenticated user id (`sub`).

Role/ownership checks reuse the existing Postgres RPCs (`has_role`,
`owns_beautician_profile*`) exactly as the TS server code does, so security
policy stays in the database, not duplicated in Python.
"""
from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser:
    """Authenticated user derived from the verified Supabase access token."""

    def __init__(self, user_id: str, email: str | None = None, role: str | None = None):
        self.user_id = user_id
        self.email = email
        self.role = role


def _verify_token(token: str) -> dict:
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET is not configured",
        )
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        )


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    """Resolve the authenticated user from the bearer token, or 401."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    payload = _verify_token(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has no subject",
        )
    return CurrentUser(user_id=sub, email=payload.get("email"))


def current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser | None:
    """Resolve the authenticated user if a valid token is present, else None."""
    if credentials is None or not credentials.credentials:
        return None
    try:
        payload = _verify_token(credentials.credentials)
    except HTTPException:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    return CurrentUser(user_id=sub, email=payload.get("email"))


def require_role(role: str):
    """Dependency factory: require the authenticated user to hold `role`.

    Uses the `has_role` Postgres RPC (same source of truth the TS admin
    server functions use). The RPC signature is `has_role(_user_id, _role)`
    (see src/integrations/supabase/types.ts), so both arguments are passed —
    omitting `_user_id` would make PostgREST reject (or mis-resolve) the call
    and every admin request would 403.
    """

    def _require(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        from .supabase import get_client
        import logging

        logger = logging.getLogger("beautyfolio.security")
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
