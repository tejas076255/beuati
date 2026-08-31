// Server-only. Master Admin Console — Profile Manager (Phase 5.2B).
//
// Admin never impersonates the beautician: every function here runs under
// the ADMIN's own authenticated session (assertIsAdmin checks the real
// caller), operating on an explicitly-supplied target beautician_profile_id
// resolved from the URL slug via the SAME resolveAdminTargetProfile already
// established in Phase 5.2A (src/data/admin/services.server.ts). RLS already
// permits this — the beautician_profiles owner policies (bp_owner_read/
// update/delete) already include an `OR has_role(auth.uid(),'admin')`
// clause (confirmed live in the Phase 5.1 audit and re-confirmed for this
// phase) — so no RLS change was needed for this file to work.
//
// Query/mutation logic itself is never duplicated: every read/write below
// delegates to the exact same bpId-parameterized core functions in
// src/data/dashboard/profile.server.ts that the beautician's own
// /dashboard/profile page uses (getProfileForProfile,
// updateProfileForProfile) — this file only adds the admin authorization
// gate, explicit target resolution reuse, and audit logging on top.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import type {
  OwnProfileUpdate,
  OwnPortfolioReadinessContext,
} from "@/data/dashboard/profile.server";

export async function getProfileAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<Tables<"beautician_profiles">> {
  await assertIsAdmin(supabase, adminUserId);
  const { getProfileForProfile } = await import("@/data/dashboard/profile.server");
  return getProfileForProfile(supabase, targetProfileId);
}

/**
 * Same readiness-context shape getOwnPortfolioReadinessContext() computes
 * for the beautician's own page, gathered here via explicit bpId-scoped
 * queries instead of importing 8 other "own"-scoped dashboard modules —
 * this pilot intentionally does not touch Services/Gallery/Before-After/
 * Reviews/FAQs/Videos/Availability/SEO's own data-access files (out of
 * scope for a Profile-only pilot, same precedent as
 * src/data/admin/services.server.ts's getServiceReadinessContextForProfile
 * in Phase 5.2A). The computation algorithm itself
 * (evaluatePortfolioContentReadiness) is never duplicated — only these
 * input-gathering queries are, matching the persisted-context shape.
 */
async function getProfileReadinessContextForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<OwnPortfolioReadinessContext> {
  const [
    servicesRes,
    serviceAreasRes,
    galleryItemsRes,
    beforeAfterRes,
    reviewsRes,
    faqsRes,
    videosRes,
    availabilityRes,
    seoRes,
  ] = await Promise.all([
    supabase.from("services").select("is_active").eq("beautician_profile_id", bpId),
    supabase
      .from("service_areas")
      .select("id", { count: "exact", head: true })
      .eq("beautician_profile_id", bpId),
    supabase.from("portfolio_items").select("id, is_published").eq("beautician_profile_id", bpId),
    supabase.from("before_after_items").select("is_published").eq("beautician_profile_id", bpId),
    supabase.from("reviews").select("is_published").eq("beautician_profile_id", bpId),
    supabase.from("faqs").select("is_published").eq("beautician_profile_id", bpId),
    supabase.from("portfolio_videos").select("is_published").eq("beautician_profile_id", bpId),
    supabase
      .from("availability_settings")
      .select("working_hours")
      .eq("beautician_profile_id", bpId)
      .maybeSingle(),
    supabase
      .from("portfolio_seo")
      .select("robots_index, seo_title, meta_description, canonical_url")
      .eq("beautician_profile_id", bpId)
      .maybeSingle(),
  ]);

  const publishedGalleryItems = (galleryItemsRes.data ?? []).filter((i) => i.is_published);
  let publishedGalleryImageCount = 0;
  let galleryImagesWithAltCount = 0;
  if (publishedGalleryItems.length > 0) {
    const { data: images } = await supabase
      .from("portfolio_images")
      .select("alt_text")
      .in(
        "portfolio_item_id",
        publishedGalleryItems.map((i) => i.id),
      );
    publishedGalleryImageCount = images?.length ?? 0;
    galleryImagesWithAltCount = (images ?? []).filter((img) => !!img.alt_text?.trim()).length;
  }

  const { buildOpeningHoursSpecification } = await import("@/lib/seo-helpers");

  return {
    robotsIndex: seoRes.data?.robots_index !== false,
    activeServiceCount: (servicesRes.data ?? []).filter((s) => s.is_active).length,
    serviceAreaCount: serviceAreasRes.count ?? 0,
    publishedGalleryImageCount,
    galleryImagesWithAltCount,
    publishedBeforeAfterCount: (beforeAfterRes.data ?? []).filter((i) => i.is_published).length,
    publishedReviewCount: (reviewsRes.data ?? []).filter((r) => r.is_published).length,
    publishedFaqCount: (faqsRes.data ?? []).filter((f) => f.is_published).length,
    publishedVideoCount: (videosRes.data ?? []).filter((v) => v.is_published).length,
    availabilityConfigured:
      buildOpeningHoursSpecification(availabilityRes.data?.working_hours).length > 0,
    seoTitle: seoRes.data?.seo_title ?? null,
    metaDescription: seoRes.data?.meta_description ?? null,
    canonicalUrl: seoRes.data?.canonical_url ?? null,
  };
}

export async function getProfileReadinessContextAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<OwnPortfolioReadinessContext> {
  await assertIsAdmin(supabase, adminUserId);
  return getProfileReadinessContextForProfile(supabase, targetProfileId);
}

export async function updateProfileAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  updates: OwnProfileUpdate,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("beautician_profiles")
    .select(
      "display_name, professional_title, primary_city, status, phone, email, years_experience",
    )
    .eq("id", targetProfileId)
    .maybeSingle();

  const { updateProfileForProfile } = await import("@/data/dashboard/profile.server");
  await updateProfileForProfile(supabase, targetProfileId, updates);

  await logAdminAction(
    supabase,
    "profile_updated",
    "beautician_profile",
    targetProfileId,
    (before as Json | null) ?? null,
    {
      display_name: updates.display_name,
      professional_title: updates.professional_title,
      primary_city: updates.primary_city,
      status: updates.status,
      phone: updates.phone,
      email: updates.email,
      years_experience: updates.years_experience,
    } as Json,
  );
}
