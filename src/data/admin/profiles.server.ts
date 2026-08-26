// Server-only. Platform-wide beautician_profiles moderation for admins.
// RLS already grants admins full access to every profile (every owner
// policy on beautician_profiles is `OR has_role(auth.uid(),'admin')`), but
// this file explicitly checks the caller's role first rather than relying
// solely on RLS to silently filter results — a non-admin owner should see a
// clear "not authorized" message, not a table that looks like "the whole
// platform has 1 profile" (their own, via the owner policy).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";

export type AdminProfileSummary = Pick<
  Tables<"beautician_profiles">,
  | "id"
  | "slug"
  | "display_name"
  | "status"
  | "is_demo"
  | "is_verified"
  | "is_featured"
  | "created_at"
  | "review_count"
  | "client_count"
>;

export async function listAllProfiles(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminProfileSummary[]> {
  await assertIsAdmin(supabase, userId);

  const { data, error } = await supabase
    .from("beautician_profiles")
    .select(
      "id, slug, display_name, status, is_demo, is_verified, is_featured, created_at, review_count, client_count",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load profiles: ${error.message}`);
  return data ?? [];
}

export async function updateProfileStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  profileId: string,
  status: Database["public"]["Enums"]["portfolio_status"],
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { data: before } = await supabase
    .from("beautician_profiles")
    .select("status")
    .eq("id", profileId)
    .maybeSingle();

  const { error } = await supabase
    .from("beautician_profiles")
    .update({ status })
    .eq("id", profileId);
  if (error) throw new Error(`Failed to update status: ${error.message}`);

  if (before && before.status !== status) {
    await logAdminAction(
      supabase,
      "profile_status_changed",
      "beautician_profile",
      profileId,
      { status: before.status },
      { status },
    );
  }
}

// Trigger-guarded: guard_beautician_profile_flags() resets these columns to
// their previous value on UPDATE unless the caller has the admin role, so
// this is defense-in-depth on top of the DB-level protection, not the only
// protection — same pattern as updateReviewModeration's is_verified field.
export async function updateProfileFlags(
  supabase: SupabaseClient<Database>,
  userId: string,
  profileId: string,
  updates: Partial<Pick<Tables<"beautician_profiles">, "is_verified" | "is_featured">>,
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { data: before } = await supabase
    .from("beautician_profiles")
    .select("is_verified, is_featured")
    .eq("id", profileId)
    .maybeSingle();

  const { error } = await supabase.from("beautician_profiles").update(updates).eq("id", profileId);
  if (error) throw new Error(`Failed to update profile flags: ${error.message}`);

  if (before) {
    if ("is_verified" in updates && updates.is_verified !== before.is_verified) {
      await logAdminAction(
        supabase,
        "verification_changed",
        "beautician_profile",
        profileId,
        { is_verified: before.is_verified },
        { is_verified: updates.is_verified },
      );
    }
    if ("is_featured" in updates && updates.is_featured !== before.is_featured) {
      await logAdminAction(
        supabase,
        "featured_changed",
        "beautician_profile",
        profileId,
        { is_featured: before.is_featured },
        { is_featured: updates.is_featured },
      );
    }
  }
}
