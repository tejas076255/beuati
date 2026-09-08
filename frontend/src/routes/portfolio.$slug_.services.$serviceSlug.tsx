import { useState } from "react";
import { Calendar, Check, MapPin, Menu, MessageCircle, X } from "lucide-react";
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site/site-footer";
import { formatPrice, resolveMediaUrl } from "@/data/portfolio-mapper";
import {
  AnalyticsEvent,
  CtaLocation,
  trackEvent,
  useTrackedPageView,
  type CtaLocationValue,
} from "@/lib/analytics";
import { recordCtaClick } from "@/lib/attribution";
import {
  buildGalleryImageAlt,
  buildBeforeAfterAlt,
  type MediaAltContext,
} from "@/lib/media-alt-text";
import {
  buildOfferPricing,
  buildOpeningHoursSpecification,
  buildServiceH1,
  buildServiceMetaDescription,
  buildServiceSeoTitle,
  computeAggregateRating,
  evaluateServiceIndexability,
  resolveServiceSlug,
} from "@/lib/seo-helpers";
import { absoluteUrl } from "@/lib/site-url";
import { safeJsonLd } from "@/lib/json-ld";
import type { ServicePageBundle } from "@/data/service-page-query.server";
import type { Tables } from "@/integrations/supabase/types";

type ServicePageLoaderResult = {
  bundle: ServicePageBundle;
};

