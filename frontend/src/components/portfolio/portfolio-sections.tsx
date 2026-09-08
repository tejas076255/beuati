import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  Sparkles,
  Star,
  X,
} from "lucide-react";

import { createServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  galleryFilters,
  imageAlt,
  type BeauticianProfile,
  type GalleryCategory,
} from "@/data/portfolio";
import type { Database } from "@/integrations/supabase/types";
import { getVideoEmbedSource } from "@/lib/video-embed";
// Phase 3G.2A §3 — moved to a shared helper so the public form and the
// dashboard's manual Add Lead form can never enforce divergent phone
// rules. The RPC (submit_lead) remains the authoritative server-side
// check for this route — this is a client-side convenience only.
import { isValidPhone } from "@/lib/phone";
import { AnalyticsEvent, CtaLocation, trackEvent, type CtaLocationValue } from "@/lib/analytics";
import { getAttributionSnapshot, getConversionPath, recordCtaClick } from "@/lib/attribution";

// Lead-arrival notification phase — was a direct browser ->
// supabase.rpc("submit_lead") call; now routed through this server
// function so a best-effort email notification can be attempted
// server-side after the RPC (unchanged authority for validation/dedup/
// creation) reports success. See src/data/leads-submit.server.ts.
const submitPortfolioLeadFn = createServerFn({ method: "POST" })
  .validator((data: Database["public"]["Functions"]["submit_lead"]["Args"]) => data)
  .handler(async ({ data, request }) => {
    const { isFastApiConfigured, callApi } = await import("@/lib/api-client.server");

    if (isFastApiConfigured()) {
      // FastAPI path: lead creation + best-effort email notify.
      const result = await callApi<{ error: string | null; lead_id: string }>({
        path: "/api/leads",
        method: "POST",
        body: data,
        request: { request },
      });
      return { error: result.error, leadId: result.lead_id };
    }

    // Direct Supabase fallback when FastAPI is not configured.
    const { submitPortfolioLead } = await import("@/data/leads-submit.server");
    return submitPortfolioLead(data);
  });

type P = { profile: BeauticianProfile };

export function waLink(profile: BeauticianProfile, message?: string) {
  const text =
    message ??
    `Hi ${profile.name.split(" ")[0]}, I'd like to check your availability for my function.`;
  return `https://wa.me/${profile.whatsapp}?text=${encodeURIComponent(text)}`;
}

const telLink = (profile: BeauticianProfile) => `tel:${profile.phone.replace(/\s/g, "")}`;

// Phase 3G.3 §12/§15/§17 — small shared trackers so every "Check
// availability"/WhatsApp CTA across this file (hero, service cards,
// packages, availability section, final CTA, mobile sticky, floating
// button) reports the exact same event/property shape, differing only by
// `cta_location` and (when relevant) which service the click was about.
// Never claims a booking or a sent message — see the event names
// themselves (§12 "this remains availability intent, NOT confirmed
// booking"; §15 "whatsapp_click, not whatsapp_message_sent").
function trackAvailabilityCtaClick(
  profile: BeauticianProfile,
  ctaLocation: CtaLocationValue,
  extra: { service_name?: string; package_name?: string } = {},
): void {
  trackEvent(AnalyticsEvent.AvailabilityCtaClick, {
    profile_slug: profile.slug,
    cta_location: ctaLocation,
    page_path: `/portfolio/${profile.slug}`,
    ...extra,
  });
  // Phase 3G.3A §16 — preserves which CTA drove the visitor toward the
  // form, through internal navigation, so a later successful submission
  // can attribute the correct origin instead of always recording
  // availability_section.
  recordCtaClick(ctaLocation, profile.slug);
}

function trackWhatsappClick(
  profile: BeauticianProfile,
  ctaLocation: CtaLocationValue,
  extra: { service_name?: string; package_name?: string } = {},
): void {
  trackEvent(AnalyticsEvent.WhatsappClick, {
    profile_slug: profile.slug,
    cta_location: ctaLocation,
    page_path: `/portfolio/${profile.slug}`,
    ...extra,
  });
}

function trackPhoneClick(profile: BeauticianProfile, ctaLocation: CtaLocationValue): void {
  trackEvent(AnalyticsEvent.PhoneClick, {
    profile_slug: profile.slug,
    cta_location: ctaLocation,
    page_path: `/portfolio/${profile.slug}`,
  });
}

/** `mapQuery` is meant to hold either a bare Google Maps embed URL or a
 * plain-text location to search for — but the dashboard field also accepts
 * a full pasted <iframe> snippet and normalizes it on save. This defends
 * the public render against any already-stored un-normalized value too, so
 * a fix on the dashboard side doesn't require every profile to be re-saved. */
function resolveMapEmbedSrc(mapQuery: string): string {
  let value = mapQuery.trim();
  if (value.includes("<iframe")) {
    value = value.match(/src="([^"]+)"/)?.[1] ?? value;
  }
  return value.startsWith("https://www.google.com/maps/embed")
    ? value
    : `https://www.google.com/maps?q=${encodeURIComponent(value)}&output=embed`;
}

function SectionHead({
  eyebrow,
  title,
  sub,
  center = true,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", center && "md:mx-auto md:text-center")}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-4 text-[26px] leading-tight font-semibold sm:text-3xl md:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Stars({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <span className={cn("flex text-accent", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-current" />
      ))}
    </span>
  );
}

/** Dots indicator driven by scroll position of a snap scroller. */
function useScrollIndex(ref: React.RefObject<HTMLDivElement | null>, count: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round((el.scrollLeft / (el.scrollWidth - el.clientWidth || 1)) * (count - 1));
      setIndex(Math.max(0, Math.min(count - 1, i)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, count]);
  return index;
}

function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div className="mt-4 flex justify-center gap-1.5 md:hidden" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === active ? "w-5 bg-primary" : "w-1.5 bg-border",
          )}
        />
      ))}
    </div>
  );
}

