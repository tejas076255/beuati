import { useState } from "react";
import { Calendar, Menu, X } from "lucide-react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import {
  AboutSection,
  AvailabilitySection,
  FaqSection,
  FinalCtaSection,
  GallerySection,
  MobileStickyCta,
  PackagesSection,
  PortfolioHeroSection,
  ReviewsSection,
  ServiceAreasSection,
  ServicesSection,
  TransformationsSection,
  VideosSection,
  WhatsAppButton,
  WhyChooseSection,
} from "@/components/portfolio/portfolio-sections";
import { SiteFooter } from "@/components/site/site-footer";
import { Button } from "@/components/ui/button";
import { dhartiProfile, type BeauticianProfile } from "@/data/portfolio";
import {
  buildDefaultSeoTitle,
  buildDefaultMetaDescription,
  buildOpeningHoursSpecification,
  buildOfferPricing,
  computeAggregateRating,
  evaluatePortfolioIndexability,
} from "@/lib/seo-helpers";
import { absoluteUrl } from "@/lib/site-url";
import { safeJsonLd } from "@/lib/json-ld";
import { getVideoEmbedSource } from "@/lib/video-embed";
import { AnalyticsEvent, useTrackedPageView } from "@/lib/analytics";
import type { Json, Tables } from "@/integrations/supabase/types";

type PortfolioLoaderResult = {
  status: "ok";
  profile: BeauticianProfile;
  seo: Tables<"portfolio_seo"> | null;
  workingHours: Json | null;
  /** Phase 3F.9 §23 — the same evaluatePortfolioIndexability() result the
   * dashboard readiness panel and the sitemap query use, computed here from
   * the raw bundle (not the mapped `profile`) so it can never drift from
   * either. Drives the robots directive below. */
  indexable: boolean;
};

// Server-side, read-only: reads the live Supabase portfolio for any slug.
// No static-data fallback anymore — every profile, including the original
// demo, is expected to have a real published record. An unpublished/missing
// slug is a genuine 404, not a swap to placeholder content, so admin
// moderation (draft/unpublished/suspended) actually hides the public page.
// Dynamically imported so the Supabase query code never ships to the client
// bundle — same convention as client.server.ts ("load inside server
// handlers").
const loadPortfolioData = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<PortfolioLoaderResult | null> => {
    const { getPublishedPortfolioBySlug } = await import("@/data/portfolio-query.server");
    const bundle = await getPublishedPortfolioBySlug(slug);

    if (!bundle) {
      return null;
    }

    const { mapPortfolioBundleToProfile } = await import("@/data/portfolio-mapper");
    const { indexable } = evaluatePortfolioIndexability({
      isPublished: true,
      robotsIndex: bundle.seo?.robots_index !== false,
      professionalName: bundle.profile.display_name,
      professionalTitle: bundle.profile.professional_title,
      primaryCity: bundle.profile.primary_city,
      bio: bundle.profile.bio,
      // `bundle.services` is already filtered to is_active=true by the
      // query in portfolio-query.server.ts.
      activeServiceCount: bundle.services.length,
    });
    return {
      status: "ok",
      profile: mapPortfolioBundleToProfile(bundle),
      seo: bundle.seo,
      workingHours: bundle.availability?.working_hours ?? null,
      indexable,
    };
  });

/**
 * Builds schema.org ImageObject entries for gallery photos + before/after
 * pairs — only ever from data that genuinely exists on the row (contentUrl,
 * caption/alt, dateCreated). Never fabricates a value that isn't stored.
 * `creator` references the canonical Person node by @id (Phase 3F.3 §11)
 * instead of a duplicate inline Person object, so media stays connected to
 * the one entity graph rather than forming a disconnected island.
 */
