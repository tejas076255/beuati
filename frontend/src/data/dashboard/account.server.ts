// Server-only. Read-only account-identity summary for the Settings page —
// deliberately separate from profile.server.ts (which covers the public
// portfolio profile, not account/auth identity). Reads only the `profiles`
// table (account-level: one row per auth user), never beautician_profiles.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface OwnAccountSummary {
  email: string | null;
  display_name: string | null;
  created_at: string;
}

export async function getOwnAccountSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<OwnAccountSummary> {
  const { data, error } = await supabase
    .from("profiles")
    .select("email, display_name, created_at")
    .eq("auth_user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("No account profile found for the current session.");
  }

  return data;
}
