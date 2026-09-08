"""FastAPI application entrypoint.

Runs the BeautyFolio backend as a standalone service. The React frontend
(TanStack Start SSR) calls these endpoints from its server functions, forwarding
the user's Supabase bearer token.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import health, leads, portfolio, billing
from .core.config import settings

app = FastAPI(
    title="BeautyFolio API",
    version="0.1.0",
    description="Backend service for BeautyFolio (leads, portfolio, admin, dashboard, billing).",
)

# CORS — the frontend (Vite/TanStack dev origin) calls this API from the server
# functions; CORS is still configured for any direct browser use.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers. New domain routers are registered here as they are added.
app.include_router(health.router, prefix="/api")
app.include_router(leads.router, prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(billing.router, prefix="/api")


@app.get("/")
def root() -> dict:
    return {"service": "BeautyFolio API", "docs": "/docs", "health": "/api/health"}
