// Server-only. Read-only Supabase data-access layer for the public
// service-detail SEO landing page (/portfolio/{profileSlug}/services/
// {serviceSlug}). Same conventions as portfolio-query.server.ts: reuses
// the shared anon/RLS-scoped client (createReadOnlyClient), never the
// service-role key, so results are naturally profile-scoped by the
// existing public-read policies — Profile A can never receive Profile B's
// service/media/review data through this file.
import {
  createReadOnlyClient,
  PUBLIC_BEAUTICIAN_PROFILE_COLUMNS,
  type PublicBeauticianProfile,
} from "./portfolio-query.server";
import { resolveServiceSlug } from "@/lib/seo-helpers";
import type { Json, Tables } from "@/integrations/supabase/types";

export interface ServicePageBundle {
  profile: PublicBeauticianProfile;
  seo: Tables<"portfolio_seo"> | null;
  service: Tables<"services">;
  /** Every other active service on this profile (current service excluded
   * by the route component) — real "Other services" links, no inference
   * (Phase 3F.6 §20/§21). Already fetched as part of the existing
   * `servicesRes` query below; not a new query. */
  otherServices: Tables<"services">[];
  serviceAreas: Tables<"service_areas">[];
  reviews: Tables<"reviews">[];
  /** Real, already-stored appointment/travel configuration (Phase 3F.6
   * §17) — never inferred, never a fabricated claim. */
  appointmentType: Tables<"availability_settings">["appointment_type"] | null;
  travelAvailable: boolean;
  /** Only gallery/before-after items with a real `service_id` FK match —
   * never inferred from category/alt-text keywords. See §5 "RELEVANT
   * PORTFOLIO WORK" in docs/BEAUTYFOLIO-PHASE3F4-SERVICE-SEO.md. Both
   * relationships are real columns with no dashboard write path yet, so
   * these are expected to be empty for all current data until a future
   * phase adds that UI — not a bug. */
  relatedGalleryImages: (Tables<"portfolio_images"> & {
    portfolio_items: Pick<Tables<"portfolio_items">, "title" | "category"> | null;
  })[];
  relatedBeforeAfter: (Tables<"before_after_items"> & {
    images: Tables<"before_after_images">[];
  })[];
  workingHours: Json | null;
}

function throwIfError(scope: string, error: { message: string } | null) {
  if (error) {
    console.error(`[service-page-query] failed to load ${scope}`, error);
    throw new Error(`Failed to load ${scope}: ${error.message}`);
  }
}

/**
 * Fetches everything the service-detail page needs for one published
 * profile + one active service, matched by slug. Returns null when the
 * profile isn't published, the service doesn't exist/isn't active, or the
 * slug doesn't match any service on that profile — all three cases are a
 * genuine 404 (Phase 3F.4 §7 — unpublished/inactive content is never
 * publicly reachable as normal live content, unlike a merely-noindex but
 * otherwise real page).
 */