/* 1. HERO */
export function PortfolioHeroSection({ profile }: P) {
  return (
    <section
      id="top"
      className="bg-gradient-soft bg-beauty-bloom overflow-x-clip pt-24 pb-12 sm:pt-32 sm:pb-16"
    >
      <div className="section-shell grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <div className="min-w-0">
          <span className="eyebrow">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {profile.specialty}
          </span>
          <h1 className="mt-4 font-display text-[34px] leading-[1.08] font-semibold sm:text-[48px] lg:text-[56px]">
            {profile.name}
            {profile.isVerified && (
              <span
                className="ml-2.5 inline-flex translate-y-[-0.3em] items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 align-middle text-xs font-medium text-primary"
                title="Reviewed and approved by BeautyFolio"
              >
                <Check className="h-3 w-3" aria-hidden="true" /> Verified
              </span>
            )}
          </h1>
          <p className="mt-2 text-[19px] leading-snug font-medium text-primary sm:text-lg">
            {profile.headline}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[15px] text-muted-foreground sm:hidden">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> {profile.primaryCity}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px] sm:mt-6 sm:gap-2.5 sm:text-sm">
            {/* Real rating from published reviews only — hidden entirely
                when there are none yet, never a fabricated 0.0/0 (Phase
                3F.3A §4). */}
            {profile.rating != null && (
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-gold/30 bg-card/60 px-3 py-1.5 shadow-soft backdrop-blur-sm">
                <Stars />
                <span className="font-semibold">{profile.rating}</span>
                <span className="text-muted-foreground">
                  ({profile.reviewCount} review{profile.reviewCount === 1 ? "" : "s"})
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-gold/25 bg-secondary/50 px-3 py-1.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-gold" aria-hidden="true" />
              {profile.experience} experience
            </span>
            <span className="hidden items-center gap-2 rounded-full border border-rose-gold/25 bg-secondary/50 px-3 py-1.5 text-muted-foreground sm:inline-flex">
              <MapPin className="h-3.5 w-3.5 text-rose-gold" aria-hidden="true" />
              {profile.primaryCity}
            </span>
          </div>

          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            {profile.positioning}
          </p>

          <div className="mt-6 grid gap-2.5 sm:mt-8 sm:flex sm:flex-wrap sm:gap-3">
            <Button variant="hero" size="lg" className="w-full text-[15px] sm:w-auto" asChild>
              <a
                href="#availability"
                onClick={() => trackAvailabilityCtaClick(profile, CtaLocation.Hero)}
              >
                <Calendar aria-hidden="true" /> Check availability
              </a>
            </Button>
            <Button variant="softline" size="lg" className="w-full text-[15px] sm:w-auto" asChild>
              <a
                href={waLink(profile)}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackWhatsappClick(profile, CtaLocation.Hero)}
              >
                <MessageCircle aria-hidden="true" /> WhatsApp
              </a>
            </Button>
            <Button variant="ghost" size="lg" className="hidden sm:inline-flex" asChild>
              <a href="#gallery">View work</a>
            </Button>
          </div>

          {/* Hero trust bar — horizontal scroller on mobile */}
          <ul className="mt-7 -mx-5 flex snap-x gap-3 overflow-x-auto border-t border-border/70 px-5 pt-6 sm:mx-0 sm:flex-wrap sm:gap-x-8 sm:gap-y-3 sm:overflow-visible sm:px-0">
            {profile.trustBar.map((t) => (
              <li
                key={t.label}
                className="min-w-[7.5rem] shrink-0 snap-start rounded-2xl border border-rose-gold/25 bg-card/60 px-4 py-3 backdrop-blur-sm sm:min-w-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
              >
                <p className="font-display text-lg font-semibold sm:text-base">{t.value}</p>
                <p className="mt-0.5 text-[11px] tracking-widest text-muted-foreground uppercase">
                  {t.label}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="brand-arc relative mx-auto mt-2 w-full max-w-md text-primary lg:mt-0">
          {profile.portrait ? (
            <img
              src={profile.portrait}
              alt={`${profile.name}, ${profile.role} in ${profile.primaryCity}`}
              width={900}
              height={1100}
              fetchPriority="high"
              decoding="async"
              className="aspect-[4/5] w-full rounded-3xl object-cover object-top shadow-lift sm:aspect-auto sm:object-center"
            />
          ) : (
            // Genuine no-photo state (Phase 3F.9A) — never a fabricated
            // fallback photo. Matches the dashboard's own "No photo" circle
            // language, scaled up for the hero frame.
            <div
              className="bg-gradient-brand flex aspect-[4/5] w-full items-center justify-center rounded-3xl shadow-lift sm:aspect-auto"
              role="img"
              aria-label={`${profile.name}, ${profile.role} in ${profile.primaryCity}`}
            >
              <Sparkles className="h-14 w-14 text-primary-foreground/80" aria-hidden="true" />
            </div>
          )}
          {/* Phase 3G.1 §21 — was static, unverified "Next available
              date: Booking for this wedding season" copy with no real
              availability data behind it. Replaced with a genuine CTA
              using the same safe, generic wording as the hero button,
              and made it an actual link since it visually reads as one. */}
          <a
            href="#availability"
            onClick={() => trackAvailabilityCtaClick(profile, CtaLocation.HeroCard)}
            className="absolute -bottom-5 left-1/2 w-[88%] -translate-x-1/2 rounded-2xl border border-border bg-card px-4 py-3 text-center shadow-lift transition-shadow hover:shadow-soft"
          >
            <p className="text-xs text-muted-foreground">Ready to book?</p>
            <p className="text-sm font-semibold">Check availability for your date</p>
          </a>
        </div>
      </div>
    </section>
  );
}

/* 2. ABOUT */
export function AboutSection({ profile }: P) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section id="about" className="py-14 sm:py-20">
      <div className="section-shell grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-10">
        <div>
          <SectionHead
            eyebrow="About"
            title={`Meet ${profile.name.split(" ")[0]}`}
            center={false}
          />
          <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            {profile.about.intro}
          </p>
          <p
            className={cn(
              "mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base",
              !expanded && "hidden md:block",
            )}
          >
            {profile.about.second}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-primary md:hidden"
          >
            {expanded ? "Read less" : "Read more"}
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
              aria-hidden="true"
            />
          </button>

          <dl className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-4 sm:gap-4">
            {[
              { v: profile.experience, l: "Experience" },
              // Real, system-calculated published-work count — replaces the
              // former unverified client_count-derived "Brides" stat
              // (Phase 3F.3A §5/§6).
              { v: `${profile.publishedWorkCount}`, l: "Published looks" },
              // Real rating omitted entirely with no published reviews yet,
              // never shown as a fabricated 0★ (Phase 3F.3A §4).
              ...(profile.rating != null ? [{ v: `${profile.rating}★`, l: "Average rating" }] : []),
              { v: profile.primaryCity, l: "Based in" },
            ].map((m) => (
              <div
                key={m.l}
                className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
              >
                <dt className="sr-only">{m.l}</dt>
                <dd className="font-display text-xl font-semibold text-primary">{m.v}</dd>
                <p className="mt-0.5 text-[11px] tracking-widest text-muted-foreground uppercase">
                  {m.l}
                </p>
              </div>
            ))}
          </dl>

          <div className="mt-7 sm:mt-8">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Specialises in
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {profile.specializations.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-rose-gold/30 bg-card/50 px-3.5 py-2 text-[13px] tracking-wide shadow-soft backdrop-blur-sm"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ul className="grid content-start gap-3 sm:grid-cols-2 lg:mt-16">
          {profile.about.highlights.map((h) => (
            <li
              key={h}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-[15px] leading-snug shadow-soft sm:block sm:p-5 sm:text-sm"
            >
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mb-3" aria-hidden="true" />
              {h}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* 3. WHY CHOOSE ME */
export function WhyChooseSection({ profile }: P) {
  return (
    <section id="why" className="bg-gradient-soft py-14 sm:py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Why me"
          title={`Why brides choose ${profile.name.split(" ")[0]}`}
          sub="The details that decide how your makeup looks at hour fourteen — and in every photograph."
        />
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-3">
          {profile.whyChoose.map((w) => (
            <li
              key={w}
              className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 text-[14px] leading-snug shadow-soft transition-shadow sm:flex-row sm:items-start sm:gap-3 sm:p-6 sm:text-sm hover:shadow-lift"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary sm:mt-0.5 sm:h-7 sm:w-7">
                <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              {w}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* 4. GALLERY with filters + mobile mosaic + lightbox */
function Lightbox({
  profile,
  items,
  index,
  onClose,
  onIndex,
}: {
  profile: BeauticianProfile;
  items: BeauticianProfile["gallery"];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const touchX = useRef<number | null>(null);
  const next = useCallback(
    () => onIndex((index + 1) % items.length),
    [index, items.length, onIndex],
  );
  const prev = useCallback(
    () => onIndex((index - 1 + items.length) % items.length),
    [index, items.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [next, prev, onClose]);

  const img = items[index];
  if (!img) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gallery image viewer"
      className="fixed inset-0 z-[60] flex flex-col bg-plum-deep/95 backdrop-blur-sm"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        if (Math.abs(end - start) > 45) (end < start ? next : prev)();
        touchX.current = null;
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 text-primary-foreground"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <span className="text-sm font-semibold">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-3">
        <img
          src={img.src}
          alt={img.alt ?? imageAlt(profile, img.label)}
          className="max-h-[70vh] w-auto max-w-full rounded-2xl object-contain"
        />
      </div>

      <div
        className="flex items-center justify-between gap-3 px-4 py-4 text-primary-foreground"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={prev}
          aria-label="Previous image"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="flex-1 text-center text-sm">{img.label}</p>
        <button
          type="button"
          onClick={next}
          aria-label="Next image"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function GallerySection({ profile }: P) {
  const [active, setActive] = useState<"all" | GalleryCategory>("all");
  const [showAll, setShowAll] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const items = useMemo(
    () => profile.gallery.filter((g) => active === "all" || g.category === active),
    [profile.gallery, active],
  );
  const mobileItems = showAll ? items : items.slice(0, 6);

  // Phase 3G.1 §23 — optional section, omitted entirely when empty rather
  // than showing filter chips with nothing to filter (same convention
  // already used by Reviews/Videos/Service Areas below).
  if (profile.gallery.length === 0) return null;

  return (
    <section id="gallery" className="py-14 sm:py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Gallery"
          title="Recent work"
          sub="Bridal, engagement and party looks photographed on real clients."
        />

        <div className="-mx-5 mt-6 flex snap-x gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:mt-8 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
          {galleryFilters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setActive(f.id);
                setShowAll(false);
              }}
              aria-pressed={active === f.id}
              className={cn(
                "min-h-11 shrink-0 rounded-full border px-4 py-2 text-[14px] tracking-wide whitespace-nowrap transition-colors sm:text-[13px]",
                active === f.id
                  ? "border-primary/30 bg-primary text-primary-foreground shadow-soft"
                  : "border-rose-gold/30 bg-card/50 text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Mobile mosaic */}
        <div className="mt-6 grid grid-cols-2 gap-2 sm:hidden">
          {mobileItems.map((img, i) => {
            const wide = i === 0 || i === 3;
            return (
              <button
                key={`${img.label}-m-${i}`}
                type="button"
                onClick={() => setLightbox(items.indexOf(img))}
                aria-label={`Open ${img.label} in full screen`}
                className={cn(
                  "overflow-hidden rounded-2xl border border-border bg-card shadow-soft",
                  wide && "col-span-2",
                )}
              >
                <img
                  src={img.src}
                  alt={img.alt ?? imageAlt(profile, img.label)}
                  loading={i < 2 ? "eager" : "lazy"}
                  decoding="async"
                  width={900}
                  height={900}
                  className={cn(
                    "w-full object-cover object-top",
                    wide ? "aspect-[4/3]" : "aspect-square",
                  )}
                />
              </button>
            );
          })}
        </div>

        {items.length > 6 && (
          <Button
            variant="softline"
            className="mt-4 w-full sm:hidden"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show less" : `View all work (${items.length})`}
          </Button>
        )}

        {/* Desktop grid — unchanged */}
        <div className="mt-8 hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
          {items.map((img, i) => (
            <figure
              key={`${img.label}-${i}`}
              className={cn(
                "animate-in fade-in overflow-hidden rounded-2xl border border-border bg-card shadow-soft duration-500",
                i === 0 && items.length > 3 && "sm:col-span-2 sm:row-span-2",
              )}
            >
              <img
                src={img.src}
                alt={img.alt ?? imageAlt(profile, img.label)}
                title={img.label}
                loading="lazy"
                decoding="async"
                width={900}
                height={900}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
              />
              <figcaption className="sr-only">{img.alt ?? imageAlt(profile, img.label)}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      {lightbox !== null && (
        <Lightbox
          profile={profile}
          items={items}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  );
}

/* 5. BEFORE & AFTER */
function BeforeAfter({
  profile,
  item,
}: {
  profile: BeauticianProfile;
  item: BeauticianProfile["transformations"][number];
}) {
  const [pos, setPos] = useState(50);
  return (
    <figure className="h-full overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <div className="relative aspect-[4/5] w-full select-none">
        <img
          src={item.before}
          alt={item.beforeAlt ?? imageAlt(profile, `Natural look before ${item.service}`)}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img
            src={item.after}
            alt={item.afterAlt ?? imageAlt(profile, `Finished ${item.service} look`)}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-top"
            style={{ width: "100%", minWidth: "100%" }}
          />
        </div>
        <span className="absolute top-3 left-3 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-semibold tracking-widest uppercase">
          After
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-plum-deep/70 px-2.5 py-1 text-[11px] font-semibold tracking-widest text-primary-foreground uppercase">
          Before
        </span>
        <span
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-card"
          style={{ left: `${pos}%` }}
          aria-hidden="true"
        />
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`Reveal the ${item.service} transformation`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="flex items-center justify-between gap-3 p-4">
        <span className="text-sm font-semibold">{item.service}</span>
        <span className="text-xs text-muted-foreground">{item.occasion}</span>
      </figcaption>
    </figure>
  );
}

export function TransformationsSection({ profile }: P) {
  const ref = useRef<HTMLDivElement>(null);
  const index = useScrollIndex(ref, profile.transformations.length);
  // Phase 3G.1 §23 — optional section, omitted entirely when empty.
  if (profile.transformations.length === 0) return null;
  return (
    <section id="transformations" className="bg-gradient-soft py-14 sm:py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Before & after"
          title="Bridal transformations"
          sub="Drag each image to see the transformation from natural look to the finished bridal look."
        />
        <div
          ref={ref}
          className="-mx-5 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0 md:mt-10 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible"
        >
          {profile.transformations.map((t) => (
            <div
              key={t.service + t.occasion}
              className="w-[85vw] shrink-0 snap-center sm:w-[60vw] md:w-auto"
            >
              <BeforeAfter profile={profile} item={t} />
            </div>
          ))}
        </div>
        <Dots count={profile.transformations.length} active={index} />
      </div>
    </section>
  );
}

/* 6. SERVICES — accordion on mobile, grid on desktop */
function ServiceRow({
  profile,
  s,
}: {
  profile: BeauticianProfile;
  s: BeauticianProfile["serviceGroups"][number]["items"][number];
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/70 py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">
          {s.slug ? (
            <a href={`/portfolio/${profile.slug}/services/${s.slug}`} className="hover:underline">
              {s.name}
            </a>
          ) : (
            s.name
          )}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{s.detail}</p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {s.duration}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="font-display text-[16px] font-semibold whitespace-nowrap text-primary">
          {s.price}
        </span>
        <a
          href={waLink(
            profile,
            `Hi ${profile.name.split(" ")[0]}, I'd like to enquire about ${s.name}.`,
          )}
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            trackWhatsappClick(profile, CtaLocation.ServiceCard, { service_name: s.name })
          }
          className="inline-flex min-h-9 items-center rounded-full border border-rose-gold/40 px-3 text-[13px] font-semibold text-primary"
        >
          Enquire
        </a>
      </div>
    </div>
  );
}

export function ServicesSection({ profile }: P) {
  const [open, setOpen] = useState<string | null>(profile.serviceGroups[0]?.group ?? null);
  return (
    <section id="services" className="py-14 sm:py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Services"
          title="What I offer"
          sub="Clear, upfront pricing for every service."
        />

        {/* Mobile accordion */}
        <div className="mt-8 space-y-3 md:hidden">
          {profile.serviceGroups.map((group) => {
            const isOpen = open === group.group;
            return (
              <div
                key={group.group}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : group.group)}
                  aria-expanded={isOpen}
                  className="flex min-h-14 w-full items-center justify-between gap-4 px-4 text-left"
                >
                  <span className="text-[15px] font-semibold tracking-wide uppercase">
                    {group.group}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-primary transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="animate-in fade-in slide-in-from-top-1 px-4 pb-2 duration-200">
                    {group.items.map((s) => (
                      <ServiceRow key={s.name} profile={profile} s={s} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop — unchanged */}
        <div className="mt-10 hidden space-y-12 md:block">
          {profile.serviceGroups.map((group) => (
            <div key={group.group}>
              <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                {group.group}
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((s) => (
                  <article
                    key={s.name}
                    className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h4 className="text-base font-semibold">
                        {s.slug ? (
                          <a
                            href={`/portfolio/${profile.slug}/services/${s.slug}`}
                            className="hover:underline"
                          >
                            {s.name}
                          </a>
                        ) : (
                          s.name
                        )}
                      </h4>
                      <span className="font-display text-lg font-semibold whitespace-nowrap text-primary">
                        {s.price}
                      </span>
                    </div>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {s.duration}
                    </p>
                    <p className="mt-3 flex-1 text-sm text-muted-foreground">{s.detail}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button variant="softline" size="sm" asChild>
                        <a
                          href={waLink(
                            profile,
                            `Hi ${profile.name.split(" ")[0]}, I'd like to enquire about ${s.name}.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() =>
                            trackWhatsappClick(profile, CtaLocation.ServiceCard, {
                              service_name: s.name,
                            })
                          }
                        >
                          Enquire
                        </a>
                      </Button>
                      {s.slug && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/portfolio/${profile.slug}/services/${s.slug}`}>View service</a>
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 7. PACKAGES */
export function PackagesSection({ profile }: P) {
  const ref = useRef<HTMLDivElement>(null);
  const index = useScrollIndex(ref, profile.packages.length);
  // Phase 3G.1 §23 — optional section, omitted entirely when empty.
  if (profile.packages.length === 0) return null;
  return (
    <section id="packages" className="bg-gradient-soft py-14 sm:py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Packages"
          title="Wedding packages"
          sub="Bundled functions at a better rate than booking each look separately."
        />
        <div
          ref={ref}
          className="-mx-5 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0 lg:mt-10 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible"
        >
          {profile.packages.map((p) => (
            <article
              key={p.name}
              className={cn(
                "flex w-[85vw] shrink-0 snap-center flex-col rounded-3xl border p-6 shadow-soft sm:w-[60vw] sm:p-7 lg:w-auto",
                p.featured
                  ? "border-primary/30 bg-card shadow-lift ring-1 ring-primary/10"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.featured && (
                  <span className="bg-gradient-brand rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                    {p.note}
                  </span>
                )}
              </div>
              <p className="mt-3 font-display text-3xl font-semibold text-primary">{p.price}</p>
              {!p.featured && <p className="text-xs text-muted-foreground">{p.note}</p>}
              <p className="mt-4 text-[13px] tracking-wide text-muted-foreground">
                <span className="font-semibold text-foreground">Best for:</span> {p.bestFor}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-[14px] text-muted-foreground sm:text-sm">
                {p.includes.map((i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {i}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col gap-2">
                <Button variant={p.featured ? "hero" : "plum"} asChild>
                  <a
                    href="#availability"
                    onClick={() =>
                      trackAvailabilityCtaClick(profile, CtaLocation.PackageCard, {
                        package_name: p.name,
                      })
                    }
                  >
                    Check availability
                  </a>
                </Button>
                <Button variant="softline" asChild>
                  <a
                    href={waLink(
                      profile,
                      `Hi ${profile.name.split(" ")[0]}, I'd like to enquire about the ${p.name}.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      trackWhatsappClick(profile, CtaLocation.PackageCard, {
                        package_name: p.name,
                      })
                    }
                  >
                    Enquire on WhatsApp
                  </a>
                </Button>
              </div>
            </article>
          ))}
        </div>
        <Dots count={profile.packages.length} active={index} />
      </div>
    </section>
  );
}

/* 8. REVIEWS */
export function ReviewsSection({ profile }: P) {
  const ref = useRef<HTMLDivElement>(null);
  const index = useScrollIndex(ref, profile.reviews.length);
  // No published reviews yet — don't show a fabricated 0.0★/0 reviews
  // summary or an empty section (Phase 3F.3A §4), same convention already
  // used by VideosSection below for the equivalent empty state.
  if (profile.reviews.length === 0) return null;
  return (
    <section id="reviews" className="py-14 sm:py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Reviews"
          title="What clients say"
          sub="Reviews from brides and families across Gujarat."
        />
        <div className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-6 rounded-2xl border border-border bg-card px-6 py-5 shadow-soft sm:mt-8">
          <div className="text-center">
            <p className="font-display text-4xl font-semibold text-primary">{profile.rating}</p>
            <p className="text-xs text-muted-foreground">out of 5</p>
          </div>
          <div className="h-10 w-px bg-border" aria-hidden="true" />
          <div>
            <Stars />
            <p className="mt-1 text-sm text-muted-foreground">{profile.reviewCount} reviews</p>
          </div>
        </div>

        <div
          ref={ref}
          className="-mx-5 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0 md:mt-10 md:grid md:grid-cols-2 md:overflow-visible"
        >
          {profile.reviews.map((r) => (
            <blockquote
              key={r.name}
              className="w-[85vw] shrink-0 snap-center rounded-2xl border border-border bg-card p-5 shadow-soft sm:w-[60vw] sm:p-6 md:w-auto"
            >
              <div className="flex items-center justify-between gap-3">
                <Stars count={r.rating} />
                {r.verified && (
                  <span className="inline-flex items-center gap-1 text-[11px] tracking-wide text-muted-foreground">
                    <Check className="h-3 w-3 text-primary" aria-hidden="true" /> Verified client
                  </span>
                )}
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                “{r.text}”
              </p>
              <footer className="mt-4 text-sm font-semibold">
                {r.name}
                <span className="ml-2 font-normal text-muted-foreground">{r.event}</span>
                {r.date && (
                  <span className="ml-2 font-normal text-muted-foreground">· {r.date}</span>
                )}
              </footer>
            </blockquote>
          ))}
        </div>
        <Dots count={profile.reviews.length} active={index} />
      </div>
    </section>
  );
}

/* 9. VIDEOS */
function VideoPlayerModal({
  profile,
  items,
  index,
  onClose,
  onIndex,
}: {
  profile: BeauticianProfile;
  items: BeauticianProfile["videos"];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const touchX = useRef<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const next = useCallback(
    () => onIndex((index + 1) % items.length),
    [index, items.length, onIndex],
  );
  const prev = useCallback(
    () => onIndex((index - 1 + items.length) % items.length),
    [index, items.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [next, prev, onClose]);

  // Focus management: move focus into the dialog on open, return it to
  // whatever triggered the dialog (the thumbnail button) on close. Runs
  // once per mount/unmount only — index changes (Prev/Next) don't remount
  // this component, so this doesn't refight focus on every navigation.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  const video = items[index];
  if (!video) return null;

  const embed = getVideoEmbedSource({
    platform: video.platform,
    videoUrl: video.videoUrl,
  });

  // Sizing intentionally differs per source so nothing is cropped or
  // stretched: YouTube keeps its native 16:9, an uploaded file keeps its
  // own intrinsic dimensions, and Instagram's embed keeps a portrait
  // container sized for its own naturally-portrait reel widget rather than
  // being forced into a one-size-fits-all box.
  const mediaContainerClass =
    embed?.type === "iframe" && video.platform === "youtube"
      ? "aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-black"
      : embed?.type === "iframe" && video.platform === "instagram"
        ? "aspect-[9/16] w-full max-w-[380px] overflow-hidden rounded-2xl bg-black"
        : embed?.type === "iframe"
          ? "aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-black"
          : "max-w-sm overflow-hidden rounded-2xl bg-black";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Video player"
      className="fixed inset-0 z-[60] flex flex-col bg-plum-deep/95 backdrop-blur-sm"
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        if (Math.abs(end - start) > 45) (end < start ? next : prev)();
        touchX.current = null;
      }}
    >
      {/* Clicks anywhere in here must not bubble up and trigger the
          backdrop's onClose — this is what makes "click backdrop to close,
          click content to not close" work with a single shared handler. */}
      <div className="flex flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
        <div
          className="flex items-center justify-between px-4 py-3 text-primary-foreground"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <span className="text-sm font-semibold">
            {index + 1} / {items.length}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close video player"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center px-3">
          {embed?.type === "video" ? (
            <video
              key={embed.src}
              src={embed.src}
              poster={video.thumb}
              controls
              autoPlay
              playsInline
              className="max-h-[75vh] max-w-full rounded-2xl bg-black"
            />
          ) : (
            <div className={mediaContainerClass}>
              {embed?.type === "iframe" && (
                <iframe
                  key={embed.src}
                  src={embed.src}
                  title={video.title}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
              {(embed?.type === "link" || embed == null) && (
                <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-4 p-6 text-center text-primary-foreground">
                  <img
                    src={video.thumb}
                    alt={video.thumbnailAlt ?? imageAlt(profile, video.title)}
                    className="max-h-[50%] rounded-xl object-cover"
                  />
                  <p className="text-sm text-white/80">This video can't be played inline here.</p>
                  {embed?.type === "link" && (
                    <a
                      href={embed.src}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center rounded-full bg-card px-5 text-sm font-semibold text-foreground"
                    >
                      Watch on original site
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between gap-3 px-4 py-4 text-primary-foreground"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={prev}
            aria-label="Previous video"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <p className="flex-1 text-center text-sm">{video.title}</p>
          <button
            type="button"
            onClick={next}
            aria-label="Next video"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function VideosSection({ profile }: P) {
  const ref = useRef<HTMLDivElement>(null);
  const index = useScrollIndex(ref, profile.videos.length);
  const [player, setPlayer] = useState<number | null>(null);

  if (profile.videos.length === 0) return null;

  return (
    <section id="videos" className="bg-gradient-soft py-14 sm:py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Videos"
          title="Transformations on camera"
          sub="Short reels showing the full process from prep to final look."
        />
        <div
          ref={ref}
          className="-mx-5 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0 md:mt-10 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible"
        >
          {profile.videos.map((v, i) => (
            <article
              key={v.title + i}
              className="w-[60vw] shrink-0 snap-center overflow-hidden rounded-2xl border border-border bg-card shadow-soft sm:w-[40vw] md:w-auto"
            >
              <button
                type="button"
                onClick={() => setPlayer(i)}
                aria-label={`Play ${v.title}`}
                className="relative block w-full"
              >
                <img
                  src={v.thumb}
                  alt={v.thumbnailAlt ?? imageAlt(profile, v.title)}
                  loading="lazy"
                  decoding="async"
                  width={506}
                  height={900}
                  className="aspect-[9/16] w-full object-cover object-top"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-plum-deep/35">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-card/90 md:h-12 md:w-12">
                    <Play className="h-5 w-5 fill-current text-primary" aria-hidden="true" />
                  </span>
                </span>
                <span className="absolute right-2 bottom-2 rounded bg-plum-deep/80 px-1.5 py-0.5 text-[11px] text-primary-foreground">
                  {v.length}
                </span>
              </button>
              <div className="p-4">
                <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
                  {v.category}
                </p>
                <p className="mt-1 text-[15px] font-semibold sm:text-sm">{v.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground sm:text-xs">
                  {v.blurb}
                </p>
              </div>
            </article>
          ))}
        </div>
        <Dots count={profile.videos.length} active={index} />
      </div>

      {player !== null && (
        <VideoPlayerModal
          profile={profile}
          items={profile.videos}
          index={player}
          onIndex={setPlayer}
          onClose={() => setPlayer(null)}
        />
      )}
    </section>
  );
}

/* 10. SERVICE AREAS */
function buildAreasServedSentence(profile: BeauticianProfile): string {
  const areas = profile.areas;
  const service = profile.role
    .replace(/\b(artist|specialist|stylist|expert)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (areas.length === 0) return "";
  if (areas.length === 1) {
    return `${profile.name} provides ${service} services in ${areas[0]}, ${profile.primaryCity}.`;
  }
  const shown = areas.slice(0, 3);
  const list =
    shown.length === 2
      ? shown.join(" and ")
      : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return areas.length > 3
    ? `${profile.name} provides ${service} services in ${list} and other areas of ${profile.primaryCity}.`
    : `${profile.name} provides ${service} services in ${list}, ${profile.primaryCity}.`;
}

export function ServiceAreasSection({ profile }: P) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? profile.areas : profile.areas.slice(0, 6);
  // Service areas are optional — don't render an empty section on the public
  // page when the beautician hasn't configured any yet.
  if (profile.areas.length === 0) return null;
  return (
    <section id="areas" className="py-14 sm:py-20">
      <div className="section-shell grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
        <div>
          <SectionHead eyebrow="Local" title="Areas I serve" center={false} />
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:mt-5 sm:text-base">
            {buildAreasServedSentence(profile)}
          </p>
          <p className="mt-5 text-xs font-semibold tracking-widest text-muted-foreground uppercase sm:mt-6">
            Primary city
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-primary">
            {profile.primaryCity}, {profile.region}
          </p>
        </div>

        {/* Mobile chips */}
        <div className="sm:hidden">
          <ul className="flex flex-wrap gap-2">
            {visible.map((a) => (
              <li
                key={a}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-gold/30 bg-card px-3.5 py-2 text-[14px] shadow-soft"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /> {a}
              </li>
            ))}
          </ul>
          {profile.areas.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 inline-flex min-h-11 items-center text-[15px] font-semibold text-primary"
            >
              {showAll ? "Show fewer areas" : "View all areas"}
            </button>
          )}
        </div>

        {/* Desktop — unchanged */}
        <ul className="hidden gap-3 sm:grid sm:grid-cols-3">
          {profile.areas.map((a) => (
            <li
              key={a}
              className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-soft"
            >
              <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {a}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* 11. AVAILABILITY + CONTACT + MAP */
type AvailabilityEligibility = "ok" | "too-soon" | "too-far" | "blocked" | null;

function computeAvailabilityEligibility(
  dateStr: string,
  availability: BeauticianProfile["availability"],
): AvailabilityEligibility {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  if (availability.blockedDates.includes(dateStr)) return "blocked";
  const now = new Date();
  if (availability.minimumNoticeHours != null) {
    const minDate = new Date(now.getTime() + availability.minimumNoticeHours * 60 * 60 * 1000);
    if (target < minDate) return "too-soon";
  }
  if (availability.advanceBookingDays != null) {
    const maxDate = new Date(now.getTime() + availability.advanceBookingDays * 24 * 60 * 60 * 1000);
    if (target > maxDate) return "too-far";
  }
  return "ok";
}

const ELIGIBILITY_MESSAGE: Record<Exclude<AvailabilityEligibility, null>, string> = {
  ok: "This date looks available to request.",
  blocked: "This date isn't usually available — you can still send a request.",
  "too-soon": "That's short notice — I'll do my best to get back to you quickly.",
  "too-far": "That's further ahead than I usually plan — I'll confirm as soon as I can.",
};

export function AvailabilitySection({
  profile,
  initialService,
}: P & {
  /** Pre-selects the Service dropdown when arriving from a service
   * landing page's "Check availability" CTA (Phase 3F.6 §8/§9) — carries
   * only the service name via a URL search param, no schema change. */
  initialService?: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [service, setService] = useState(initialService ?? "");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 3G.3 §13/§25 — fires availability_form_start at most once per
  // form instance, on the visitor's first genuine field interaction (not
  // merely because the form rendered).
  const formStartedRef = useRef(false);
  const markFormStarted = () => {
    if (formStartedRef.current) return;
    formStartedRef.current = true;
    trackEvent(AnalyticsEvent.AvailabilityFormStart, {
      profile_slug: profile.slug,
      page_path: `/portfolio/${profile.slug}`,
    });
  };

  const allServiceItems = profile.serviceGroups.flatMap((g) => g.items);
  const allServices = allServiceItems.map((i) => i.name);
  const acceptingBookings = profile.availability.acceptingBookings;
  const eligibility = computeAvailabilityEligibility(date, profile.availability);

  // Advisory only — a location outside the listed service areas should never
  // block or discourage a request, since areas served isn't an exhaustive
  // guarantee of where the beautician can travel.
  const locationMatchesArea =
    location.trim().length > 0 &&
    profile.areas.length > 0 &&
    profile.areas.some(
      (a) =>
        a.toLowerCase().includes(location.trim().toLowerCase()) ||
        location.trim().toLowerCase().includes(a.toLowerCase()),
    );

  const enquiry = waLink(
    profile,
    `Hi ${profile.name.split(" ")[0]}, I'd like to check your availability.\nDate: ${
      date || "—"
    }\nService: ${service || "—"}\nLocation: ${location || "—"}`,
  );

  const field =
    "mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3.5 text-[15px] outline-none focus:border-primary/40 sm:min-h-0 sm:py-2.5 sm:text-sm";

  return (
    <section id="availability" className="bg-gradient-soft py-14 sm:py-20">
      <div className="section-shell grid gap-8 lg:grid-cols-2">
        <div>
          <SectionHead
            eyebrow="Availability"
            title="Check availability"
            sub={`Planning your wedding? Check whether ${profile.name.split(" ")[0]} is available for your date.`}
            center={false}
          />

          {sent ? (
            // Phase 3G.1 §5/§31 — the form previously stayed on screen
            // (fields + submit button both still active) after a successful
            // send, so nothing prevented an accidental duplicate submission.
            // Replacing it with a distinct success state removes that
            // possibility entirely and gives a clear next action.
            <div className="mt-6 space-y-4 rounded-3xl border border-primary/20 bg-card p-5 shadow-soft sm:mt-8 sm:p-6">
              <p role="status" className="rounded-xl bg-secondary/60 px-4 py-3 text-sm">
                <strong className="block font-semibold">Availability request sent</strong>
                Thank you. {profile.name.split(" ")[0]} will contact you to confirm availability and
                booking details. This is a request, not a confirmed booking.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="softline" size="lg" asChild className="sm:flex-1">
                  <a
                    href={enquiry}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackWhatsappClick(profile, CtaLocation.AvailabilitySection)}
                  >
                    <MessageCircle aria-hidden="true" /> WhatsApp
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="sm:flex-1"
                  onClick={() => {
                    setSent(false);
                    setName("");
                    setPhone("");
                    setDate("");
                    setService(initialService ?? "");
                    setLocation("");
                    setMessage("");
                  }}
                >
                  Send another request
                </Button>
              </div>
            </div>
          ) : !acceptingBookings ? (
            <div className="mt-6 space-y-4 rounded-3xl border border-border bg-card p-5 shadow-soft sm:mt-8 sm:p-6">
              <p
                role="status"
                className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm"
              >
                Currently not accepting new booking requests. You're welcome to reach out directly
                and {profile.name.split(" ")[0]} will let you know when availability opens up.
              </p>
              <Button variant="softline" size="lg" asChild className="w-full">
                <a
                  href={waLink(profile)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackWhatsappClick(profile, CtaLocation.AvailabilitySection)}
                >
                  <MessageCircle aria-hidden="true" /> WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <form
              className="mt-6 space-y-4 rounded-3xl border border-border bg-card p-5 shadow-soft sm:mt-8 sm:p-6"
              onChangeCapture={markFormStarted}
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                // Phase 3G.3 §13 — represents a genuine submit attempt,
                // regardless of whether client validation then blocks it.
                trackEvent(AnalyticsEvent.AvailabilityFormSubmit, {
                  profile_slug: profile.slug,
                  page_path: `/portfolio/${profile.slug}`,
                });
                // Phase 3G.1A §2/§3 — friendly client-side check; submit_lead()
                // enforces the authoritative version of this same rule
                // server-side regardless of what happens here.
                if (!isValidPhone(phone)) {
                  setError("Enter a valid phone number.");
                  return;
                }
                setSubmitting(true);
                // Real service_id when the selected name resolves to one of
                // this profile's actual services — gives leads a genuine
                // relational link (leads.service_id) instead of only the
                // free-text _service_requested name (Phase 3F.6 §9).
                const matchedService = allServiceItems.find((i) => i.name === service);
                // Phase 3G.3A §9/§13/§14/§17/§18 — reads the session
                // attribution snapshot captured on landing (or the last
                // recognized-campaign touch) and this profile's most
                // recently clicked CTA; falls back to availability_section
                // when no tracked CTA preceded this submission, never
                // inventing one. "portfolio" replaces the legacy
                // "availability_request" value here to match the single
                // canonical LEAD_SOURCES vocabulary already used everywhere
                // else in the CRM (audited — see the phase report).
                const attribution = getAttributionSnapshot(profile.slug);
                const conversionPath = getConversionPath() || `/portfolio/${profile.slug}`;
                const ctaLocation = attribution.cta_location ?? CtaLocation.AvailabilitySection;
                const { error: rpcError } = await submitPortfolioLeadFn({
                  data: {
                    _slug: profile.slug,
                    _name: name,
                    _phone: phone,
                    _location: location,
                    _source: "portfolio",
                    ...(date ? { _event_date: date } : {}),
                    ...(service ? { _service_requested: service } : {}),
                    ...(matchedService?.id ? { _service_id: matchedService.id } : {}),
                    ...(message.trim() ? { _message: message.trim() } : {}),
                    ...(attribution.utm_source ? { _utm_source: attribution.utm_source } : {}),
                    ...(attribution.utm_medium ? { _utm_medium: attribution.utm_medium } : {}),
                    ...(attribution.utm_campaign
                      ? { _utm_campaign: attribution.utm_campaign }
                      : {}),
                    ...(attribution.utm_content ? { _utm_content: attribution.utm_content } : {}),
                    ...(attribution.utm_term ? { _utm_term: attribution.utm_term } : {}),
                    ...(attribution.landing_path
                      ? { _landing_path: attribution.landing_path }
                      : {}),
                    _conversion_path: conversionPath,
                    ...(attribution.referrer_host
                      ? { _referrer_host: attribution.referrer_host }
                      : {}),
                    _cta_location: ctaLocation,
                  },
                });
                setSubmitting(false);
                if (rpcError) {
                  setError(
                    "Something went wrong sending your request — please try WhatsApp instead.",
                  );
                  return;
                }
                // Phase 3G.3 §13/§14, Phase 3G.3A §29 — fired ONLY after the
                // server authoritatively confirms the enquiry was created;
                // never on validation failure, never optimistically before
                // this point. No PII: service/profile identifiers and the
                // same non-PII attribution context now persisted to the
                // database, never name/phone/message/location text (§9/§14).
                trackEvent(AnalyticsEvent.AvailabilityFormSuccess, {
                  profile_slug: profile.slug,
                  page_path: `/portfolio/${profile.slug}`,
                  service_id: matchedService?.id,
                  service_name: service || undefined,
                  event_date_present: !!date,
                  lead_source: "portfolio",
                  cta_location: ctaLocation,
                  utm_source: attribution.utm_source,
                  utm_medium: attribution.utm_medium,
                  utm_campaign: attribution.utm_campaign,
                });
                // Per-portfolio GTM phase — the canonical marketing-conversion
                // event, same trigger point and same non-PII payload as
                // availability_form_success above (never name/phone/message/
                // location — see that event's own note). Additive: does not
                // replace the existing internal product event.
                trackEvent(AnalyticsEvent.LeadSubmit, {
                  profile_slug: profile.slug,
                  page_path: `/portfolio/${profile.slug}`,
                  service_id: matchedService?.id,
                  service_name: service || undefined,
                  event_date_present: !!date,
                  lead_source: "portfolio",
                  cta_location: ctaLocation,
                  utm_source: attribution.utm_source,
                  utm_medium: attribution.utm_medium,
                  utm_campaign: attribution.utm_campaign,
                });
                setSent(true);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                    Your name
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className={field}
                  />
                </label>
                <label className="text-sm">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                    Phone number
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className={field}
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                    Event date
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className={field}
                  />
                  {eligibility && (
                    <p
                      className={cn(
                        "mt-1.5 text-xs",
                        eligibility === "ok" ? "text-emerald-600" : "text-amber-600",
                      )}
                    >
                      {ELIGIBILITY_MESSAGE[eligibility]}
                    </p>
                  )}
                </label>
                <label className="text-sm">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                    Service
                  </span>
                  <select
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    required
                    className={field}
                  >
                    <option value="">Select a service</option>
                    {allServices.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  Location
                </span>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={`Venue or area in ${profile.primaryCity}`}
                  required
                  className={field}
                />
                {location.trim().length > 0 && profile.areas.length > 0 && (
                  <p
                    role="status"
                    className={cn(
                      "mt-1.5 text-xs",
                      locationMatchesArea ? "text-emerald-600" : "text-muted-foreground",
                    )}
                  >
                    {locationMatchesArea
                      ? `Good news — this looks like an area ${profile.name.split(" ")[0]} serves.`
                      : `This isn't one of the areas ${profile.name.split(" ")[0]} usually lists, but you're welcome to ask — availability may still be possible.`}
                  </p>
                )}
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  Message (optional)
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Anything else you'd like to share…"
                  rows={3}
                  className={cn(field, "min-h-20 resize-none py-2.5")}
                />
              </label>

              <p className="text-xs text-muted-foreground">
                By submitting this enquiry, you agree that your information may be shared with this
                professional so they can respond to your request. See our{" "}
                <Link to="/privacy" className="font-medium text-primary underline">
                  Privacy Policy
                </Link>
                .
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="sm:flex-1"
                  disabled={submitting}
                >
                  <Calendar aria-hidden="true" /> {submitting ? "Sending…" : "Check availability"}
                </Button>
                <Button variant="softline" size="lg" asChild className="sm:flex-1">
                  <a href={enquiry} target="_blank" rel="noreferrer">
                    <MessageCircle aria-hidden="true" /> WhatsApp
                  </a>
                </Button>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
            </form>
          )}
        </div>

        <div id="contact">
          <ul className="space-y-3 text-[15px] sm:text-sm lg:mt-[4.5rem]">
            {[
              {
                id: "phone",
                icon: Phone,
                label: profile.phone,
                href: telLink(profile),
                onClick: () => trackPhoneClick(profile, CtaLocation.ContactSection),
              },
              { id: "email", icon: Mail, label: profile.email, href: `mailto:${profile.email}` },
              { id: "studio", icon: MapPin, label: profile.studio },
              { id: "hours", icon: Clock, label: profile.hours },
            ].map(({ id, icon: Icon, label, href, onClick }) => (
              <li
                key={id}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-soft"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {href ? (
                  <a href={href} onClick={onClick} className="hover:text-primary">
                    {label}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{label}</span>
                )}
              </li>
            ))}
          </ul>

          <div
            id="location"
            className="mt-4 overflow-hidden rounded-3xl border border-border shadow-lift"
          >
            <iframe
              title={`Map showing ${profile.name}'s studio in ${profile.primaryCity}`}
              src={resolveMapEmbedSrc(profile.mapQuery)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[240px] w-full border-0 sm:h-[320px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* 12. FAQ */
export function FaqSection({ profile }: P) {
  const [open, setOpen] = useState<number | null>(0);
  // Phase 3G.1 §23 — optional section, omitted entirely when empty.
  if (profile.faqs.length === 0) return null;
  return (
    <section id="faq" className="py-14 sm:py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="FAQ"
          title="Frequently asked questions"
          sub={`Pricing, travel and booking questions brides ask ${profile.name.split(" ")[0]} most often.`}
        />
        <div className="mx-auto mt-8 max-w-3xl space-y-3 sm:mt-10">
          {profile.faqs.map((f, i) => (
            <div key={f.q} className="rounded-2xl border border-border bg-card shadow-soft">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left text-[15px] font-semibold sm:min-h-0 sm:px-5 sm:py-4 sm:text-sm"
              >
                {f.q}
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-primary transition-transform duration-200 sm:h-4 sm:w-4",
                    open === i && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
              {open === i && (
                <p className="animate-in fade-in slide-in-from-top-1 px-4 pb-5 text-[15px] leading-relaxed text-muted-foreground duration-200 sm:px-5 sm:text-sm">
                  {f.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 13. FINAL CTA */
export function FinalCtaSection({ profile }: P) {
  return (
    <section className="bg-gradient-soft bg-beauty-bloom overflow-x-clip py-12 sm:py-20">
      <div className="section-shell">
        <div className="brand-arc relative mx-auto max-w-3xl rounded-3xl border border-border bg-card px-5 py-8 text-center text-primary shadow-lift sm:px-8 sm:py-12">
          <h2 className="font-display text-[26px] leading-tight font-semibold sm:text-4xl">
            Ready to plan your bridal look?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Check availability and connect directly with {profile.name.split(" ")[0]} for your
            wedding date.
          </p>
          <div className="mt-6 grid gap-2.5 sm:mt-8 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
            <Button variant="hero" size="lg" className="w-full sm:w-auto" asChild>
              <a
                href="#availability"
                onClick={() => trackAvailabilityCtaClick(profile, CtaLocation.FinalCta)}
              >
                <Calendar aria-hidden="true" /> Check availability
              </a>
            </Button>
            <Button variant="softline" size="lg" className="w-full sm:w-auto" asChild>
              <a
                href={waLink(profile)}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackWhatsappClick(profile, CtaLocation.FinalCta)}
              >
                <MessageCircle aria-hidden="true" /> WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* 14. MOBILE STICKY CTA — Premium floating booking bar */
export function MobileStickyCta({ profile }: P) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:hidden"
      aria-label="Mobile booking actions"
    >
      <div className="flex items-center gap-2 rounded-[18px] border border-[rgba(40,20,40,0.08)] bg-white/96 p-2.5 shadow-[0_4px_24px_-8px_rgba(40,20,40,0.18)] backdrop-blur-md">
        <a
          href={waLink(profile)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Contact ${profile.name} on WhatsApp`}
          onClick={() => trackWhatsappClick(profile, CtaLocation.MobileSticky)}
          className="flex h-12 shrink-0 flex-[0_0_22%] min-w-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-[rgba(40,20,40,0.08)] bg-white text-[11px] font-semibold leading-tight text-foreground transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          <MessageCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          WhatsApp
        </a>
        <a
          href={telLink(profile)}
          aria-label={`Call ${profile.name}`}
          onClick={() => trackPhoneClick(profile, CtaLocation.MobileSticky)}
          className="flex h-12 shrink-0 flex-[0_0_20%] min-w-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-[rgba(40,20,40,0.08)] bg-white text-[11px] font-semibold leading-tight text-foreground transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          <Phone className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          Call
        </a>
        <a
          href="#availability"
          aria-label={`Check ${profile.name}'s availability`}
          onClick={() => trackAvailabilityCtaClick(profile, CtaLocation.MobileSticky)}
          className="flex h-13 flex-1 min-w-0 items-center justify-center gap-2 rounded-[15px] bg-gradient-to-r from-[#D94F78] to-[#5B176E] px-3 text-center text-[15px] font-semibold leading-tight text-white shadow-[0_4px_18px_-6px_rgba(91,23,110,0.45)] transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          <Calendar className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">Check availability</span>
        </a>
      </div>
    </div>
  );
}

/* 15. DESKTOP WHATSAPP FLOATING BUTTON */
export function WhatsAppButton({ profile }: P) {
  return (
    <a
      href={waLink(profile)}
      target="_blank"
      rel="noreferrer"
      aria-label={`Chat with ${profile.name} on WhatsApp`}
      onClick={() => trackWhatsappClick(profile, CtaLocation.FloatingWhatsapp)}
      className="bg-gradient-brand animate-pulse-ring fixed right-5 bottom-5 z-40 hidden items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-lift md:inline-flex"
    >
      <MessageCircle className="h-5 w-5" aria-hidden="true" />
      <span>WhatsApp</span>
    </a>
  );
}
