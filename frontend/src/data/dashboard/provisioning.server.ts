// Server-only. Ensures a brand-new signup ends up with an editable (draft)
// beautician_profiles row instead of the Builder erroring out with
// "No portfolio found for the current account". RLS's bp_owner_insert
// policy already allows an authenticated user to insert a row scoped to
// their own profiles.id — this file only decides *what* to insert.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { slugify } from "@/lib/slugify";

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export async function ensureOwnPortfolio(
  supabase: SupabaseClient<Database>,
  userId: string,
  signupSource?: string,
): Promise<{ slug: string; created: boolean }> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("auth_user_id", userId)
    .single();

  if (profileError || !profile) {
    throw new Error("No account profile found for the current session.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("beautician_profiles")
    .select("id, slug")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check for an existing portfolio: ${existingError.message}`);
  }
  if (existing) {
    // Billing Phase A: reconcile commercial state on every dashboard visit
    // (this function runs on every load via dashboard.tsx's ensurePortfolioFn,
    // plus once right after signup). Trusted server-side only — the
    // authenticated browser session never receives direct RPC EXECUTE on
    // reconcile_commercial_state(); supabaseAdmin is dynamically imported
    // here, same convention as every other service-role call site. Non-
    // fatal on failure: dashboard availability never depends on this
    // succeeding, matching how this function's own callers already treat
    // provisioning errors as non-fatal (see signup.tsx).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { reconcileCommercialState } = await import("@/data/billing/commercial-state.server");
      await reconcileCommercialState(supabaseAdmin, existing.id);
    } catch (err) {
      console.error(
        `[provisioning] commercial-state reconciliation failed for profile ${existing.id}`,
        err,
      );
    }
    return { slug: existing.slug, created: false };
  }

  const displayName = profile.display_name?.trim() || profile.email?.split("@")[0] || "beautician";
  const baseSlug = slugify(displayName) || "beautician";

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
    const { data: created, error: insertError } = await supabase
      .from("beautician_profiles")
      .insert({
        profile_id: profile.id,
        slug: candidateSlug,
        display_name: displayName,
        status: "draft",
        ...(signupSource ? { signup_source: signupSource } : {}),
      })
      .select("slug")
      .single();

    if (!insertError && created) {
      return { slug: created.slug, created: true };
    }

    // 23505 = unique_violation (slug already taken) — retry with a suffix.
    if (insertError && insertError.code !== "23505") {
      throw new Error(`Failed to create portfolio: ${insertError.message}`);
    }
  }

  throw new Error("Could not generate a unique portfolio URL — please try again.");
}
