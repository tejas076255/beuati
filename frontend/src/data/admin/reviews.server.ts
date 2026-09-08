// Server-only. Platform-wide reviews moderation for admins.
// owns_beautician_profile() already grants admins full RLS write access to
// every review (see reviews_owner_all), and guard_review_verification()
// already lets admins (and only admins) set is_verified directly — no
// schema/RLS changes needed here, this is pure app-layer moderation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";

export type AdminReviewSummary = Tables<"reviews"> & {
  beautician_profiles: Pick<Tables<"beautician_profiles">, "display_name" | "slug"> | null;
};

export async function listAllReviews(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminReviewSummary[]> {
  await assertIsAdmin(supabase, userId);

  const { data, error } = await supabase
    .from("reviews")
    .select("*, beautician_profiles(display_name, slug)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load reviews: ${error.message}`);
  return data ?? [];
}

async function moderateReviewCore(
  supabase: SupabaseClient<Database>,
  reviewId: string,
  updates: Partial<Pick<Tables<"reviews">, "is_published" | "is_verified">>,
): Promise<void> {
  const { data: before } = await supabase
    .from("reviews")
    .select("is_published, is_verified")
    .eq("id", reviewId)
    .maybeSingle();

  const { error } = await supabase.from("reviews").update(updates).eq("id", reviewId);
  if (error) throw new Error(`Failed to update review: ${error.message}`);

  if (before) {
    const oldValue: Record<string, boolean> = {};
    const newValue: Record<string, boolean> = {};
    if ("is_published" in updates && updates["is_published"] !== before.is_published) {
      oldValue["is_published"] = before.is_published;
      newValue["is_published"] = updates["is_published"]!;
    }
    if ("is_verified" in updates && updates["is_verified"] !== before.is_verified) {
      oldValue["is_verified"] = before.is_verified;
      newValue["is_verified"] = updates["is_verified"]!;
    }
    if (Object.keys(newValue).length > 0) {
      await logAdminAction(
        supabase,
        "review_moderated",
        "review",
        reviewId,
        oldValue as Json,
        newValue as Json,
      );
    }
  }
}

async function deleteReviewCore(
  supabase: SupabaseClient<Database>,
  reviewId: string,
): Promise<void> {
  // Snapshot only moderation-relevant fields for the audit trail — not the
  // full row (review_text, source, etc. are unnecessary detail here).
  const { data: before } = await supabase
    .from("reviews")
    .select("client_name, beautician_profile_id, is_published, is_verified")
    .eq("id", reviewId)
    .maybeSingle();

  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) throw new Error(`Failed to delete review: ${error.message}`);

  await logAdminAction(
    supabase,
    "review_deleted",
    "review",
    reviewId,
    (before as Json | undefined) ?? null,
    null,
  );
}

export async function updateReviewModeration(
  supabase: SupabaseClient<Database>,
  userId: string,
  reviewId: string,
  updates: Partial<Pick<Tables<"reviews">, "is_published" | "is_verified">>,
): Promise<void> {
  await assertIsAdmin(supabase, userId);
  await moderateReviewCore(supabase, reviewId, updates);
}

export async function deleteReview(
  supabase: SupabaseClient<Database>,
  userId: string,
  reviewId: string,
): Promise<void> {
  await assertIsAdmin(supabase, userId);
  await deleteReviewCore(supabase, reviewId);
}

/**
 * QA-1O — confirms `reviewId` actually belongs to `targetProfileId` before
 * any per-beautician mutation. RLS alone already fully secures the
 * platform-wide moderation above (an admin's session legitimately passes
 * RLS for every beautician's reviews), but the per-beautician workspace
 * tab needs this defense-in-depth so a stale/crafted reviewId can't
 * silently moderate a DIFFERENT beautician's review while viewing this
 * one's tab — the same pattern already applied to Gallery/Before & After/
 * Videos/Packages/FAQs in earlier phases.
 */
async function assertReviewBelongsToProfile(
  supabase: SupabaseClient<Database>,
  targetProfileId: string,
  reviewId: string,
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("reviews")
    .select("beautician_profile_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error(`Failed to load review: ${error?.message ?? "not found"}`);
  }
  if (existing.beautician_profile_id !== targetProfileId) {
    throw new Error("This review does not belong to the selected professional.");
  }
}

export async function listReviewsForBeautician(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<Tables<"reviews">[]> {
  await assertIsAdmin(supabase, adminUserId);
  const { listReviewsForProfile } = await import("@/data/dashboard/reviews.server");
  return listReviewsForProfile(supabase, targetProfileId);
}

export async function updateReviewModerationForBeautician(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  reviewId: string,
  updates: Partial<Pick<Tables<"reviews">, "is_published" | "is_verified">>,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  await assertReviewBelongsToProfile(supabase, targetProfileId, reviewId);
  await moderateReviewCore(supabase, reviewId, updates);
}

export async function deleteReviewForBeautician(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  reviewId: string,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  await assertReviewBelongsToProfile(supabase, targetProfileId, reviewId);
  await deleteReviewCore(supabase, reviewId);
}
