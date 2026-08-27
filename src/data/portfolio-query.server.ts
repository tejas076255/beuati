// Server-only. Read-only Supabase data-access layer for the public portfolio route.
// Uses the existing anon/publishable key so results are naturally scoped by the
// existing RLS policies (public read of *published* portfolios only) — this file
// never bypasses RLS and never uses the service-role key.
//
// Load this only from server handlers (server functions / *.server.ts modules),
// same convention as client.server.ts — never import it from a route/component
// file directly, or it ships to the client bundle.
import { createClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export function createReadOnlyClient() {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing Supabase environment variable(s) for server-side portfolio query: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Phase 3I.3 — explicit public-safe column allow-list for beautician_profiles
// reads on public routes, replacing a broad select("*"). Every field here
// has a proven consumer in the public portfolio/service-page mapper, the
// SEO/JSON-LD builder, or a public CTA (audited against portfolio-mapper.ts,
// portfolio.$slug.tsx's buildHead(), and portfolio.$slug_.services.
// $serviceSlug.tsx). Excluded on purpose: profile_id, cover_image_url,
// rating, review_count, client_count, metrics_verified, is_demo, latitude,
// longitude, status, is_published, published_at, created_at, updated_at,
// is_featured — none of these are read by any public consumer (rating/
// review_count in particular must never be read here; the public rating
// always comes from computeAggregateRating() over real published reviews,
// never these legacy columns). `id` is retained — it's the join key every
// subsequent query in this bundle uses as `beautician_profile_id`.
//
// This is a data-minimization / least-privilege change to the columns this
// application code requests. It does NOT change the underlying RLS policy
// or table grants — see the Phase 3I.3 report for the honest limitation
// this leaves around direct anonymous REST access to the full row.
export const PUBLIC_BEAUTICIAN_PROFILE_COLUMNS =
  "id, slug, business_name, display_name, professional_title, short_tagline, bio, bio_secondary, profile_image_url, primary_city, locality, state, country, years_experience, phone, whatsapp_number, email, instagram_url, facebook_url, youtube_url, website_url, address, working_hours, travel_note, map_query, about_highlights, why_choose_points, is_verified" as const;

/** The narrowed row shape `PUBLIC_BEAUTICIAN_PROFILE_COLUMNS` actually
 * returns — keeps every public-route consumer honest at compile time
 * about which columns genuinely exist, instead of the full (43-column)
 * `Tables<"beautician_profiles">` shape implying access to fields that
 * were never fetched. */
export type PublicBeauticianProfile = Pick<
  Tables<"beautician_profiles">,
  | "id"
  | "slug"
  | "business_name"
  | "display_name"
  | "professional_title"
  | "short_tagline"
  | "bio"
  | "bio_secondary"
  | "profile_image_url"
  | "primary_city"
  | "locality"
  | "state"
  | "country"
  | "years_experience"
  | "phone"
  | "whatsapp_number"
  | "email"
  | "instagram_url"
  | "facebook_url"
  | "youtube_url"
  | "website_url"
  | "address"
  | "working_hours"
  | "travel_note"
  | "map_query"
  | "about_highlights"
  | "why_choose_points"
  | "is_verified"
>;

export interface PortfolioBundle {
  profile: PublicBeauticianProfile;
  specializations: Tables<"specializations">[];
  services: Tables<"services">[];
  packages: Tables<"packages">[];
  portfolioItems: (Tables<"portfolio_items"> & { images: Tables<"portfolio_images">[] })[];
  beforeAfter: (Tables<"before_after_items"> & { images: Tables<"before_after_images">[] })[];
  videos: Tables<"portfolio_videos">[];
  reviews: Tables<"reviews">[];
  serviceAreas: Tables<"service_areas">[];
  availability: Tables<"availability_settings"> | null;
  blockedDates: Tables<"availability_blocked_dates">[];
  faqs: Tables<"faqs">[];
  seo: Tables<"portfolio_seo"> | null;
}

function throwIfError(scope: string, slug: string, error: { message: string } | null) {
  if (error) {
    console.error(`[portfolio-query] failed to load ${scope} for slug "${slug}"`, error);
    throw new Error(`Failed to load ${scope}: ${error.message}`);
  }
}

/**
 * Fetches a fully-assembled, read-only portfolio bundle for a published
 * beautician profile by slug.
 *
 * Returns `null` when the profile does not exist OR is not published — the
 * two cases are indistinguishable by design (the RLS policy + explicit
 * `status = 'published'` filter never reveal whether an unpublished slug
 * exists), so this function must never be used to tell those apart.
 *
 * Throws on genuine query/connectivity failures so callers can log/handle
 * them distinctly from a legitimate "not found".
 */
export async function getPublishedPortfolioBySlug(slug: string): Promise<PortfolioBundle | null> {
  const supabase = createReadOnlyClient();

  const { data: profile, error: profileError } = await supabase
    .from("beautician_profiles")
    .select(PUBLIC_BEAUTICIAN_PROFILE_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  throwIfError("beautician_profiles", slug, profileError);
  if (!profile) return null;

  const bpId = profile.id;

  const [
    bspecRes,
    servicesRes,
    packagesRes,
    portfolioItemsRes,
    beforeAfterItemsRes,
    videosRes,
    reviewsRes,
    serviceAreasRes,
    availabilityRes,
    blockedDatesRes,
    faqsRes,
    seoRes,
  ] = await Promise.all([
    supabase
      .from("beautician_specializations")
      .select("specialization_id, sort_order")
      .eq("beautician_profile_id", bpId)
      .order("sort_order"),
    supabase
      .from("services")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("packages")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("portfolio_items")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("is_published", true)
      .order("sort_order"),
    supabase
      .from("before_after_items")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("is_published", true)
      .order("sort_order"),
    supabase
      .from("portfolio_videos")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("is_published", true)
      .order("sort_order"),
    supabase
      .from("reviews")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("is_published", true)
      .order("review_date", { ascending: false }),
    supabase
      .from("service_areas")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("availability_settings")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .maybeSingle(),
    supabase
      .from("availability_blocked_dates")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .order("blocked_date"),
    supabase
      .from("faqs")
      .select("*")
      .eq("beautician_profile_id", bpId)
      .eq("is_published", true)
      .order("sort_order"),
    supabase.from("portfolio_seo").select("*").eq("beautician_profile_id", bpId).maybeSingle(),
  ]);

  throwIfError("beautician_specializations", slug, bspecRes.error);
  throwIfError("services", slug, servicesRes.error);
  throwIfError("packages", slug, packagesRes.error);
  throwIfError("portfolio_items", slug, portfolioItemsRes.error);
  throwIfError("before_after_items", slug, beforeAfterItemsRes.error);
  throwIfError("portfolio_videos", slug, videosRes.error);
  throwIfError("reviews", slug, reviewsRes.error);
  throwIfError("service_areas", slug, serviceAreasRes.error);
  throwIfError("availability_settings", slug, availabilityRes.error);
  throwIfError("availability_blocked_dates", slug, blockedDatesRes.error);
  throwIfError("faqs", slug, faqsRes.error);
  throwIfError("portfolio_seo", slug, seoRes.error);

  const specializationIds = (bspecRes.data ?? []).map((r) => r.specialization_id);
  let specializations: Tables<"specializations">[] = [];
  if (specializationIds.length > 0) {
    const { data: specRows, error: specError } = await supabase
      .from("specializations")
      .select("*")
      .in("id", specializationIds);
    throwIfError("specializations", slug, specError);
    const bySpecId = new Map((specRows ?? []).map((s) => [s.id, s]));
    specializations = specializationIds
      .map((id) => bySpecId.get(id))
      .filter((s): s is Tables<"specializations"> => s != null);
  }

  const portfolioItems = portfolioItemsRes.data ?? [];
  const beforeAfterItems = beforeAfterItemsRes.data ?? [];

  const portfolioImagesByItem = new Map<string, Tables<"portfolio_images">[]>();
  if (portfolioItems.length > 0) {
    const { data: images, error: imagesError } = await supabase
      .from("portfolio_images")
      .select("*")
      .in(
        "portfolio_item_id",
        portfolioItems.map((i) => i.id),
      )
      .order("sort_order");
    throwIfError("portfolio_images", slug, imagesError);
    for (const img of images ?? []) {
      const list = portfolioImagesByItem.get(img.portfolio_item_id) ?? [];
      list.push(img);
      portfolioImagesByItem.set(img.portfolio_item_id, list);
    }
  }

  const beforeAfterImagesByItem = new Map<string, Tables<"before_after_images">[]>();
  if (beforeAfterItems.length > 0) {
    const { data: images, error: imagesError } = await supabase
      .from("before_after_images")
      .select("*")
      .in(
        "before_after_id",
        beforeAfterItems.map((i) => i.id),
      )
      .order("sort_order");
    throwIfError("before_after_images", slug, imagesError);
    for (const img of images ?? []) {
      const list = beforeAfterImagesByItem.get(img.before_after_id) ?? [];
      list.push(img);
      beforeAfterImagesByItem.set(img.before_after_id, list);
    }
  }

  return {
    profile,
    specializations,
    services: servicesRes.data ?? [],
    packages: packagesRes.data ?? [],
    portfolioItems: portfolioItems.map((item) => ({
      ...item,
      images: portfolioImagesByItem.get(item.id) ?? [],
    })),
    beforeAfter: beforeAfterItems.map((item) => ({
      ...item,
      images: beforeAfterImagesByItem.get(item.id) ?? [],
    })),
    videos: videosRes.data ?? [],
    reviews: reviewsRes.data ?? [],
    serviceAreas: serviceAreasRes.data ?? [],
    availability: availabilityRes.data ?? null,
    blockedDates: blockedDatesRes.data ?? [],
    faqs: faqsRes.data ?? [],
    seo: seoRes.data ?? null,
  };
}

export interface SitemapEntry {
  slug: string;
  /** beautician_profiles.updated_at — the only trustworthy, always-present
   * modification timestamp available without an expensive cross-table
   * aggregate (see docs/BEAUTYFOLIO-PHASE3F2A-SEO-INFRASTRUCTURE.md §8-9).
   * Reflects changes to the profile row itself, not gallery/review/service
   * edits — a partial but honest signal, never fabricated. */
  updatedAt: string;
}

/**
 * One efficient set of queries for sitemap eligibility: published profiles
 * with a real slug, gated by the exact same evaluatePortfolioIndexability()
 * rule the public route's robots directive uses (Phase 3F.9 §23) — never a
 * second, competing indexability check. Fetches only the required-signal
 * fields plus one batched active-service count per profile (no N+1, §28),
 * not every recommended/trust signal, since only the required set can ever
 * change `indexable`. Uses the same anon/RLS-scoped client as every other
 * public read here — RLS already restricts `beautician_profiles`/
 * `portfolio_seo` reads to published profiles for this client, so this can
 * never leak an unpublished or draft profile even if the WHERE clause below
 * were removed; the explicit filters are kept anyway for a single clear,
 * self-documenting query rather than relying on RLS silently narrowing an
 * unfiltered `select("*")`.
 */
export async function listSitemapPortfolios(): Promise<SitemapEntry[]> {
  const supabase = createReadOnlyClient();
  const { evaluatePortfolioIndexability } = await import("@/lib/seo-helpers");

  const { data, error } = await supabase
    .from("beautician_profiles")
    .select(
      "id, slug, updated_at, display_name, professional_title, primary_city, bio, portfolio_seo(robots_index)",
    )
    .eq("status", "published")
    .not("slug", "is", null);

  if (error) {
    console.error("[portfolio-query] failed to list sitemap portfolios", error);
    throw new Error(`Failed to load sitemap data: ${error.message}`);
  }

  const profiles = (data ?? []).filter((row) => row.slug && row.slug.trim().length > 0);
  if (profiles.length === 0) return [];

  const { data: activeServices, error: servicesError } = await supabase
    .from("services")
    .select("beautician_profile_id")
    .eq("is_active", true)
    .in(
      "beautician_profile_id",
      profiles.map((p) => p.id),
    );

  if (servicesError) {
    console.error("[portfolio-query] failed to load active service counts", servicesError);
    throw new Error(`Failed to load sitemap data: ${servicesError.message}`);
  }

  const activeServiceCountByProfile = new Map<string, number>();
  for (const row of activeServices ?? []) {
    activeServiceCountByProfile.set(
      row.beautician_profile_id,
      (activeServiceCountByProfile.get(row.beautician_profile_id) ?? 0) + 1,
    );
  }

  return profiles
    .filter((row) => {
      const seoRow = Array.isArray(row.portfolio_seo) ? row.portfolio_seo[0] : row.portfolio_seo;
      const { indexable } = evaluatePortfolioIndexability({
        isPublished: true,
        robotsIndex: seoRow?.robots_index !== false,
        professionalName: row.display_name,
        professionalTitle: row.professional_title,
        primaryCity: row.primary_city,
        bio: row.bio,
        activeServiceCount: activeServiceCountByProfile.get(row.id) ?? 0,
      });
      return indexable;
    })
    .map((row) => ({ slug: row.slug as string, updatedAt: row.updated_at }));
}