// Read-only, server-side. Unpublished profile / inactive-or-deleted
// service / non-matching slug are all a genuine 404 — the same rule the
// main portfolio route uses for an unpublished profile. A merely
// low-content (noindex) service page is NOT 404'd here; that distinction
// is handled entirely by buildHead()'s robots directive below. Phase 3F.4
// §7/§28.
const loadServicePageData = createServerFn({ method: "GET" })
  .validator((data: { profileSlug: string; serviceSlug: string }) => data)
  .handler(async ({ data, request }): Promise<ServicePageLoaderResult | null> => {
    const { isFastApiConfigured, callApi, ApiError } = await import("@/lib/api-client.server");

    let bundle: ServicePageBundle;

    if (isFastApiConfigured()) {
      try {
        bundle = await callApi<ServicePageBundle>({
          path: `/api/portfolio/${encodeURIComponent(data.profileSlug)}/services/${encodeURIComponent(data.serviceSlug)}`,
          method: "GET",
          request: { request },
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    } else {
      // Direct Supabase fallback when FastAPI is not configured.
      const { getPublishedServicePage } = await import("@/data/service-page-query.server");
      const result = await getPublishedServicePage(data.profileSlug, data.serviceSlug);
      if (!result) return null;
      bundle = result;
    }

    return { bundle };
  });

function buildHead(bundle: ServicePageBundle) {
  const { profile, seo, service } = bundle;
  const professionalName = profile.display_name;
  const primaryCity = profile.primary_city;
  const serviceDescription = service.short_description ?? service.description;

  const portfolioPath = `/portfolio/${profile.slug}`;
  const portfolioUrl = absoluteUrl(portfolioPath);
  const servicePath = `${portfolioPath}/services/${resolveServiceSlug(service)}`;
  const pageUrl = absoluteUrl(servicePath);
  // Reuses the exact same @id strategy as the main portfolio page (Phase
  // 3F.3 §3) — this is the same Person/Business entity, not a new
  // competing one, so it must carry the same @id.
  const businessId = `${portfolioUrl}#business`;
  const personId = `${portfolioUrl}#person`;
  const serviceId = `${pageUrl}#service`;

  const seoInput = { serviceName: service.name, professionalName, primaryCity };
  const title = buildServiceSeoTitle(seoInput);
  const description = buildServiceMetaDescription(seoInput);

  const { indexable } = evaluateServiceIndexability({
    profileRobotsIndex: seo?.robots_index !== false,
    primaryCity,
    serviceDescription,
    hasPersistedSlug: !!service.slug,
  });
  const robotsContent = indexable ? "index, follow" : "noindex, follow";

  const areaNames = bundle.serviceAreas.map((a) => a.area_name ?? a.city);
  const openingHours = buildOpeningHoursSpecification(bundle.workingHours);
  const aggregateRating = computeAggregateRating(bundle.reviews.map((r) => ({ rating: r.rating })));

  const pricing = buildOfferPricing({
    price: service.price,
    priceType: service.price_type,
    currency: service.currency,
  });

  const altCtx: MediaAltContext = {
    professionalName,
    role: (profile.professional_title ?? "").trim() || "Beauty Professional",
    city: primaryCity,
  };

  const imageObjects = bundle.relatedGalleryImages
    .map((img) => {
      const src = resolveMediaUrl(img.public_url, img.storage_path);
      if (!src) return null;
      const alt = buildGalleryImageAlt(altCtx, {
        altText: img.alt_text,
        caption: img.caption,
        title: img.portfolio_items?.title ?? null,
        category: img.portfolio_items?.category ?? null,
      });
      return {
        "@type": "ImageObject",
        contentUrl: src,
        name: alt,
        caption: alt,
        creator: { "@id": personId },
      };
    })
    .filter((o): o is NonNullable<typeof o> => o != null);

  for (const item of bundle.relatedBeforeAfter) {
    const before = item.images.find((i) => i.image_type === "before");
    const after = item.images.find((i) => i.image_type === "after");
    const beforeSrc = before ? resolveMediaUrl(before.public_url, before.storage_path) : null;
    const afterSrc = after ? resolveMediaUrl(after.public_url, after.storage_path) : null;
    if (beforeSrc) {
      const alt = buildBeforeAfterAlt(altCtx, {
        side: "before",
        altText: before?.alt_text ?? null,
        title: item.title,
        eventType: item.event_type,
      });
      imageObjects.push({
        "@type": "ImageObject",
        contentUrl: beforeSrc,
        name: alt,
        caption: alt,
        creator: { "@id": personId },
      });
    }
    if (afterSrc) {
      const alt = buildBeforeAfterAlt(altCtx, {
        side: "after",
        altText: after?.alt_text ?? null,
        title: item.title,
        eventType: item.event_type,
      });
      imageObjects.push({
        "@type": "ImageObject",
        contentUrl: afterSrc,
        name: alt,
        caption: alt,
        creator: { "@id": personId },
      });
    }
  }

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: robotsContent },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: pageUrl },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: pageUrl }],
    scripts: [
      {
        type: "application/ld+json",
        // Debug-only reasons (not indexability itself) never render in
        // markup — this comment exists purely so `reasons` isn't flagged
        // as an unused destructure while keeping it available for the
        // dashboard eligibility list, which calls evaluateServiceIndexability
        // independently server-side.
        children: safeJsonLd({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": pageUrl,
              url: pageUrl,
              name: title,
              description,
              inLanguage: "en-IN",
              isPartOf: { "@id": businessId },
              mainEntity: { "@id": serviceId },
            },
            {
              "@type": "Service",
              "@id": serviceId,
              name: service.name,
              ...(serviceDescription ? { description: serviceDescription } : {}),
              provider: { "@id": businessId },
              url: pageUrl,
              ...(primaryCity ? { areaServed: primaryCity } : {}),
              ...(pricing ? { offers: { "@type": "Offer", ...pricing, url: pageUrl } } : {}),
            },
            {
              "@type": ["BeautySalon", "LocalBusiness"],
              "@id": businessId,
              name: profile.business_name || profile.display_name,
              url: portfolioUrl,
              telephone: profile.phone,
              email: profile.email,
              ...(openingHours.length > 0 ? { openingHoursSpecification: openingHours } : {}),
              address: {
                "@type": "PostalAddress",
                streetAddress: profile.address,
                addressLocality: profile.primary_city,
                addressRegion: profile.state,
                addressCountry: profile.country,
              },
              ...(areaNames.length > 0
                ? { areaServed: areaNames.map((a) => ({ "@type": "City", name: a })) }
                : {}),
              founder: { "@id": personId },
              ...(aggregateRating
                ? { aggregateRating: { "@type": "AggregateRating", ...aggregateRating } }
                : {}),
            },
            {
              "@type": "Person",
              "@id": personId,
              name: profile.display_name,
              jobTitle: profile.professional_title,
              url: portfolioUrl,
              worksFor: { "@id": businessId },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "BeautyFolio", item: absoluteUrl("/") },
                { "@type": "ListItem", position: 2, name: professionalName, item: portfolioUrl },
                // "Services" has no dedicated listing route on this
                // profile — no fake intermediate URL, per Phase 3F.4 §12.
                { "@type": "ListItem", position: 3, name: "Services" },
                { "@type": "ListItem", position: 4, name: service.name, item: pageUrl },
              ],
            },
            ...imageObjects,
          ],
        }),
      },
    ],
  };
}

