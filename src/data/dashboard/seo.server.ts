// Server-only. Owner-scoped `portfolio_seo` read/upsert for the Portfolio
// Builder. RLS (owns_beautician_profile()) enforces ownership — already
// correct and unchanged, confirmed in the Phase 2 Step 2A audit. Same
// single-record upsert pattern as availability.server.ts: no row is
// auto-created at signup, so writes always upsert on the unique
// beautician_profile_id, which also guarantees the 1:1 relationship can
// never produce a duplicate row.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";
import {
  resolvePrimaryService,
  buildDefaultSeoTitle,
  buildDefaultMetaDescription,
  buildOpeningHoursSpecification,
  buildPrimarySearchTarget,
  buildSameAs,
  evaluatePortfolioContentReadiness,
  evaluateServiceContentReadiness,
  resolveServiceSlug,
  type PortfolioReadiness,
  type ServiceContentReadinessState,
} from "@/lib/seo-helpers";

export async function getOwnSeo(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"portfolio_seo"> | null> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { data, error } = await supabase
    .from("portfolio_seo")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load SEO settings: ${error.message}`);
  return data;
}

export type SeoInput = Pick<
  TablesInsert<"portfolio_seo">,
  | "seo_title"
  | "meta_description"
  | "canonical_url"
  | "og_title"
  | "og_description"
  | "og_image_url"
  | "primary_keyword"
  | "robots_index"
  | "robots_follow"
>;

export async function saveOwnSeo(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SeoInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { error } = await supabase
    .from("portfolio_seo")
    .upsert({ ...input, beautician_profile_id: bpId }, { onConflict: "beautician_profile_id" });

  if (error) throw new Error(`Failed to save SEO settings: ${error.message}`);
}

export interface SeoOverview {
  slug: string;
  isPublished: boolean;
  publicPath: string;
  primaryServiceName: string | null;
  primaryCity: string | null;
  primarySearchTarget: string | null;
  /** Active services other than the resolved primary one — shown as
   * "related portfolio context" alongside the primary search target
   * (Phase 3F.3 §17), never a keyword list. */
  secondaryServiceNames: string[];
  serviceAreaNames: string[];
  /** One row per service, active or not — "Service Search Pages" list on
   * /dashboard/seo (Phase 3F.4 §24, extended Phase 3F.8 §26 to also surface
   * unpublished services rather than silently omitting them). `path` is
   * only meaningful when `state === "ready"`; a needs-improvement service
   * page still exists and is reachable, it just isn't included in search
   * results yet. Uses the same shared evaluateServiceContentReadiness() as
   * /dashboard/services and the public route's robots directive, so this
   * list can never disagree with what's actually served (§14). */
  servicePages: {
    name: string;
    path: string;
    state: ServiceContentReadinessState;
    reasons: string[];
  }[];
  /** Tally of the servicePages states above, for the compact "3 Ready / 1
   * Needs details / 1 Hidden" summary line (Phase 3F.9 §18) — consumes the
   * existing per-service results rather than recomputing anything. */
  servicePagesSummary: { ready: number; needsImprovement: number; notEligible: number };
  defaultSeoTitle: string;
  defaultMetaDescription: string;
  seo: Tables<"portfolio_seo"> | null;
  /** The one authoritative portfolio readiness result (Phase 3F.9 §3) —
   * shared verbatim with /dashboard/profile's readiness panel and the
   * public route's robots directive/sitemap eligibility (§14/§23). */
  readiness: PortfolioReadiness;
}

/**
 * The one place that assembles everything the SEO dashboard needs. Reads
 * ONLY existing owner-scoped data sources (profile, services, service
 * areas, gallery, before/after, reviews, FAQs, and the portfolio_seo
 * overrides table) — nothing here is a new/duplicated data source, per the
 * Phase 3F.1 ownership model: SEO reads from where the data already lives.
 */
export async function getSeoOverview(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SeoOverview> {
  const [
    { getOwnProfile },
    { listOwnServices },
    { listOwnServiceAreas },
    { listOwnPortfolioItems },
    { listOwnBeforeAfterItems },
    { listOwnReviews },
    { listOwnFaqs },
    { listOwnVideos },
    { getOwnAvailability },
  ] = await Promise.all([
    import("./profile.server"),
    import("./services.server"),
    import("./service-areas.server"),
    import("./gallery.server"),
    import("./before-after.server"),
    import("./reviews.server"),
    import("./faqs.server"),
    import("./videos.server"),
    import("./availability.server"),
  ]);

  const [
    profile,
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
    getOwnProfile(supabase, userId),
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

  const primaryServiceName = resolvePrimaryService(services);
  const secondaryServiceNames = services
    .filter((s) => s.is_active && s.name !== primaryServiceName)
    .map((s) => s.name);
  const serviceAreaNames = serviceAreas.map((a) => a.area_name ?? a.city);
  const publishedReviewCount = reviews.filter((r) => r.is_published).length;

  const linkedWorkCountByService = new Map<string, number>();
  const bumpLinkedWork = (serviceId: string | null) => {
    if (!serviceId) return;
    linkedWorkCountByService.set(serviceId, (linkedWorkCountByService.get(serviceId) ?? 0) + 1);
  };
  for (const item of galleryItems) bumpLinkedWork(item.service_id);
  for (const item of beforeAfterItems) bumpLinkedWork(item.service_id);

  const servicePages = services.map((s) => {
    const { state, criticalReasons } = evaluateServiceContentReadiness({
      profileIsPublished: profile.status === "published",
      profileRobotsIndex: seo?.robots_index !== false,
      serviceIsActive: s.is_active,
      serviceName: s.name,
      serviceCategory: s.category,
      serviceHasPersistedSlug: !!s.slug,
      primaryCity: profile.primary_city,
      serviceDescription: s.short_description ?? s.description,
      priceConfigured: s.price_type === "custom_quote" || s.price != null,
      durationEntered: s.duration_minutes != null,
      includedItemsCount: s.included_items.length,
      suitableForCount: s.suitable_for.length,
      hasPreparationNotes: !!s.preparation_notes?.trim(),
      linkedWorkCount: linkedWorkCountByService.get(s.id) ?? 0,
      publishedReviewCount,
      serviceAreaCount: serviceAreas.length,
    });
    return {
      name: s.name,
      path: `/portfolio/${profile.slug}/services/${resolveServiceSlug(s)}`,
      state,
      reasons: criticalReasons,
    };
  });
  const hasValidSocialLink =
    buildSameAs({
      instagramUrl: profile.instagram_url,
      facebookUrl: profile.facebook_url,
      youtubeUrl: profile.youtube_url,
      websiteUrl: profile.website_url,
    }).length > 0;

  const publishedGalleryImages = galleryItems
    .filter((item) => item.is_published)
    .flatMap((item) => item.images);
  const publishedBeforeAfterCount = beforeAfterItems.filter((item) => item.is_published).length;
  const publishedFaqCount = faqs.filter((f) => f.is_published).length;

  const profileForTitle = {
    name: profile.display_name,
    role: profile.professional_title ?? "Beauty Professional",
    primaryCity: profile.primary_city ?? "",
    specializations: [] as string[],
  };

  const defaultSeoTitle = buildDefaultSeoTitle(profileForTitle, primaryServiceName);
  const defaultMetaDescription = buildDefaultMetaDescription(profileForTitle, primaryServiceName);
  const primarySearchTarget = buildPrimarySearchTarget(profileForTitle, primaryServiceName);

  const readiness = evaluatePortfolioContentReadiness({
    isPublished: profile.status === "published",
    robotsIndex: seo?.robots_index !== false,
    professionalName: profile.display_name,
    professionalTitle: profile.professional_title,
    primaryCity: profile.primary_city,
    bio: profile.bio,
    hasProfileImage: !!profile.profile_image_url,
    activeServiceCount: services.filter((s) => s.is_active).length,
    locality: profile.locality,
    serviceAreaCount: serviceAreas.length,
    isVerified: profile.is_verified,
    yearsExperience: profile.years_experience,
    publishedGalleryImageCount: publishedGalleryImages.length,
    galleryImagesWithAltCount: publishedGalleryImages.filter((img) => !!img.alt_text?.trim())
      .length,
    publishedBeforeAfterCount,
    publishedReviewCount,
    publishedFaqCount,
    publishedVideoCount: videos.filter((v) => v.is_published).length,
    hasValidSocialLink,
    hasContactInfo: !!(profile.phone || profile.email || profile.whatsapp_number),
    availabilityConfigured: buildOpeningHoursSpecification(availability?.working_hours).length > 0,
    seoTitle: seo?.seo_title ?? defaultSeoTitle,
    metaDescription: seo?.meta_description ?? defaultMetaDescription,
    canonicalUrl: seo?.canonical_url ?? null,
  });

  const servicePagesSummary = servicePages.reduce(
    (acc, sp) => {
      if (sp.state === "ready") acc.ready += 1;
      else if (sp.state === "needs_improvement") acc.needsImprovement += 1;
      else acc.notEligible += 1;
      return acc;
    },
    { ready: 0, needsImprovement: 0, notEligible: 0 },
  );

  return {
    slug: profile.slug,
    isPublished: profile.status === "published",
    publicPath: `/portfolio/${profile.slug}`,
    primaryServiceName,
    primaryCity: profile.primary_city,
    primarySearchTarget,
    secondaryServiceNames,
    serviceAreaNames,
    servicePages,
    servicePagesSummary,
    defaultSeoTitle,
    defaultMetaDescription,
    seo,
    readiness,
  };
}