function buildImageObjects(profile: BeauticianProfile, personId: string) {
  const creator = { "@id": personId };

  const galleryObjects = profile.gallery.map((img) => ({
    "@context": "https://schema.org",
    "@type": "ImageObject",
    contentUrl: img.src,
    name: img.label,
    ...(img.alt ? { caption: img.alt, description: img.alt } : {}),
    creator,
    ...(img.createdAt ? { dateCreated: img.createdAt } : {}),
  }));

  const transformationObjects = profile.transformations.flatMap((t) => [
    {
      "@context": "https://schema.org",
      "@type": "ImageObject",
      contentUrl: t.before,
      name: `${t.service} — before`,
      ...(t.beforeAlt ? { caption: t.beforeAlt, description: t.beforeAlt } : {}),
      creator,
    },
    {
      "@context": "https://schema.org",
      "@type": "ImageObject",
      contentUrl: t.after,
      name: `${t.service} — after`,
      ...(t.afterAlt ? { caption: t.afterAlt, description: t.afterAlt } : {}),
      creator,
    },
  ]);

  return [...galleryObjects, ...transformationObjects];
}

/**
 * Builds schema.org VideoObject entries — thumbnailUrl/name always present
 * (both required on every stored video row); contentUrl/embedUrl/uploadDate
 * are included only when real data resolves for them, never fabricated.
 * `creator` references the canonical Person node by @id — see
 * buildImageObjects above.
 */
function buildVideoObjects(profile: BeauticianProfile, personId: string) {
  const creator = { "@id": personId };

  return profile.videos.map((v) => {
    const embed = getVideoEmbedSource({
      platform: v.platform,
      videoUrl: v.videoUrl,
      resolvedStorageUrl: v.platform === "uploaded" ? v.videoUrl : null,
    });

    return {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: v.title,
      thumbnailUrl: v.thumb,
      ...(v.blurb ? { description: v.blurb } : {}),
      ...(embed?.type === "video" ? { contentUrl: embed.src } : {}),
      // Strip the player-only autoplay query so structured data points at the
      // canonical embeddable URL, not an autoplaying one.
      ...(embed?.type === "iframe" ? { embedUrl: embed.src.split("?")[0] } : {}),
      ...(v.createdAt ? { uploadDate: v.createdAt } : {}),
      ...(v.durationSeconds ? { duration: `PT${v.durationSeconds}S` } : {}),
      creator,
    };
  });
}

/**
 * Real `Service`-as-Offer entities for both individually listed services and
 * packages (Phase 3F.3 §7/§8) — packages reuse this exact builder rather
 * than a separate OfferCatalog/Service representation, since a package is
 * just another named, priced offering with the same real name/description/
 * price/price_type/currency shape as a service; introducing a second schema
 * type for it would only add complexity with no new data to justify it.
 *
 * An item is only ever represented as a schema.org `Offer` when its price
 * semantics are unambiguous: a `fixed` price becomes `Offer.price`, a
 * `starting_from` price becomes `Offer.priceSpecification.minPrice` (never
 * misrepresented as a single fixed price), and a `custom_quote` item is
 * dropped entirely rather than emitting an Offer with a fabricated or empty
 * price — see buildOfferPricing() in src/lib/seo-helpers.ts.
 */
function buildOfferEntities(
  items: {
    name: string;
    detail?: string;
    description?: string | null;
    priceValue?: number | null;
    priceType?: "fixed" | "starting_from" | "custom_quote";
    currency?: string;
  }[],
  businessId: string,
  primaryCity: string,
) {
  return items
    .map((item) => {
      const pricing = buildOfferPricing({
        price: item.priceValue ?? null,
        priceType: item.priceType ?? "custom_quote",
        currency: item.currency ?? "INR",
      });
      if (!pricing) return null;
      const description = item.detail || item.description || undefined;
      return {
        "@type": "Offer",
        ...pricing,
        itemOffered: {
          "@type": "Service",
          name: item.name,
          ...(description ? { description } : {}),
          provider: { "@id": businessId },
          ...(primaryCity ? { areaServed: primaryCity } : {}),
        },
      };
    })
    .filter((o): o is NonNullable<typeof o> => o != null);
}

