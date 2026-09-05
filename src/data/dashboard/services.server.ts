// Server-only. Owner-scoped `services` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";
import { slugify } from "@/lib/slugify";
import { evaluateServiceContentReadiness, type ServiceContentReadiness } from "@/lib/seo-helpers";
import {
  MAX_INCLUDED_ITEMS,
  MAX_LIST_ITEM_LENGTH,
  MAX_PREPARATION_NOTES_LENGTH,
  MAX_SUITABLE_FOR_ITEMS,
} from "@/lib/service-limits";

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

/**
 * Server-side authoritative validation (Phase 3F.8 §29) — mirrors the
 * dashboard's zod schema exactly, but never trusts the browser alone.
 * Only validates fields that are actually present in a (possibly partial)
 * update payload, matching updateService's partial-update contract.
 */
function validateServiceContent(input: Partial<ServiceInput>): void {
  if (input.price_type !== undefined) {
    const price = input.price ?? null;
    if (input.price_type === "custom_quote") {
      if (price != null && !(price > 0)) {
        throw new Error("Enter a price greater than ₹0, or leave blank for Custom quote.");
      }
    } else if (price == null || !(price > 0)) {
      throw new Error("Enter a price greater than ₹0, or choose Custom quote.");
    }
  }
  if (input.duration_minutes !== undefined && input.duration_minutes != null) {
    if (!Number.isInteger(input.duration_minutes) || input.duration_minutes <= 0) {
      throw new Error("Duration must be a positive number of minutes, or left blank.");
    }
  }
  if (input.preparation_notes !== undefined && input.preparation_notes != null) {
    if (input.preparation_notes.length > MAX_PREPARATION_NOTES_LENGTH) {
      throw new Error(
        `Preparation notes must be ${MAX_PREPARATION_NOTES_LENGTH} characters or fewer.`,
      );
    }
  }
  const listChecks: [keyof ServiceInput, number][] = [
    ["included_items", MAX_INCLUDED_ITEMS],
    ["suitable_for", MAX_SUITABLE_FOR_ITEMS],
  ];
  for (const [field, max] of listChecks) {
    const list = input[field] as string[] | undefined;
    if (list === undefined) continue;
    if (list.length > max) throw new Error(`You can add up to ${max} items.`);
    if (list.some((item) => item.length > MAX_LIST_ITEM_LENGTH)) {
      throw new Error(`Each item must be ${MAX_LIST_ITEM_LENGTH} characters or fewer.`);
    }
  }
}

