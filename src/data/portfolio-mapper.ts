// Pure, side-effect-free mapping from the Supabase-shaped PortfolioBundle to the
// existing BeauticianProfile shape consumed by src/components/portfolio/portfolio-sections.tsx.
// No UI/visual change is implied by this file — it only reshapes data so the
// existing components keep working unmodified.
import type { PortfolioBundle } from "./portfolio-query.server";
import type {
  BeauticianProfile,
  GalleryCategory,
  GalleryItem,
  ServiceGroup,
} from "@/data/portfolio";
import {
  buildGalleryImageAlt,
  buildBeforeAfterAlt,
  buildVideoThumbnailAlt,
  type MediaAltContext,
} from "@/lib/media-alt-text";
import { buildSameAs, computeAggregateRating, resolveServiceSlug } from "@/lib/seo-helpers";

const GALLERY_CATEGORIES: readonly GalleryCategory[] = [
  "bridal",
  "party",
  "hd",
  "hair",
  "nails",
  "before-after",
];

// Public Supabase Storage object URL, e.g.
// https://<ref>.supabase.co/storage/v1/object/public/portfolio-media/<path>
// SUPABASE_URL is a public value (already shipped to the client via VITE_SUPABASE_URL),
// so referencing it here carries no credential-exposure risk.
const PORTFOLIO_MEDIA_BUCKET = "portfolio-media";
const SUPABASE_URL = process.env["SUPABASE_URL"] ?? "";

/**
 * Resolves the servable URL for a Storage-backed media row. Prefers the
 * cached `public_url` column; falls back to constructing the public object
 * URL from `storage_path` (works because the bucket is public-read). Returns
 * null when neither is available so callers can drop the item instead of
 * rendering an empty/broken <img>.
 */
export function resolveMediaUrl(
  publicUrl: string | null,
  storagePath: string | null,
): string | null {
  if (publicUrl) return publicUrl;
  if (storagePath && SUPABASE_URL) {
    return `${SUPABASE_URL}/storage/v1/object/public/${PORTFOLIO_MEDIA_BUCKET}/${storagePath}`;
  }
  return null;
}

function toGalleryCategory(value: string | null): GalleryCategory {
  const normalized = (value ?? "").toLowerCase().trim();
  return (GALLERY_CATEGORIES as readonly string[]).includes(normalized)
    ? (normalized as GalleryCategory)
    : "bridal";
}

