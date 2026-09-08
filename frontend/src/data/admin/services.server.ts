// Server-only. Master Admin Console — Services pilot (Phase 5.2A).
//
// Admin never impersonates the beautician: every function here runs under
// the ADMIN's own authenticated session (assertIsAdmin checks the real
// caller), operating on an explicitly-supplied target beautician_profile_id
// resolved once from the URL slug (resolveAdminTargetProfile, below). RLS
// already permits this — every owner_all policy on `services` (and the
// beautician_profiles read policy) already includes an
// `OR has_role(auth.uid(),'admin')` clause (confirmed live in the Phase 5.1
// audit) — so no RLS change was needed for this file to work.
//
// Query/mutation logic itself is never duplicated: every read/write below
// delegates to the exact same bpId-parameterized core functions in
// src/data/dashboard/services.server.ts that the beautician's own
// /dashboard/services page uses (listServicesForProfile,
// createServiceForProfile, updateServiceForProfile,
// deleteServiceForProfile, buildServicesWithReadiness) — this file only
// adds the admin authorization gate, explicit target resolution, and audit
// logging on top.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import type {
  OwnServicesOverview,
  ServiceInput,
  ServiceReadinessContext,
} from "@/data/dashboard/services.server";

export type AdminTargetProfile = Pick<
  Tables<"beautician_profiles">,
  | "id"
  | "slug"
  | "display_name"
  | "business_name"
  | "professional_title"
  | "primary_city"
  | "status"
  | "is_verified"
  | "profile_image_url"
  | "plan"
>;

/**
 * Resolves a beautician slug to its immutable beautician_profiles.id, once,
 * for the admin workspace route loader — every subsequent admin action on
 * that page targets this resolved UUID, never the slug again (Phase 5.2A
 * §2). Admin-gated first; a non-admin caller never learns whether a slug
 * exists via this path. Throws a plain Error for an unknown slug — the
 * route's loader turns that into a real 404, never a silent fallback.
 */
export async function resolveAdminTargetProfile(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  slug: string,
): Promise<AdminTargetProfile> {
  await assertIsAdmin(supabase, adminUserId);

  const { data, error } = await supabase
    .from("beautician_profiles")
    .select(
      "id, slug, display_name, business_name, professional_title, primary_city, status, is_verified, profile_image_url, plan",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  if (!data) throw new Error("No professional found with this slug.");
  return data;
}

/**
 * Same readiness-context shape listOwnServicesWithReadiness() computes for
 * the beautician's own page, gathered here via explicit bpId-scoped queries
 * instead of importing 6 other "own"-scoped dashboard modules — this pilot
 * intentionally does not touch Profile/SEO/Reviews/Gallery/Before-After's
 * own data-access files (out of scope for a Services-only pilot; later
 * phases extend the same explicit-target pattern to each of them in turn).
 */
async function getServiceReadinessContextForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<ServiceReadinessContext> {
  const [profileRes, seoRes, serviceAreasRes, reviewsRes] = await Promise.all([
    supabase.from("beautician_profiles").select("status, primary_city").eq("id", bpId).single(),
    supabase
      .from("portfolio_seo")
      .select("robots_index")
      .eq("beautician_profile_id", bpId)
      .maybeSingle(),
    supabase
      .from("service_areas")
      .select("id", { count: "exact", head: true })
      .eq("beautician_profile_id", bpId),
    supabase.from("reviews").select("is_published").eq("beautician_profile_id", bpId),
  ]);

  if (profileRes.error) throw new Error(`Failed to load profile: ${profileRes.error.message}`);

  return {
    profileIsPublished: profileRes.data?.status === "published",
    profileRobotsIndex: seoRes.data?.robots_index !== false,
    primaryCity: profileRes.data?.primary_city ?? null,
    publishedReviewCount: (reviewsRes.data ?? []).filter((r) => r.is_published).length,
    serviceAreaCount: serviceAreasRes.count ?? 0,
  };
}

export async function listServicesAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<OwnServicesOverview> {
  await assertIsAdmin(supabase, adminUserId);

  const { listServicesForProfile, buildServicesWithReadiness } =
    await import("@/data/dashboard/services.server");

  const [services, readinessContext, galleryRes, beforeAfterRes] = await Promise.all([
    listServicesForProfile(supabase, targetProfileId),
    getServiceReadinessContextForProfile(supabase, targetProfileId),
    supabase
      .from("portfolio_items")
      .select("service_id")
      .eq("beautician_profile_id", targetProfileId),
    supabase
      .from("before_after_items")
      .select("service_id")
      .eq("beautician_profile_id", targetProfileId),
  ]);

  return {
    services: buildServicesWithReadiness(
      services,
      readinessContext,
      (galleryRes.data ?? []).map((r) => r.service_id),
      (beforeAfterRes.data ?? []).map((r) => r.service_id),
    ),
    readinessContext,
  };
}

export async function createServiceAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  input: ServiceInput,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { assertOwnerCanCreate } = await import("@/data/dashboard/plan-enforcement.server");
  await assertOwnerCanCreate(supabase, targetProfileId, "services");

  const { createServiceForProfile } = await import("@/data/dashboard/services.server");
  const newId = await createServiceForProfile(supabase, targetProfileId, input);

  await logAdminAction(supabase, "service_created", "service", newId, null, {
    name: input.name,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function updateServiceAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  serviceId: string,
  updates: Partial<ServiceInput>,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("services")
    .select("name, category, price, price_type, duration_minutes, is_active")
    .eq("id", serviceId)
    .maybeSingle();

  const { updateServiceForProfile } = await import("@/data/dashboard/services.server");
  await updateServiceForProfile(supabase, targetProfileId, serviceId, updates);

  await logAdminAction(
    supabase,
    "service_updated",
    "service",
    serviceId,
    (before as Json | null) ?? null,
    { ...updates, beautician_profile_id: targetProfileId } as Json,
  );
}

export async function deleteServiceAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  serviceId: string,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("services")
    .select("name, category, beautician_profile_id")
    .eq("id", serviceId)
    .maybeSingle();

  const { deleteServiceForProfile } = await import("@/data/dashboard/services.server");
  await deleteServiceForProfile(supabase, targetProfileId, serviceId);

  await logAdminAction(
    supabase,
    "service_deleted",
    "service",
    serviceId,
    (before as Json | null) ?? null,
    null,
  );
}