function buildHead(
  profile: BeauticianProfile,
  seo: Tables<"portfolio_seo"> | null,
  workingHours: Json | null,
  indexable: boolean,
) {
  const path = `/portfolio/${profile.slug}`;
  const pageUrl = absoluteUrl(path);
  // One stable @id per entity so every structured-data node (services,
  // reviews, media) references the same professional/business identity
  // instead of forming disconnected JSON-LD islands — Phase 3F.3 §2/§3.
  // Hybrid Person + LocalBusiness model: a BeautyFolio profile always
  // carries individual-professional data (bio, years of experience,
  // portrait) AND business-like data (studio address, hours, service
  // catalog), so representing only one side would drop real information.
  // Kept the existing BeautySalon/LocalBusiness type rather than switching
  // to a bare ProfessionalService — not changed "because it sounds better,"
  // since most seeded profiles already carry a studio address consistent
  // with a LocalBusiness. See docs/BEAUTYFOLIO-PHASE3F3-SEMANTIC-SEO.md §2.
  const businessId = `${pageUrl}#business`;
  const personId = `${pageUrl}#person`;
  const openingHours = buildOpeningHoursSpecification(workingHours);
  const services = profile.serviceGroups.flatMap((g) => g.items);
  // Primary-service resolution here is a lighter proxy (first listed
  // service) than the dashboard's is_featured-aware resolvePrimaryService()
  // — both ultimately call the same title/description generators from
  // src/lib/seo-helpers.ts, so defaults never diverge in wording, only
  // possibly in which service is picked when no service is featured. See
  // docs/BEAUTYFOLIO-PHASE3F1-SEO-AUDIT.md §5.
  const primaryService = services[0]?.name ?? profile.specializations[0] ?? null;
  const seoProfileInput = {
    name: profile.name,
    role: profile.role,
    primaryCity: profile.primaryCity,
    specializations: profile.specializations,
  };
  const title = seo?.seo_title ?? buildDefaultSeoTitle(seoProfileInput, primaryService);
  const description =
    seo?.meta_description ?? buildDefaultMetaDescription(seoProfileInput, primaryService);
  const ogTitle = seo?.og_title ?? title;
  const ogDescription = seo?.og_description ?? description;
  const canonical = seo?.canonical_url ?? absoluteUrl(path);
  // Falls back to the profile photo so a shared link always has a preview
  // image, instead of only showing one when the beautician has manually set
  // a social-share image override.
  const ogImage = seo?.og_image_url ?? (profile.portrait ? absoluteUrl(profile.portrait) : null);
  // Phase 3F.9 §23 — always an explicit directive now, combining the manual
  // robots_follow override with real content-based readiness (never index a
  // page that doesn't satisfy evaluatePortfolioIndexability(), regardless of
  // the robots_index toggle alone). This is the exact same `indexable`
  // value the sitemap query computes, so the two can never disagree.
  const robotsContent = `${indexable ? "index" : "noindex"}, ${seo?.robots_follow === false ? "nofollow" : "follow"}`;

  const aggregateRating = computeAggregateRating(profile.reviews);
  const offers = [
    ...buildOfferEntities(services, businessId, profile.primaryCity),
    ...buildOfferEntities(profile.packages, businessId, profile.primaryCity),
  ];

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: robotsContent },
      { property: "og:title", content: ogTitle },
      { property: "og:description", content: ogDescription },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: absoluteUrl(path) },
      ...(ogImage ? [{ property: "og:image", content: ogImage }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: ogTitle },
      { name: "twitter:description", content: ogDescription },
    ],
    links: [{ rel: "canonical", href: canonical }],
    scripts: [
      {
        type: "application/ld+json",
        // Single @graph so every node (business, person, services, media,
        // reviews, FAQ, breadcrumbs) shares one @context and can reference
        // each other by @id instead of forming disconnected JSON-LD
        // islands — Phase 3F.3 §3/§23.
        children: safeJsonLd({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": ["BeautySalon", "LocalBusiness"],
              "@id": businessId,
              // Real business_name when the beautician has entered one;
              // falls back to their own name, unchanged from prior phases.
              name: profile.businessName || profile.name,
              description,
              url: pageUrl,
              telephone: profile.phone,
              email: profile.email,
              // priceRange was a hardcoded placeholder not backed by real
              // data — removed rather than fabricated (Phase 3F.1). openingHours
              // is now sourced for real from availability_settings.working_hours
              // (Phase 3F.2A) — see docs/BEAUTYFOLIO-PHASE3F2A-SEO-INFRASTRUCTURE.md §6.
              ...(openingHours.length > 0 ? { openingHoursSpecification: openingHours } : {}),
              address: {
                "@type": "PostalAddress",
                streetAddress: profile.studio,
                addressLocality: profile.primaryCity,
                addressRegion: profile.region,
                addressCountry: profile.country,
              },
              // Service Areas (where they travel to) — kept distinct from
              // `address` above (their primary/studio location). Real
              // configured service_areas rows only; no fabricated
              // coordinates/postal codes. Phase 3F.3 §5/§6.
              ...(profile.areas.length > 0
                ? { areaServed: profile.areas.map((a) => ({ "@type": "City", name: a })) }
                : {}),
              founder: { "@id": personId },
              // Computed from the real, published `reviews` rows below —
              // never the separate profile.rating/reviewCount marketing
              // columns, which are not guaranteed to reconcile with what's
              // actually shown in `review[]` (Phase 3F.3 §9/§20 — see the
              // trust-metric audit in docs/BEAUTYFOLIO-PHASE3F3-SEMANTIC-SEO.md).
              ...(aggregateRating
                ? { aggregateRating: { "@type": "AggregateRating", ...aggregateRating } }
                : {}),
              ...(profile.reviews.length > 0
                ? {
                    review: profile.reviews.map((r) => ({
                      "@type": "Review",
                      author: { "@type": "Person", name: r.name },
                      reviewBody: r.text,
                      datePublished: r.date,
                      reviewRating: { "@type": "Rating", ratingValue: r.rating },
                    })),
                  }
                : {}),
              ...(offers.length > 0 ? { makesOffer: offers } : {}),
            },
            {
              "@type": "Person",
              "@id": personId,
              name: profile.name,
              jobTitle: profile.role,
              description: profile.positioning || undefined,
              image: profile.portrait ? absoluteUrl(profile.portrait) : undefined,
              url: pageUrl,
              knowsAbout: profile.specializations,
              worksFor: { "@id": businessId },
              // Real Instagram/Facebook/YouTube/website URLs the beautician
              // entered on their own Profile page — never invented. Phase
              // 3F.3 §12.
              ...(profile.sameAs && profile.sameAs.length > 0 ? { sameAs: profile.sameAs } : {}),
            },
            ...(profile.faqs.length > 0
              ? [
                  {
                    "@type": "FAQPage",
                    mainEntity: profile.faqs.map((f) => ({
                      "@type": "Question",
                      name: f.q,
                      acceptedAnswer: { "@type": "Answer", text: f.a },
                    })),
                  },
                ]
              : []),
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "BeautyFolio", item: absoluteUrl("/") },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Portfolios",
                  item: absoluteUrl("/portfolio"),
                },
                { "@type": "ListItem", position: 3, name: profile.name, item: pageUrl },
              ],
            },
            // ImageObject/VideoObject entries: only real, already-stored
            // values are ever emitted (contentUrl, name, caption, creator,
            // dateCreated/uploadDate) — no fabricated durations, dates, or
            // thumbnails. creator references the Person node above by @id.
            // See Phase 3F.2B media SEO spec + Phase 3F.3 §11.
            ...buildImageObjects(profile, personId),
            ...buildVideoObjects(profile, personId),
          ],
        }),
      },
    ],
  };
}