// Phase 5.2A — bpId-parameterized core query, shared by both the
// beautician's own-profile path (listOwnServices, below) and the Master
// Admin Console's explicit-target path (src/data/admin/services.server.ts).
// This is the ONE query both callers use — never a duplicated/forked copy.
export async function listServicesForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<Tables<"services">[]> {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load services: ${error.message}`);
  return data ?? [];
}

export async function listOwnServices(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"services">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return listServicesForProfile(supabase, bpId);
}

export type ServiceInput = Pick<
  TablesInsert<"services">,
  | "name"
  | "category"
  | "short_description"
  | "price"
  | "price_type"
  | "duration_minutes"
  // Phase 3F.7 service-detail enrichment — additive, optional, no defaults.
  | "included_items"
  | "suitable_for"
  | "preparation_notes"
  // Phase 3F.8 — publication/visibility, distinct from save validation and
  // search readiness (see seo-helpers.ts). Same "Show on my portfolio"
  // pattern already used by Gallery/Before-After (is_published there).
  | "is_active"
>;

/**
 * Generates a stable, URL-safe `slug` at creation time (Phase 3F.4 §3) —
 * required for the /portfolio/{profile}/services/{service} SEO landing
 * page. Retries with a random suffix on a unique-constraint violation
 * (23505), same pattern as `ensureOwnPortfolio()` for profile slugs.
 * Never a database UUID; never silently regenerated after this point.
 */
// Phase 5.2A — bpId-parameterized core, shared with the admin path.
// Returns the new row's id so admin callers can attach it to an audit-log
// entity_id; the beautician's own path (createService, below) ignores it.
export async function createServiceForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  input: ServiceInput,
): Promise<string> {
  validateServiceContent(input);
  const baseSlug = slugify(input.name) || "service";

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
    const { data, error } = await supabase
      .from("services")
      .insert({ ...input, beautician_profile_id: bpId, slug: candidateSlug })
      .select("id")
      .single();

    if (!error) return data.id;
    if (error.code !== "23505") throw new Error(`Failed to add service: ${error.message}`);
  }
  throw new Error("Could not generate a unique service URL — please try again.");
}

export async function createService(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: ServiceInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { assertOwnerCanCreate } = await import("./plan-enforcement.server");
  await assertOwnerCanCreate(supabase, bpId, "services");
  await createServiceForProfile(supabase, bpId, input);
}

/**
 * Updates a service. If the row already has a `slug` (the normal case for
 * every service created after Phase 3F.4), it is never touched here even
 * when the name changes — the whole point is a stable, never-silently-
 * regenerated public URL (Phase 3F.4 §3). Only a legacy row created before
 * this phase (slug still NULL) gets one backfilled now, once, using the
 * same retry-on-conflict pattern as createService.
 */
// Phase 5.2A — bpId-parameterized core, shared with the admin path.
// Explicitly re-verifies service.beautician_profile_id === bpId before
// writing (§12 of the Phase 5.2A spec) — defense-in-depth on top of RLS,
// not a replacement for it: this guards against a stale/crafted serviceId
// being sent for the wrong profile (e.g. an admin workspace open on
// Beautician A but somehow supplied a service id belonging to Beautician
// B), which RLS alone would still correctly reject, but silently, with no
// clear error distinguishing "not found" from "wrong profile."
export async function updateServiceForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  serviceId: string,
  updates: Partial<ServiceInput>,
): Promise<void> {
  validateServiceContent(updates);
  const { data: existing, error: fetchError } = await supabase
    .from("services")
    .select("slug, name, beautician_profile_id")
    .eq("id", serviceId)
    .single();
  if (fetchError || !existing) {
    throw new Error(`Failed to load service: ${fetchError?.message ?? "not found"}`);
  }
  if (existing.beautician_profile_id !== bpId) {
    throw new Error("This service does not belong to the selected profile.");
  }

  if (existing.slug) {
    const { error } = await supabase.from("services").update(updates).eq("id", serviceId);
    if (error) throw new Error(`Failed to update service: ${error.message}`);
    return;
  }

  const baseSlug = slugify(updates.name ?? existing.name) || "service";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
    const { error } = await supabase
      .from("services")
      .update({ ...updates, slug: candidateSlug })
      .eq("id", serviceId);

    if (!error) return;
    if (error.code !== "23505") throw new Error(`Failed to update service: ${error.message}`);
  }
  throw new Error("Could not generate a unique service URL — please try again.");
}

export async function updateService(
  supabase: SupabaseClient<Database>,
  userId: string,
  serviceId: string,
  updates: Partial<ServiceInput>,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await updateServiceForProfile(supabase, bpId, serviceId, updates);
}

export async function deleteServiceForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  serviceId: string,
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("services")
    .select("beautician_profile_id")
    .eq("id", serviceId)
    .single();
  if (fetchError || !existing) {
    throw new Error(`Failed to load service: ${fetchError?.message ?? "not found"}`);
  }
  if (existing.beautician_profile_id !== bpId) {
    throw new Error("This service does not belong to the selected profile.");
  }

  const { error } = await supabase.from("services").delete().eq("id", serviceId);
  if (error) throw new Error(`Failed to delete service: ${error.message}`);
}

export async function deleteService(
  supabase: SupabaseClient<Database>,
  userId: string,
  serviceId: string,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await deleteServiceForProfile(supabase, bpId, serviceId);
}

/**
 * The subset of readiness inputs that never change while a service dialog
 * is open — profile/account-level facts and other-table signals (Phase
 * 3F.8A §3). Draft/in-dialog values (name, description, price, is_active,
 * lists, …) are supplied live by the dialog itself on top of this context,
 * reusing the exact same evaluateServiceContentReadiness() the server used
 * to compute the persisted `readiness` below — never a second algorithm.
 */
export interface ServiceReadinessContext {
  profileIsPublished: boolean;
  profileRobotsIndex: boolean;
  primaryCity: string | null;
  publishedReviewCount: number;
  serviceAreaCount: number;
}

export interface OwnServiceWithReadiness {
  service: Tables<"services">;
  /** Computed from persisted server data only — drives the service card
   * badge and must always agree with /dashboard/seo, robots and the
   * sitemap (Phase 3F.8 §14). Never mutated by in-dialog draft edits. */
  readiness: ServiceContentReadiness;
  /** Real Gallery/Before-After service_id link count for this service —
   * exposed separately so the dialog's live preview can reuse it (this
   * phase never allows editing links from inside the Service dialog). */
  linkedWorkCount: number;
}

export interface OwnServicesOverview {
  services: OwnServiceWithReadiness[];
  readinessContext: ServiceReadinessContext;
}

/**
 * Phase 5.2A — pure assembly step, extracted so both the own-profile path
 * (listOwnServicesWithReadiness, below) and the admin path
 * (src/data/admin/services.server.ts, which gathers the same shape of
 * inputs via its own explicit-bpId queries rather than importing 6 other
 * "own"-scoped modules) compute readiness identically — one algorithm,
 * never a fork. Takes already-fetched rows, does no querying itself.
 */
export function buildServicesWithReadiness(
  services: Tables<"services">[],
  readinessContext: ServiceReadinessContext,
  galleryServiceIds: (string | null)[],
  beforeAfterServiceIds: (string | null)[],
): OwnServiceWithReadiness[] {
  const linkedWorkCountByService = new Map<string, number>();
  const bump = (serviceId: string | null) => {
    if (!serviceId) return;
    linkedWorkCountByService.set(serviceId, (linkedWorkCountByService.get(serviceId) ?? 0) + 1);
  };
  for (const id of galleryServiceIds) bump(id);
  for (const id of beforeAfterServiceIds) bump(id);

  return services.map((service) => {
    const linkedWorkCount = linkedWorkCountByService.get(service.id) ?? 0;
    return {
      service,
      linkedWorkCount,
      readiness: evaluateServiceContentReadiness({
        profileIsPublished: readinessContext.profileIsPublished,
        profileRobotsIndex: readinessContext.profileRobotsIndex,
        primaryCity: readinessContext.primaryCity,
        publishedReviewCount: readinessContext.publishedReviewCount,
        serviceAreaCount: readinessContext.serviceAreaCount,
        serviceIsActive: service.is_active,
        serviceName: service.name,
        serviceCategory: service.category,
        serviceHasPersistedSlug: !!service.slug,
        serviceDescription: service.short_description ?? service.description,
        priceConfigured: service.price_type === "custom_quote" || service.price != null,
        durationEntered: service.duration_minutes != null,
        includedItemsCount: service.included_items.length,
        suitableForCount: service.suitable_for.length,
        hasPreparationNotes: !!service.preparation_notes?.trim(),
        linkedWorkCount,
      }),
    };
  });
}

/**
 * Everything /dashboard/services needs to render both the service list and
 * each service's readiness, in a fixed small number of batched queries
 * regardless of how many services exist (Phase 3F.8 §32). Reuses the exact
 * same owner-scoped list functions already used by getSeoOverview
 * (Phase 3F.4) — not a second, competing data source (§14). The actual
 * readiness computation is buildServicesWithReadiness() above, shared with
 * the admin path.
 */
export async function listOwnServicesWithReadiness(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<OwnServicesOverview> {
  const [
    { getOwnProfile },
    { getOwnSeo },
    { listOwnServiceAreas },
    { listOwnReviews },
    { listOwnPortfolioItems },
    { listOwnBeforeAfterItems },
  ] = await Promise.all([
    import("./profile.server"),
    import("./seo.server"),
    import("./service-areas.server"),
    import("./reviews.server"),
    import("./gallery.server"),
    import("./before-after.server"),
  ]);

  const [services, profile, seo, serviceAreas, reviews, galleryItems, beforeAfterItems] =
    await Promise.all([
      listOwnServices(supabase, userId),
      getOwnProfile(supabase, userId),
      getOwnSeo(supabase, userId),
      listOwnServiceAreas(supabase, userId),
      listOwnReviews(supabase, userId),
      listOwnPortfolioItems(supabase, userId),
      listOwnBeforeAfterItems(supabase, userId),
    ]);

  const readinessContext: ServiceReadinessContext = {
    profileIsPublished: profile.status === "published",
    profileRobotsIndex: seo?.robots_index !== false,
    primaryCity: profile.primary_city,
    publishedReviewCount: reviews.filter((r) => r.is_published).length,
    serviceAreaCount: serviceAreas.length,
  };

  return {
    services: buildServicesWithReadiness(
      services,
      readinessContext,
      galleryItems.map((i) => i.service_id),
      beforeAfterItems.map((i) => i.service_id),
    ),
    readinessContext,
  };
}
