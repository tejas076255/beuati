// Phase 3G.3 — the ONE centralized analytics/event interface for the whole
// app. Every component calls trackEvent()/useTrackedPageView() here; no
// component ever calls gtag()/dataLayer.push() directly.
//
// AUDIT (Phase 3G.3 §1): grepped the entire repo for gtag/dataLayer/GTM/GA4/
// Meta Pixel/analytics libraries before writing anything — none exist. No
// tracking scripts, no env vars for any analytics provider, no UTM/referrer
// handling anywhere. This is a genuinely new foundation, not a duplicate of
// something already there.
//
// ARCHITECTURE DECISION (§5): push events onto the browser's standard
// `window.dataLayer` array — the same interface both Google Tag Manager and
// gtag.js/GA4 already consume natively, and that Meta's CAPI/Conversions
// tooling can also be pointed at later via a GTM trigger. This is the
// smallest possible vendor-neutral layer: no analytics SDK is installed, no
// script is loaded unless a real GTM container ID is configured, and every
// event this file ever fires is immediately GTM/GA4-ready without any
// application code changes once a container exists — pushing to an array
// with nothing consuming it is a complete no-op (no network request, no
// third-party code, no measurable performance cost), so local development
// and any environment without a configured container work identically to
// today.
//
// CONFIGURATION (§4): follows the exact existing convention in
// src/lib/site-url.ts — a VITE_-prefixed env var, trimmed, empty string
// when unset, never a hardcoded/invented ID. No GTM container ID or GA4
// measurement ID exists in this repo's .env today, so analytics is
// currently fully configured-off everywhere by default; setting
// VITE_GTM_ID later is the only step needed to start actually sending data
// anywhere.
const GTM_ID = (import.meta.env["VITE_GTM_ID"] ?? "").trim();

/** True only when a real GTM container ID is configured — never assume one. */
export function isAnalyticsConfigured(): boolean {
  return GTM_ID.length > 0;
}

/** The configured GTM container ID, or "" — read by __root.tsx to decide
 * whether to inject the GTM loader script. Never hardcode this elsewhere. */
export function getGtmId(): string {
  return GTM_ID;
}

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export type AnalyticsPropertyValue = string | number | boolean | undefined;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

// ---------- event taxonomy (Phase 3G.3 §6/§7) ----------
// Small, stable, snake_case, never containing a professional/service name
// (those go in *properties*, e.g. service_name, not the event name itself —
// §7). Deliberately excludes service_cta_click/package_cta_click: audited
// (§16) and found redundant with service_view + whatsapp_click/
// availability_cta_click already carrying a cta_location — see the phase
// report for the full reasoning.
export const AnalyticsEvent = {
  PortfolioView: "portfolio_view",
  ServiceView: "service_view",
  AvailabilityCtaClick: "availability_cta_click",
  AvailabilityFormStart: "availability_form_start",
  AvailabilityFormSubmit: "availability_form_submit",
  AvailabilityFormSuccess: "availability_form_success",
  WhatsappClick: "whatsapp_click",
  // Per-portfolio GTM phase — the standard marketing-conversion event name
  // GTM/GA4/Meta Pixel tags are typically wired to. Fired at the exact same
  // confirmed-success point as availability_form_success (never optimistic,
  // never on validation failure) so a professional's GTM container has one
  // canonical, non-PII conversion event to bind ad/analytics tags to,
  // without renaming or removing the existing internal product event.
  LeadSubmit: "lead_submit",
  // Mirrors whatsapp_click exactly — the existing tel: contact links had no
  // click tracking at all before this phase.
  PhoneClick: "phone_click",
  // Phase 3G.3C §18 — internal dashboard event only (the beautician clicking
  // an Insights row to drill into their own CRM list). Never carries
  // customer data, just the filter type/value/date-range that was clicked.
  InsightDrilldown: "insight_drilldown",
} as const;
export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

// ---------- CTA location convention (§17) ----------
// One shared, typed vocabulary — components must pick from this list, never
// an arbitrary free-text string, so "hero" on the portfolio page and
// "hero" on the service page always mean the same thing downstream.
export const CtaLocation = {
  Hero: "hero",
  HeroCard: "hero_card",
  ServiceCard: "service_card",
  PackageCard: "package_card",
  AvailabilitySection: "availability_section",
  FinalCta: "final_cta",
  MobileSticky: "mobile_sticky",
  FloatingWhatsapp: "floating_whatsapp",
  ServiceDetailHeader: "service_detail_header",
  ServiceDetailHero: "service_detail_hero",
  ContactSection: "contact_section",
} as const;
export type CtaLocationValue = (typeof CtaLocation)[keyof typeof CtaLocation];

/**
 * The one function every component uses to record a business event.
 * Never throws — a failed/blocked analytics call must never break page
 * rendering, form submission, WhatsApp navigation, or lead creation (§ core
 * principle). SSR-safe (no-ops when `window` doesn't exist yet).
 *
 * PRIVACY (§9): callers must never pass customer PII (name, phone, email,
 * message, address, free-text enquiry content) — this function does not
 * scrub input, so the discipline lives entirely in each call site; every
 * call site in this codebase was written to only ever pass non-PII business
 * context (profile/service identifiers+slugs+names, page/cta metadata).
 */
export function trackEvent(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event: eventName, ...properties });
    // Development-safe debugging only (§24) — never logs in production,
    // never becomes a UI/dashboard.
    if (import.meta.env.DEV) {
      console.debug(`[analytics] ${eventName}`, properties);
    }
  } catch {
    // Analytics must never break the app — swallow and move on.
  }
}

// ---------- one-per-page-visit view tracking (§10/§11/§25) ----------
import { useEffect, useRef } from "react";

/**
 * Fires `eventName` at most once per distinct `key` (e.g. a profile or
 * service slug) — never on every re-render, and never twice for the exact
 * same page visit even under React Strict Mode's dev-only double-invoke of
 * effects (mount → cleanup → mount fires this hook's effect twice for the
 * same key; the ref guard below makes the second invocation a no-op).
 * Runs client-side only via useEffect, so SSR and the hydration pass never
 * fire this — only genuine post-hydration browser page visits do, which by
 * construction rules out an SSR-vs-hydration double count (§10). Navigating
 * to a *different* key (a different profile/service) correctly fires again,
 * since that's a genuine new page visit.
 */
export function useTrackedPageView(
  eventName: AnalyticsEventName,
  key: string,
  properties: AnalyticsProperties,
): void {
  const lastFiredKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastFiredKey.current === key) return;
    lastFiredKey.current = key;
    trackEvent(eventName, properties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, key]);
}