export function formatPrice(
  price: number | null,
  priceType: "fixed" | "starting_from" | "custom_quote",
  currency: string,
): string {
  if (priceType === "custom_quote" || price == null) return "Custom quote";
  const formatted = `${currency === "INR" ? "₹" : currency + " "}${Number(price).toLocaleString("en-IN")}`;
  return priceType === "starting_from" ? `From ${formatted}` : formatted;
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "";
  if (minutes < 60) return `${minutes} mins`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hrs` : `${hours.toFixed(1)} hrs`;
}

function formatVideoLength(seconds: number | null): string {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Maps a Supabase-sourced PortfolioBundle onto the existing BeauticianProfile shape. */
export function mapPortfolioBundleToProfile(bundle: PortfolioBundle): BeauticianProfile {
  const { profile } = bundle;

  // Built once from the raw profile row (not the later-computed display
  // variables) so gallery/before-after/video alt text can be generated
  // right where each item is mapped, in a single pass.
  const altCtx: MediaAltContext = {
    professionalName: profile.display_name,
    role: profile.professional_title ?? "Beauty Professional",
    city: profile.primary_city,
  };

  const gallery: GalleryItem[] = bundle.portfolioItems.flatMap((item) =>
    item.images
      .filter((img) => resolveMediaUrl(img.public_url, img.storage_path) != null)
      .map((img): GalleryItem => ({
        src: resolveMediaUrl(img.public_url, img.storage_path) as string,
        label: img.caption ?? img.alt_text ?? item.title ?? "Portfolio image",
        category: toGalleryCategory(item.category),
        alt: buildGalleryImageAlt(altCtx, {
          altText: img.alt_text,
          caption: img.caption,
          title: item.title,
          category: item.category,
        }),
        createdAt: img.created_at,
      })),
  );

  const transformations = bundle.beforeAfter
    .map((item) => {
      const beforeImg = item.images.find((i) => i.image_type === "before");
      const afterImg = item.images.find((i) => i.image_type === "after");
      const before = beforeImg
        ? resolveMediaUrl(beforeImg.public_url, beforeImg.storage_path)
        : null;
      const after = afterImg ? resolveMediaUrl(afterImg.public_url, afterImg.storage_path) : null;
      if (!before || !after) return null;
      return {
        before,
        after,
        service: item.title ?? "Transformation",
        occasion: [item.event_type, item.location].filter(Boolean).join(" · "),
        beforeAlt: buildBeforeAfterAlt(altCtx, {
          side: "before",
          altText: beforeImg?.alt_text ?? null,
          title: item.title,
          eventType: item.event_type,
        }),
        afterAlt: buildBeforeAfterAlt(altCtx, {
          side: "after",
          altText: afterImg?.alt_text ?? null,
          title: item.title,
          eventType: item.event_type,
        }),
      };
    })
    .filter((t): t is NonNullable<typeof t> => t != null);

  const serviceGroupMap = new Map<string, ServiceGroup["items"]>();
  for (const s of bundle.services) {
    const groupName = s.category?.trim() || "Services";
    const items = serviceGroupMap.get(groupName) ?? [];
    items.push({
      id: s.id,
      name: s.name,
      duration: formatDuration(s.duration_minutes),
      detail: s.short_description ?? s.description ?? "",
      price: formatPrice(s.price, s.price_type, s.currency),
      priceValue: s.price,
      priceType: s.price_type,
      currency: s.currency,
      slug: resolveServiceSlug(s),
    });
    serviceGroupMap.set(groupName, items);
  }
  const serviceGroups: ServiceGroup[] = Array.from(serviceGroupMap.entries()).map(
    ([group, items]) => ({ group, items }),
  );

  const packages = bundle.packages.map((p) => ({
    name: p.name,
    price: formatPrice(p.price, p.price_type, p.currency),
    note: p.note ?? "",
    bestFor: p.best_for ?? "",
    featured: p.is_featured || p.is_popular,
    includes: p.inclusions ?? [],
    priceValue: p.price,
    priceType: p.price_type,
    currency: p.currency,
    description: p.description,
  }));

  const reviews = bundle.reviews.map((r) => ({
    name: r.client_name,
    event: [r.service_name, r.event_type].filter(Boolean).join(" · "),
    text: r.review_text,
    rating: r.rating,
    ...(r.review_date ? { date: r.review_date } : {}),
    verified: r.is_verified,
  }));

  // Single source of truth for the public rating/review-count trust
  // metrics — the exact same real-published-reviews calculation used for
  // the JSON-LD AggregateRating (Phase 3F.3), never the legacy
  // beautician_profiles.rating/review_count columns. `bundle.reviews` is
  // already scoped to is_published rows by the query layer. Phase 3F.3A §3.
  const ratingSummary = computeAggregateRating(bundle.reviews.map((r) => ({ rating: r.rating })));

  // A video with no thumbnail has nothing safe to render (the existing
  // VideosSection <img> has no empty-src guard), so drop it rather than
  // emit a broken image — same graceful-empty treatment as gallery/before-after.
  const videos = bundle.videos
    .filter((v) => v.thumbnail_url)
    .map((v) => ({
      title: v.title ?? "Video",
      length: formatVideoLength(v.duration_seconds),
      thumb: v.thumbnail_url as string,
      category: v.category ?? "",
      blurb: v.description ?? "",
      platform: (v.platform ?? "other") as "youtube" | "instagram" | "uploaded" | "other",
      videoUrl:
        v.platform === "uploaded" ? resolveMediaUrl(null, v.storage_path) : (v.video_url ?? null),
      storagePath: v.storage_path ?? null,
      thumbnailAlt: buildVideoThumbnailAlt(altCtx, { title: v.title, category: v.category }),
      createdAt: v.created_at,
      durationSeconds: v.duration_seconds,
    }));

  const faqs = bundle.faqs.map((f) => ({ q: f.question, a: f.answer }));

  const availability: BeauticianProfile["availability"] = {
    acceptingBookings: bundle.availability?.accepting_bookings ?? true,
    minimumNoticeHours: bundle.availability?.minimum_notice_hours ?? null,
    advanceBookingDays: bundle.availability?.advance_booking_days ?? null,
    appointmentType:
      (bundle.availability
        ?.appointment_type as BeauticianProfile["availability"]["appointmentType"]) ?? "both",
    travelAvailable: bundle.availability?.travel_available ?? false,
    blockedDates: bundle.blockedDates.map((b) => b.blocked_date),
  };

  const areas = bundle.serviceAreas.map((a) => a.area_name ?? a.city);

  // client_count is dropped from public trust metrics entirely — audited
  // in Phase 3F.3A §5: no dashboard field, no admin verification flow, no
  // sync mechanism exists for it, so it cannot be presented as a factual
  // public claim. Replaced with real, system-calculated signals instead
  // (rating/review count from published reviews, which are only ever
  // added when they exist — never a fabricated 0).
  const trustBar: { label: string; value: string }[] = [];
  if (profile.years_experience != null) {
    trustBar.push({ label: "Experience", value: `${profile.years_experience}+ Years` });
  }
  if (ratingSummary) {
    trustBar.push({ label: "Rating", value: `${ratingSummary.ratingValue}★` });
    trustBar.push({ label: "Reviews", value: `${ratingSummary.reviewCount}` });
  }
  if (profile.primary_city) {
    trustBar.push({ label: "Based in", value: profile.primary_city });
  }

  const experience = profile.years_experience != null ? `${profile.years_experience}+ years` : "";
  const specializationNames = bundle.specializations.map((s) => s.name);

  const mapped: BeauticianProfile = {
    slug: profile.slug,
    name: profile.display_name,
    // .trim() guards against stray whitespace in authored profile data
    // producing double spaces wherever role gets concatenated (title, alt
    // text, meta description) — a real data-quality issue surfaced while
    // verifying this phase's alt-text output, cheap and safe to fix here.
    role: (profile.professional_title ?? "").trim(),
    specialty: profile.short_tagline ?? profile.professional_title ?? "",
    headline: profile.short_tagline ?? profile.professional_title ?? profile.display_name,
    positioning: profile.bio ?? "",
    // Phase 3F.9A — genuine absence, never a fabricated fallback photo
    // (previously fell back to a bundled static asset, which meant every
    // profile without a real photo silently showed someone else's picture,
    // including in Open Graph and structured data). The hero section now
    // renders a real no-photo state instead.
    portrait: profile.profile_image_url ?? null,
    city: [profile.locality, profile.primary_city].filter(Boolean).join(", "),
    primaryCity: profile.primary_city ?? "",
    region: profile.state ?? "",
    country: profile.country,
    rating: ratingSummary?.ratingValue ?? null,
    reviewCount: ratingSummary?.reviewCount ?? 0,
    experience,
    publishedWorkCount: bundle.portfolioItems.length,
    isVerified: profile.is_verified,
    specializations: specializationNames,
    areas,
    travelNote: profile.travel_note ?? "",
    phone: profile.phone ?? "",
    whatsapp: (profile.whatsapp_number ?? "").replace(/\D/g, ""),
    email: profile.email ?? "",
    studio: profile.address ?? "",
    hours: profile.working_hours ?? "",
    mapQuery:
      profile.map_query ?? [profile.locality, profile.primary_city].filter(Boolean).join(", "),
    trustBar,
    businessName: profile.business_name,
    sameAs: buildSameAs({
      instagramUrl: profile.instagram_url,
      facebookUrl: profile.facebook_url,
      youtubeUrl: profile.youtube_url,
      websiteUrl: profile.website_url,
    }),
    about: {
      intro: profile.bio ?? "",
      second: profile.bio_secondary ?? "",
      highlights: profile.about_highlights ?? [],
    },
    whyChoose: profile.why_choose_points ?? [],
    gallery,
    transformations,
    serviceGroups,
    packages,
    reviews,
    videos,
    faqs,
    availability,
  };

  return mapped;
}
