// Server-only. Shared helper for the Portfolio Builder data-access files.
// Resolves the beautician_profiles.id owned by the currently authenticated
// user. This is NOT the authorization check — RLS (owns_beautician_profile())
// is what actually enforces ownership on every read/write. This helper only
// answers "which row", so INSERTs know which beautician_profile_id to use.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function getOwnBeauticianProfileId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userId)
    .single();

  if (profileError || !profile) {
    throw new Error("No profile found for the current account.");
  }

  const { data: beauticianProfile, error: bpError } = await supabase
    .from("beautician_profiles")
    .select("id")
    .eq("profile_id", profile.id)
    .single();

  if (bpError || !beauticianProfile) {
    throw new Error("No portfolio found for the current account.");
  }

  return beauticianProfile.id;
}
