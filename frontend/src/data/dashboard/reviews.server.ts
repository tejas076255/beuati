// Server-only. Owner-scoped `reviews` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation, and
// guard_review_verification() forces is_verified=false on owner writes
// regardless of what's sent — so it's intentionally not part of ReviewInput.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

// QA-1O — bpId-parameterized core query, shared by both the beautician's
// own-profile path (listOwnReviews, below) and the Master Admin Console's
// explicit-target path (src/data/admin/reviews.server.ts), matching the
// same pattern already established for Gallery/Before & After/Videos/
// Packages/FAQs. This is the ONE query both callers use — never a
// duplicated/forked copy.
export async function listReviewsForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<Tables<"reviews">[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load reviews: ${error.message}`);
  return data ?? [];
}

export async function listOwnReviews(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"reviews">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return listReviewsForProfile(supabase, bpId);
}

export type ReviewInput = Pick<
  TablesInsert<"reviews">,
  | "client_name"
  | "rating"
  | "review_text"
  | "service_name"
  | "review_date"
  | "source"
  | "source_url"
  | "is_published"
>;

export async function createReview(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: ReviewInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { assertOwnerCanCreate } = await import("./plan-enforcement.server");
  await assertOwnerCanCreate(supabase, bpId, "reviews");
  const { error } = await supabase
    .from("reviews")
    .insert({ ...input, beautician_profile_id: bpId });
  if (error) throw new Error(`Failed to add review: ${error.message}`);
}

export async function updateReview(
  supabase: SupabaseClient<Database>,
  reviewId: string,
  updates: Partial<ReviewInput>,
): Promise<void> {
  const { error } = await supabase.from("reviews").update(updates).eq("id", reviewId);
  if (error) throw new Error(`Failed to update review: ${error.message}`);
}

export async function deleteReview(
  supabase: SupabaseClient<Database>,
  reviewId: string,
): Promise<void> {
  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) throw new Error(`Failed to delete review: ${error.message}`);
}