export async function getPublishedServicePage(
  profileSlug: string,
  serviceSlug: string,
): Promise<ServicePageBundle | null> {
  const supabase = createReadOnlyClient();

  const { data: profile, error: profileError } = await supabase
    .from("beautician_profiles")
    .select(PUBLIC_BEAUTICIAN_PROFILE_COLUMNS)
    .eq("slug", profileSlug)
    .eq("status", "published")
    .maybeSingle();

  throwIfError("beautician_profiles", profileError);
  if (!profile) return null;

  const bpId = profile.id;

  const [servicesRes, seoRes, serviceAreasRes, reviewsRes, availabilityRes] = await Promise.all([
    supabase.from("services").select("*").eq("beautician_profile_id", bpId).eq("is_active", true),
    supabase.from("portfolio_seo").select("*").eq("beautician_profile_id", bpId).maybeSingle(),
    supabase
      .from("service_areas")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("reviews").select("*").eq("beautician_profile_id", bpId).eq("is_published", true),
    supabase
      .from("availability_settings")
      .select("working_hours, appointment_type, travel_available")
      .eq("beautician_profile_id", bpId)
      .maybeSingle(),
  ]);

  throwIfError("services", servicesRes.error);
  throwIfError("portfolio_seo", seoRes.error);
  throwIfError("service_areas", serviceAreasRes.error);
  throwIfError("reviews", reviewsRes.error);
  throwIfError("availability_settings", availabilityRes.error);

  // Slug match happens in application code, not the query, because legacy
  // services may not have a persisted slug yet — resolveServiceSlug()
  // applies the exact same computed fallback used everywhere else this
  // phase (see its doc comment in src/lib/seo-helpers.ts).
  const service = (servicesRes.data ?? []).find((s) => resolveServiceSlug(s) === serviceSlug);
  if (!service) return null;

  const [galleryRes, beforeAfterItemsRes] = await Promise.all([
    supabase
      .from("portfolio_images")
      .select("*, portfolio_items!inner(is_published, service_id, title, category)")
      .eq("portfolio_items.service_id", service.id)
      .eq("portfolio_items.is_published", true),
    supabase
      .from("before_after_items")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("service_id", service.id)
      .eq("is_published", true),
  ]);

  throwIfError("portfolio_images (service-related)", galleryRes.error);
  throwIfError("before_after_items (service-related)", beforeAfterItemsRes.error);

  const beforeAfterItems = beforeAfterItemsRes.data ?? [];
  let relatedBeforeAfter: ServicePageBundle["relatedBeforeAfter"] = [];
  if (beforeAfterItems.length > 0) {
    const { data: images, error: imagesError } = await supabase
      .from("before_after_images")
      .select("*")
      .in(
        "before_after_id",
        beforeAfterItems.map((i) => i.id),
      );
    throwIfError("before_after_images (service-related)", imagesError);
    relatedBeforeAfter = beforeAfterItems.map((item) => ({
      ...item,
      images: (images ?? []).filter((img) => img.before_after_id === item.id),
    }));
  }

  return {
    profile,
    seo: seoRes.data,
    service,
    otherServices: (servicesRes.data ?? []).filter((s) => s.id !== service.id),
    serviceAreas: serviceAreasRes.data ?? [],
    reviews: reviewsRes.data ?? [],
    relatedGalleryImages: (galleryRes.data ?? []) as ServicePageBundle["relatedGalleryImages"],
    relatedBeforeAfter,
    appointmentType: availabilityRes.data?.appointment_type ?? null,
    travelAvailable: availabilityRes.data?.travel_available ?? false,
    workingHours: availabilityRes.data?.working_hours ?? null,
  };
}

export interface SitemapServiceEntry {
  profileSlug: string;
  serviceSlug: string;
  updatedAt: string;
}

/**
 * One efficient join query for sitemap eligibility — mirrors
 * listSitemapPortfolios()'s shape/reasoning exactly. Applies the same
 * evaluateServiceIndexability() rule used by the public route and the
 * /dashboard/seo readiness list, so the sitemap can never disagree with
 * what the page itself actually serves as index/noindex.
 */
export async function listSitemapServicePages(): Promise<SitemapServiceEntry[]> {
  const supabase = createReadOnlyClient();
  const { evaluateServiceIndexability } = await import("@/lib/seo-helpers");

  const { data, error } = await supabase
    .from("services")
    .select(
      "name, slug, short_description, description, updated_at, beautician_profiles!inner(slug, primary_city, status, portfolio_seo(robots_index))",
    )
    .eq("is_active", true)
    .eq("beautician_profiles.status", "published");

  if (error) {
    console.error("[service-page-query] failed to list sitemap service pages", error);
    throw new Error(`Failed to load sitemap service data: ${error.message}`);
  }

  const entries: SitemapServiceEntry[] = [];
  for (const row of data ?? []) {
    const bp = Array.isArray(row.beautician_profiles)
      ? row.beautician_profiles[0]
      : row.beautician_profiles;
    if (!bp?.slug) continue;
    const seoRow = Array.isArray(bp.portfolio_seo) ? bp.portfolio_seo[0] : bp.portfolio_seo;

    const { indexable } = evaluateServiceIndexability({
      profileRobotsIndex: seoRow?.robots_index !== false,
      primaryCity: bp.primary_city,
      serviceDescription: row.short_description ?? row.description,
      hasPersistedSlug: !!row.slug,
    });
    if (!indexable) continue;

    entries.push({
      profileSlug: bp.slug,
      serviceSlug: resolveServiceSlug(row),
      updatedAt: row.updated_at,
    });
  }
  return entries;
}