export const Route = createFileRoute("/portfolio/$slug")({
  // Lets a service page's "Check availability" link (Phase 3F.6 §8/§9)
  // pre-select the Availability form's service dropdown via ?service=—
  // plain client-side prefill, no schema/lead-architecture change.
  validateSearch: (search: Record<string, unknown>): { service?: string } =>
    typeof search["service"] === "string" ? { service: search["service"] } : {},
  loader: async ({ params }) => {
    const result = await loadPortfolioData({ data: params.slug });
    if (!result) {
      throw notFound();
    }
    return {
      profile: result.profile,
      seo: result.seo,
      workingHours: result.workingHours,
      indexable: result.indexable,
    };
  },
  head: ({ loaderData }) => {
    const data = loaderData ?? {
      profile: dhartiProfile,
      seo: null,
      workingHours: null,
      indexable: true,
    };
    return buildHead(data.profile, data.seo, data.workingHours, data.indexable);
  },
  component: PortfolioPage,
});

/**
 * Phase 3G.1 §9/§23 — each optional section (Gallery/Transformations/
 * Packages/Reviews/Videos/FAQ) already omits itself entirely when empty
 * (see portfolio-sections.tsx). The nav must never link to an anchor that
 * doesn't exist in the DOM, so it's built from the same real data rather
 * than a fixed list — a dead nav link to a missing section is exactly the
 * kind of friction this phase audits for.
 */
