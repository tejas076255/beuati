// Server-only. Per-portfolio GTM + marketing tracking phase — Admin-only
// this phase (no professional self-editing; see the phase report). Every
// function runs under the ADMIN's own authenticated session (assertIsAdmin
// checks the real caller), operating on an explicitly-supplied target
// beautician_profile_id — same convention as every other admin/*.server.ts
// file (Services, Profile, Gallery, ..., Availability).
//
// RLS: portfolio_tracking_settings has no owner/professional write policy
// this phase — only "pts_admin_all" (has_role admin) and
// "pts_public_read_published" (anon/authenticated, published portfolios
// only). A non-admin caller's write is rejected by RLS even if this
// application-layer gate were somehow bypassed — defense in depth, not the
// only guard.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import { isValidGtmContainerId, normalizeGtmContainerId } from "@/lib/gtm";

export class InvalidGtmContainerIdError extends Error {
  constructor() {
    super("Enter a valid GTM container ID (e.g. GTM-XXXXXXX).");
    this.name = "InvalidGtmContainerIdError";
  }
}

export async function getTrackingSettingsAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<string | null> {
  await assertIsAdmin(supabase, adminUserId);
  const { data, error } = await supabase
    .from("portfolio_tracking_settings")
    .select("gtm_container_id")
    .eq("beautician_profile_id", targetProfileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.gtm_container_id ?? null;
}

/**
 * Upserts the GTM container ID. Rejects an invalid value BEFORE it ever
 * reaches the database — the CHECK constraint on the column is
 * defense-in-depth, not the primary gate (a rejected write must never
 * produce a raw Postgres constraint-violation message to the admin UI).
 * Never accepts arbitrary script/snippet text; the only stored value is a
 * canonical `GTM-XXXXXXX` container ID, normalized to uppercase.
 */
export async function saveTrackingSettingsAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  rawGtmContainerId: string,
): Promise<string> {
  await assertIsAdmin(supabase, adminUserId);
  const normalized = normalizeGtmContainerId(rawGtmContainerId);
  if (!isValidGtmContainerId(normalized)) {
    throw new InvalidGtmContainerIdError();
  }

  const { data: existing } = await supabase
    .from("portfolio_tracking_settings")
    .select("beautician_profile_id")
    .eq("beautician_profile_id", targetProfileId)
    .maybeSingle();

  const { error } = await supabase.from("portfolio_tracking_settings").upsert(
    {
      beautician_profile_id: targetProfileId,
      gtm_container_id: normalized,
    },
    { onConflict: "beautician_profile_id" },
  );
  if (error) throw new Error(error.message);

  await logAdminAction(
    supabase,
    existing ? "tracking_settings_updated" : "tracking_settings_created",
    "tracking_settings",
    targetProfileId,
    null,
    { gtm_container_id: normalized } as Json,
  );
  return normalized;
}

export async function removeTrackingSettingsAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { error } = await supabase
    .from("portfolio_tracking_settings")
    .delete()
    .eq("beautician_profile_id", targetProfileId);
  if (error) throw new Error(error.message);

  await logAdminAction(
    supabase,
    "tracking_settings_removed",
    "tracking_settings",
    targetProfileId,
    null,
    null,
  );
}
