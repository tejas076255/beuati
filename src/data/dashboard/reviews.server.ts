// Server-only. Owner-scoped `reviews` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation, and
// guard_review_verification() forces is_verified=false on owner writes
// regardless of what's sent — so it's intentionally not part of ReviewInput.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

export async function listOwnReviews(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"reviews">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load reviews: ${error.message}`);
  return data ?? [];
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