function buildNavItems(profile: BeauticianProfile) {
  return [
    { label: "About", href: "#about", visible: true },
    { label: "Work", href: "#gallery", visible: profile.gallery.length > 0 },
    {
      label: "Transformations",
      href: "#transformations",
      visible: profile.transformations.length > 0,
    },
    { label: "Services", href: "#services", visible: true },
    { label: "Packages", href: "#packages", visible: profile.packages.length > 0 },
    { label: "Reviews", href: "#reviews", visible: profile.reviews.length > 0 },
    { label: "Videos", href: "#videos", visible: profile.videos.length > 0 },
    { label: "FAQ", href: "#faq", visible: profile.faqs.length > 0 },
    { label: "Contact", href: "#contact", visible: true },
  ].filter((item) => item.visible);
}

function PortfolioPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile } = Route.useLoaderData();
  const { service: initialService } = Route.useSearch();
  const navItems = buildNavItems(profile);

  // Phase 3G.3 §10 — fires once per genuine client-side page visit (never
  // during SSR/hydration, never twice for the same profile — see
  // useTrackedPageView's own doc comment for how dedup works).
  useTrackedPageView(AnalyticsEvent.PortfolioView, profile.slug, {
    profile_slug: profile.slug,
    professional_name: profile.name,
    page_type: "portfolio",
    page_path: `/portfolio/${profile.slug}`,
  });

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="section-shell flex h-16 items-center justify-between gap-3">
          <a href="#top" className="font-display text-[15px] font-semibold whitespace-nowrap">
            {profile.name}
          </a>
          <nav aria-label="Portfolio sections" className="hidden gap-1 lg:flex">
            {navItems.slice(0, 7).map((n) => (
              <a
                key={n.label}
                href={n.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="hero" size="sm" className="hidden rounded-full md:inline-flex" asChild>
              <a href="#availability">
                <Calendar aria-hidden="true" className="h-4 w-4" /> Check availability
              </a>
            </Button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="portfolio-mobile-menu"
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
            id="portfolio-mobile-menu"
            aria-label="Mobile navigation"
            className="animate-in fade-in slide-in-from-top-2 max-h-[70vh] overflow-y-auto border-t border-border bg-background px-5 pt-2 pb-5 duration-200 lg:hidden"
          >
            <ul className="grid grid-cols-2 gap-1.5">
              {navItems.map((n) => (
                <li key={n.label}>
                  <a
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-12 items-center rounded-xl px-3 text-[15px] font-medium"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href="#availability"
              onClick={() => setMenuOpen(false)}
              className="bg-gradient-brand mt-3 flex min-h-12 items-center justify-center rounded-xl text-[15px] font-semibold text-primary-foreground"
            >
              Check availability
            </a>
          </nav>
        )}
      </header>

      <main>
        <PortfolioHeroSection profile={profile} />
        <AboutSection profile={profile} />
        <WhyChooseSection profile={profile} />
        <GallerySection profile={profile} />
        <TransformationsSection profile={profile} />
        <ServicesSection profile={profile} />
        <PackagesSection profile={profile} />
        <ReviewsSection profile={profile} />
        <VideosSection profile={profile} />
        <ServiceAreasSection profile={profile} />
        <AvailabilitySection profile={profile} {...(initialService ? { initialService } : {})} />
        <FaqSection profile={profile} />
        <FinalCtaSection profile={profile} />
      </main>

      <WhatsAppButton profile={profile} />
      <MobileStickyCta profile={profile} />
      <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <SiteFooter />
      </div>
    </div>
  );
}