export const Route = createFileRoute("/portfolio/$slug_/services/$serviceSlug")({
  loader: async ({ params }) => {
    const result = await loadServicePageData({
      data: { profileSlug: params.slug, serviceSlug: params.serviceSlug },
    });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    return buildHead(loaderData.bundle);
  },
  component: ServicePage,
});

// Real, already-stored appointment_type/travel_available only — never an
// unsupported claim (Phase 3F.6 §17). Internal config values are never
// exposed verbatim ("client_location") — always rephrased naturally.
function buildAppointmentTypeLabel(
  appointmentType: string | null,
  travelAvailable: boolean,
): string | null {
  if (appointmentType === "studio") return "Studio appointments available";
  if (appointmentType === "client_location") {
    return travelAvailable ? "Travel to client location available" : null;
  }
  if (appointmentType === "both") return "Studio & client-location appointments";
  return null;
}

// Identical labels/anchors to the main portfolio page's header nav
// (src/routes/portfolio.$slug.tsx) — every entry here must point back to
// that same section on the main portfolio, since this route has no
// sections of its own to anchor to (Phase 3F.6 header-consistency fix).
// Phase 3G.3 §26 — same event names/property shape as the main portfolio
// page's trackAvailabilityCtaClick/trackWhatsappClick (portfolio-sections.tsx),
// just scoped to this route's own bundle shape and page_path.
function trackAvailabilityCtaClick(
  profileSlug: string,
  servicePath: string,
  ctaLocation: CtaLocationValue,
  extra: { service_name?: string } = {},
): void {
  trackEvent(AnalyticsEvent.AvailabilityCtaClick, {
    profile_slug: profileSlug,
    cta_location: ctaLocation,
    page_path: servicePath,
    ...extra,
  });
  // Phase 3G.3A §16 — mirrors portfolio-sections.tsx's tracker so a CTA
  // clicked here is still correctly attributed after the visitor is taken
  // to the main portfolio page's availability form.
  recordCtaClick(ctaLocation, profileSlug);
}

function trackWhatsappClick(
  profileSlug: string,
  servicePath: string,
  ctaLocation: CtaLocationValue,
  extra: { service_name?: string } = {},
): void {
  trackEvent(AnalyticsEvent.WhatsappClick, {
    profile_slug: profileSlug,
    cta_location: ctaLocation,
    page_path: servicePath,
    ...extra,
  });
}

const navItems = [
  { label: "About", hash: "about" },
  { label: "Work", hash: "gallery" },
  { label: "Transformations", hash: "transformations" },
  { label: "Services", hash: "services" },
  { label: "Packages", hash: "packages" },
  { label: "Reviews", hash: "reviews" },
  { label: "Videos", hash: "videos" },
  { label: "FAQ", hash: "faq" },
  { label: "Contact", hash: "contact" },
] as const;

function ServicePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { bundle } = Route.useLoaderData();
  const {
    profile,
    service,
    serviceAreas,
    reviews,
    otherServices,
    appointmentType,
    travelAvailable,
  } = bundle;
  const appointmentTypeLabel = buildAppointmentTypeLabel(appointmentType, travelAvailable);

  const professionalName = profile.display_name;
  const primaryCity = profile.primary_city;
  const h1 = buildServiceH1({ serviceName: service.name, professionalName, primaryCity });
  const priceLabel = formatPrice(service.price, service.price_type, service.currency);
  const serviceDescription = service.short_description ?? service.description;
  const portrait = profile.profile_image_url;
  const aggregateRating = computeAggregateRating(reviews.map((r) => ({ rating: r.rating })));
  const altCtx: MediaAltContext = {
    professionalName,
    role: (profile.professional_title ?? "").trim() || "Beauty Professional",
    city: primaryCity,
  };

  const waHref = profile.whatsapp_number
    ? `https://wa.me/${profile.whatsapp_number.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hi ${professionalName.split(" ")[0]}, I'd like to check availability for ${service.name}.`,
      )}`
    : null;

  const servicePath = `/portfolio/${profile.slug}/services/${resolveServiceSlug(service)}`;

  useTrackedPageView(AnalyticsEvent.ServiceView, servicePath, {
    profile_slug: profile.slug,
    service_id: service.id,
    service_name: service.name,
    page_type: "service",
    page_path: servicePath,
  });

  return (
    <div className="min-h-screen">
      {/* Same public portfolio header/nav as the main profile page (Phase
          3F.6 header-consistency fix) — every link points back to the main
          portfolio's own sections, since this route has none of its own to
          anchor to. Not a new global marketplace header. */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="section-shell flex h-16 items-center justify-between gap-3">
          <Link
            to="/portfolio/$slug"
            params={{ slug: profile.slug }}
            hash="top"
            className="font-display text-[15px] font-semibold whitespace-nowrap"
          >
            {professionalName}
          </Link>
          <nav aria-label="Portfolio sections" className="hidden gap-1 lg:flex">
            {navItems.slice(0, 7).map((n) => (
              <Link
                key={n.label}
                to="/portfolio/$slug"
                params={{ slug: profile.slug }}
                hash={n.hash}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="hero" size="sm" className="hidden rounded-full md:inline-flex" asChild>
              <Link
                to="/portfolio/$slug"
                params={{ slug: profile.slug }}
                search={{ service: service.name }}
                hash="availability"
                onClick={() =>
                  trackAvailabilityCtaClick(
                    profile.slug,
                    servicePath,
                    CtaLocation.ServiceDetailHeader,
                    {
                      service_name: service.name,
                    },
                  )
                }
              >
                <Calendar aria-hidden="true" className="h-4 w-4" /> Check availability
              </Link>
            </Button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="service-mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border lg:hidden"
            >
              {menuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            id="service-mobile-menu"
            aria-label="Mobile navigation"
            className="animate-in fade-in slide-in-from-top-2 max-h-[70vh] overflow-y-auto border-t border-border bg-background px-5 pt-2 pb-5 duration-200 lg:hidden"
          >
            <ul className="grid grid-cols-2 gap-1.5">
              {navItems.map((n) => (
                <li key={n.label}>
                  <Link
                    to="/portfolio/$slug"
                    params={{ slug: profile.slug }}
                    hash={n.hash}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-12 items-center rounded-xl px-3 text-[15px] font-medium"
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              to="/portfolio/$slug"
              params={{ slug: profile.slug }}
              search={{ service: service.name }}
              hash="availability"
              onClick={() => {
                setMenuOpen(false);
                trackAvailabilityCtaClick(
                  profile.slug,
                  servicePath,
                  CtaLocation.ServiceDetailHeader,
                  {
                    service_name: service.name,
                  },
                );
              }}
              className="bg-gradient-brand mt-3 flex min-h-12 items-center justify-center rounded-xl text-[15px] font-semibold text-primary-foreground"
            >
              Check availability
            </Link>
          </nav>
        )}
      </header>

      <div className="section-shell max-w-3xl pt-24 pb-10 sm:pt-28 sm:pb-16">
        {/* Breadcrumb — mirrors the JSON-LD BreadcrumbList exactly */}
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-foreground">
                BeautyFolio
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                to="/portfolio/$slug"
                params={{ slug: profile.slug }}
                className="hover:text-foreground"
              >
                {professionalName}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>Services</li>
            <li aria-hidden="true">/</li>
            <li className="text-foreground">{service.name}</li>
          </ol>
        </nav>

        <h1 className="mt-4 font-display text-[30px] leading-tight font-semibold sm:text-4xl">
          {h1}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Provided by{" "}
          <Link
            to="/portfolio/$slug"
            params={{ slug: profile.slug }}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {professionalName}
          </Link>
          {profile.is_verified && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 align-middle text-xs font-medium text-primary">
              <Check className="h-3 w-3" aria-hidden="true" /> Verified
            </span>
          )}
        </p>
        {primaryCity && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> Based in {primaryCity}
          </p>
        )}

        {/* Compact real-data trust chips — rating/experience/price only when
            they genuinely exist; never every available statistic at once
            (Phase 3F.6 §3). */}
        {(aggregateRating || profile.years_experience != null) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {aggregateRating && (
              <span>
                {aggregateRating.ratingValue}★ ({aggregateRating.reviewCount} review
                {aggregateRating.reviewCount === 1 ? "" : "s"})
              </span>
            )}
            {profile.years_experience != null && (
              <span>{profile.years_experience}+ years experience</span>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button variant="hero" asChild>
            <Link
              to="/portfolio/$slug"
              params={{ slug: profile.slug }}
              search={{ service: service.name }}
              hash="availability"
              onClick={() =>
                trackAvailabilityCtaClick(
                  profile.slug,
                  servicePath,
                  CtaLocation.ServiceDetailHero,
                  {
                    service_name: service.name,
                  },
                )
              }
            >
              <Calendar aria-hidden="true" /> Check availability
            </Link>
          </Button>
          {waHref && (
            <Button variant="softline" asChild>
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  trackWhatsappClick(profile.slug, servicePath, CtaLocation.ServiceDetailHero, {
                    service_name: service.name,
                  })
                }
              >
                <MessageCircle aria-hidden="true" /> WhatsApp
              </a>
            </Button>
          )}
        </div>

        {/* Service overview — real stored description only, never filler */}
        {serviceDescription && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">About this service</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              {serviceDescription}
            </p>
          </section>
        )}

        {/* Pricing / booking context — real price_type semantics, never a
            fabricated fixed price. Appointment type/travel (Phase 3F.6 §17)
            folded in here as concise booking context, not a separate
            section, since it's real Availability configuration rather than
            service-specific detail. */}
        <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="text-lg font-semibold">Pricing</h2>
          <p className="mt-2 font-display text-2xl font-semibold text-primary">{priceLabel}</p>
          {service.duration_minutes && (
            <p className="mt-1 text-sm text-muted-foreground">
              Typical duration: {service.duration_minutes} mins
            </p>
          )}
          {appointmentTypeLabel && (
            <p className="mt-1 text-sm text-muted-foreground">{appointmentTypeLabel}</p>
          )}
        </section>

        {/* What's included — real beautician-entered items only, never
            inferred or auto-generated (Phase 3F.7 §10). Omitted entirely
            when empty. */}
        {service.included_items.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">What's included</h2>
            <ul className="mt-3 space-y-1.5">
              {service.included_items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[15px] text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Suitable for — real beautician-entered occasions, presented as
            simple tags, never treated as SEO keywords (Phase 3F.7 §11). */}
        {service.suitable_for.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Suitable for</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {service.suitable_for.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-sm text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Preparation — the beautician's own text, displayed faithfully,
            never appended to (Phase 3F.7 §12). */}
        {service.preparation_notes && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Before your appointment</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              {service.preparation_notes}
            </p>
          </section>
        )}

        {/* Service areas — travel/service coverage, distinct from primary city */}
        {serviceAreas.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Available in {primaryCity} and nearby areas</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {serviceAreas.map((a) => (
                <span
                  key={a.id}
                  className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-sm text-muted-foreground"
                >
                  {a.area_name ?? a.city}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Relevant portfolio work — only ever real service_id-linked media,
            never inferred from category/keyword matching (Phase 3F.5). */}
        {bundle.relatedGalleryImages.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Portfolio work for this service</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {bundle.relatedGalleryImages.map((img) => {
                const src = resolveMediaUrl(img.public_url, img.storage_path);
                if (!src) return null;
                const alt = buildGalleryImageAlt(altCtx, {
                  altText: img.alt_text,
                  caption: img.caption,
                  title: img.portfolio_items?.title ?? null,
                  category: img.portfolio_items?.category ?? null,
                });
                return (
                  <img
                    key={img.id}
                    src={src}
                    alt={alt}
                    loading="lazy"
                    width={400}
                    height={400}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Before/After transformations linked to this service — one
            transformation pair = one service, never split per side (Phase
            3F.5 §4). Same explicit service_id-only relationship as gallery
            above. */}
        {bundle.relatedBeforeAfter.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Before &amp; after for this service</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {bundle.relatedBeforeAfter.map((item) => {
                const before = item.images.find((i) => i.image_type === "before");
                const after = item.images.find((i) => i.image_type === "after");
                const beforeSrc = before
                  ? resolveMediaUrl(before.public_url, before.storage_path)
                  : null;
                const afterSrc = after
                  ? resolveMediaUrl(after.public_url, after.storage_path)
                  : null;
                if (!beforeSrc || !afterSrc) return null;
                const beforeAlt = buildBeforeAfterAlt(altCtx, {
                  side: "before",
                  altText: before?.alt_text ?? null,
                  title: item.title,
                  eventType: item.event_type,
                });
                const afterAlt = buildBeforeAfterAlt(altCtx, {
                  side: "after",
                  altText: after?.alt_text ?? null,
                  title: item.title,
                  eventType: item.event_type,
                });
                return (
                  <div key={item.id} className="grid grid-cols-2 gap-1.5">
                    <img
                      src={beforeSrc}
                      alt={beforeAlt}
                      loading="lazy"
                      width={400}
                      height={400}
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                    <img
                      src={afterSrc}
                      alt={afterAlt}
                      loading="lazy"
                      width={400}
                      height={400}
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Professional-level trust summary — deliberately NOT labeled as
            service-specific ("HD Bridal Makeup Reviews"), since no reliable
            per-review service link exists (Phase 3F.6 §14). Shows a couple
            of real review quotes, not just the aggregate stat, for
            stronger real trust signal. */}
        {aggregateRating && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Client reviews for {professionalName}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {aggregateRating.ratingValue}★ average from {aggregateRating.reviewCount} published
              review{aggregateRating.reviewCount === 1 ? "" : "s"} on {professionalName}'s
              portfolio.
            </p>
            {reviews.slice(0, 2).map((r) => (
              <blockquote
                key={r.id}
                className="mt-3 rounded-xl border border-border bg-card p-4 text-sm shadow-soft"
              >
                <p className="text-muted-foreground">&ldquo;{r.review_text}&rdquo;</p>
                <footer className="mt-2 text-xs font-medium">
                  {r.client_name}
                  {r.rating && (
                    <span className="ml-2 font-normal text-muted-foreground">{r.rating}★</span>
                  )}
                </footer>
              </blockquote>
            ))}
          </section>
        )}

        {/* FAQ — never duplicated per-service; links to the one real FAQ
            section instead (Phase 3F.4 §5, FAQ). */}
        <section className="mt-8">
          <p className="text-sm text-muted-foreground">
            Have a question about this service?{" "}
            <Link
              to="/portfolio/$slug"
              params={{ slug: profile.slug }}
              hash="faq"
              className="text-primary underline-offset-2 hover:underline"
            >
              See frequently asked questions
            </Link>
            .
          </p>
        </section>

        {/* Other services — real active services only, current one
            excluded, max 4, no AI similarity/inference (Phase 3F.6 §20/§21).
            Omitted cleanly when there are none. */}
        {otherServices.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Other services by {professionalName}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {otherServices.slice(0, 4).map((s) => (
                <Link
                  key={s.id}
                  to="/portfolio/$slug/services/$serviceSlug"
                  params={{ slug: profile.slug, serviceSlug: resolveServiceSlug(s) }}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground shadow-soft transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {s.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Professional summary — concise, links to the full portfolio
            rather than duplicating the About section (Phase 3F.6 §19) */}
        <section className="mt-10 rounded-2xl border border-border bg-secondary/20 p-5">
          <p className="text-sm text-muted-foreground">
            {portrait && (
              <img
                src={portrait}
                alt=""
                width={40}
                height={40}
                className="mr-3 inline-block h-10 w-10 rounded-full object-cover align-middle"
              />
            )}
            See {professionalName}'s full portfolio — work, reviews and availability.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="softline" size="sm" asChild>
              <Link to="/portfolio/$slug" params={{ slug: profile.slug }} hash="gallery">
                View work
              </Link>
            </Button>
            <Button variant="softline" size="sm" asChild>
              <Link to="/portfolio/$slug" params={{ slug: profile.slug }} hash="reviews">
                Reviews
              </Link>
            </Button>
            <Button variant="softline" size="sm" asChild>
              <Link to="/portfolio/$slug" params={{ slug: profile.slug }} hash="availability">
                Availability
              </Link>
            </Button>
          </div>
        </section>

        {/* Final conversion CTA — real service/professional data only, no
            artificial scarcity (Phase 3F.6 §23) */}
        <section className="mt-10 rounded-2xl bg-gradient-brand p-6 text-center shadow-lift sm:p-8">
          <h2 className="font-display text-xl font-semibold text-primary-foreground sm:text-2xl">
            Interested in {service.name}?
          </h2>
          <p className="mt-1.5 text-sm text-primary-foreground/90">
            Check {professionalName.split(" ")[0]}'s availability for your date.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <Button variant="secondary" asChild>
              <Link
                to="/portfolio/$slug"
                params={{ slug: profile.slug }}
                search={{ service: service.name }}
                hash="availability"
                onClick={() =>
                  trackAvailabilityCtaClick(profile.slug, servicePath, CtaLocation.FinalCta, {
                    service_name: service.name,
                  })
                }
              >
                <Calendar aria-hidden="true" /> Check availability
              </Link>
            </Button>
            {waHref && (
              <Button
                variant="outline"
                className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                asChild
              >
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    trackWhatsappClick(profile.slug, servicePath, CtaLocation.FinalCta, {
                      service_name: service.name,
                    })
                  }
                >
                  <MessageCircle aria-hidden="true" /> WhatsApp
                </a>
              </Button>
            )}
          </div>
        </section>

        {/* Bottom padding so the mobile sticky CTA never covers the last
            section's content. */}
        <div className="h-20 md:hidden" aria-hidden="true" />
      </div>

      {/* Mobile sticky CTA — mirrors the existing MobileStickyCta pattern
          used on the main portfolio page (same visual treatment), adapted
          here since this route's bundle isn't a full BeauticianProfile and
          "Check availability" must carry service context (Phase 3F.6 §24). */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:hidden"
        aria-label="Mobile booking actions"
      >
        <div className="flex items-center gap-2 rounded-[18px] border border-[rgba(40,20,40,0.08)] bg-white/96 p-2.5 shadow-[0_4px_24px_-8px_rgba(40,20,40,0.18)] backdrop-blur-md">
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              aria-label={`Contact ${professionalName} on WhatsApp`}
              onClick={() =>
                trackWhatsappClick(profile.slug, servicePath, CtaLocation.MobileSticky, {
                  service_name: service.name,
                })
              }
              className="flex h-12 shrink-0 flex-[0_0_22%] min-w-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-[rgba(40,20,40,0.08)] bg-white text-[11px] font-semibold leading-tight text-foreground transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              <MessageCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              WhatsApp
            </a>
          )}
          <Link
            to="/portfolio/$slug"
            params={{ slug: profile.slug }}
            search={{ service: service.name }}
            hash="availability"
            aria-label={`Check ${professionalName}'s availability for ${service.name}`}
            onClick={() =>
              trackAvailabilityCtaClick(profile.slug, servicePath, CtaLocation.MobileSticky, {
                service_name: service.name,
              })
            }
            className="flex h-13 flex-1 min-w-0 items-center justify-center gap-2 rounded-[15px] bg-gradient-to-r from-[#D94F78] to-[#5B176E] px-3 text-center text-[15px] font-semibold leading-tight text-white shadow-[0_4px_18px_-6px_rgba(91,23,110,0.45)] transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            <Calendar className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">Check availability</span>
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
