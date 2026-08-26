// Server-only. Owner-scoped beautician_profiles read/update for the
// Portfolio Builder. RLS (owns_beautician_profile()) enforces ownership.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesUpdate } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

export async function getOwnProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"beautician_profiles">> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { data, error } = await supabase
    .from("beautician_profiles")
    .select("*")
    .eq("id", bpId)
    .single();

  if (error || !data) {
    throw new Error("Failed to load profile.");
  }
  return data;
}

export type OwnProfileUpdate = Pick<
  TablesUpdate<"beautician_profiles">,
  | "display_name"
  | "professional_title"
  | "short_tagline"
  | "bio"
  | "bio_secondary"
  | "primary_city"
  | "locality"
  | "state"
  | "phone"
  | "whatsapp_number"
  | "email"
  | "address"
  | "working_hours"
  | "travel_note"
  | "status"
  | "profile_image_url"
  | "about_highlights"
  | "why_choose_points"
  | "cover_image_url"
  | "business_name"
  | "website_url"
  | "facebook_url"
  | "instagram_url"
  | "youtube_url"
  | "years_experience"
  | "map_query"
>;

/**
 * Phase 3F.9A — removing a profile photo ("Remove photo" in the dashboard)
 * only ever sends `profile_image_url: null` here, exactly like any other
 * field edit; it never triggers a Storage deletion. Audited decision: the
 * existing `deletePortfolioMedia()` helper (used by Gallery/Before-After,
 * where each row owns exactly one distinct upload) was deliberately NOT
 * reused for the profile photo, because this column's deletion semantics
 * are different and less certain — a beautician could re-add a previously
 * uploaded file, or the URL could in principle be reused elsewhere, and
 * there is no owning "media item" row to safely key a delete off of the
 * way Gallery/Before-After images have. Clearing the DB reference is
 * always safe and fully achieves the product goal (the photo genuinely
 * disappears from the public portfolio); the orphaned object is left in
 * the `portfolio-media` bucket rather than risk deleting something still
 * referenced. No storage cleanup job exists yet — a candidate for a future
 * phase, not this one.
 */
export async function updateOwnProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  updates: OwnProfileUpdate,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { error } = await supabase.from("beautician_profiles").update(updates).eq("id", bpId);

  if (error) {
    console.error("[dashboard/profile] failed to update profile", error);
    throw new Error(`Failed to save profile: ${error.message}`);
  }
}

/**
 * Phase 3F.9 §19/§20 — the "external" readiness signals that are never
 * edited from the Profile dialog itself (services, gallery, reviews, FAQs,
 * videos, service areas, availability, SEO overrides). Fetched once per
 * page load, combined by the Profile page with the *live draft* values of
 * the fields that ARE edited here (name/title/bio/city/locality/image/
 * years-experience/contact/social/publish-status) via
 * evaluatePortfolioContentReadiness() — never a second, competing
 * readiness algorithm (§3). Reuses the exact same owner-scoped list*
 * functions as getSeoOverview (Phase 3F.4/3F.9), not a new data source.
 */
export interface OwnPortfolioReadinessContext {
  robotsIndex: boolean;
  activeServiceCount: number;
  serviceAreaCount: number;
  publishedGalleryImageCount: number;
  galleryImagesWithAltCount: number;
  publishedBeforeAfterCount: number;
  publishedReviewCount: number;
  publishedFaqCount: number;
  publishedVideoCount: number;
  availabilityConfigured: boolean;
  seoTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
}

export async function getOwnPortfolioReadinessContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<OwnPortfolioReadinessContext> {
  const [
    { listOwnServices },
    { listOwnServiceAreas },
    { listOwnPortfolioItems },
    { listOwnBeforeAfterItems },
    { listOwnReviews },
    { listOwnFaqs },
    { listOwnVideos },
    { getOwnAvailability },
    { getOwnSeo },
  ] = await Promise.all([
    import("./services.server"),
    import("./service-areas.server"),
    import("./gallery.server"),
    import("./before-after.server"),
    import("./reviews.server"),
    import("./faqs.server"),
    import("./videos.server"),
    import("./availability.server"),
    import("./seo.server"),
  ]);

  const [
    services,
    serviceAreas,
    galleryItems,
    beforeAfterItems,
    reviews,
    faqs,
    videos,
    availability,
    seo,
  ] = await Promise.all([
    listOwnServices(supabase, userId),
    listOwnServiceAreas(supabase, userId),
    listOwnPortfolioItems(supabase, userId),
    listOwnBeforeAfterItems(supabase, userId),
    listOwnReviews(supabase, userId),
    listOwnFaqs(supabase, userId),
    listOwnVideos(supabase, userId),
    getOwnAvailability(supabase, userId),
    getOwnSeo(supabase, userId),
  ]);

  const { buildOpeningHoursSpecification } = await import("@/lib/seo-helpers");
  const publishedGalleryImages = galleryItems
    .filter((item) => item.is_published)
    .flatMap((item) => item.images);

  return {
    robotsIndex: seo?.robots_index !== false,
    activeServiceCount: services.filter((s) => s.is_active).length,
    serviceAreaCount: serviceAreas.length,
    publishedGalleryImageCount: publishedGalleryImages.length,
    galleryImagesWithAltCount: publishedGalleryImages.filter((img) => !!img.alt_text?.trim())
      .length,
    publishedBeforeAfterCount: beforeAfterItems.filter((item) => item.is_published).length,
    publishedReviewCount: reviews.filter((r) => r.is_published).length,
    publishedFaqCount: faqs.filter((f) => f.is_published).length,
    publishedVideoCount: videos.filter((v) => v.is_published).length,
    availabilityConfigured: buildOpeningHoursSpecification(availability?.working_hours).length > 0,
    seoTitle: seo?.seo_title ?? null,
    metaDescription: seo?.meta_description ?? null,
    canonicalUrl: seo?.canonical_url ?? null,
  };
}
