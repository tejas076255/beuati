// Server-only. Admin per-beautician Availability + Service Areas
// management (src/routes/admin.beauticians.$slug.tsx). Admin never
// impersonates the beautician: every function runs under the ADMIN's own
// authenticated session (assertIsAdmin checks the real caller), operating
// on an explicitly-supplied target beautician_profile_id — same pattern
// already established in src/data/admin/profile.server.ts. RLS already
// permits this: owns_beautician_profile() (used by availability_settings,
// availability_blocked_dates, and service_areas policies) already
// includes an `OR has_role(auth.uid(),'admin')` clause, so no RLS change
// was needed.
//
// Query/mutation logic is never duplicated: every read/write below
// delegates to the exact same bpId-parameterized core functions the
// beautician's own /dashboard/availability and /dashboard/areas pages use
// (now shared via src/components/availability/availability-manager.tsx and
// src/components/service-areas/service-areas-manager.tsx) — this file
// only adds the admin authorization gate, ownership checks for
// entity-scoped writes (update/delete by id — the underlying dashboard
// functions don't take a bpId for those, since RLS alone is sufficient for
// owner-only access; Admin adds an explicit check here so an
// Admin-workspace request can never silently act on the wrong
// professional's row even if the client sent a mismatched id), and audit
// logging.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import type { AvailabilityInput } from "@/data/dashboard/availability.server";
import type { ServiceAreaInput } from "@/data/dashboard/service-areas.server";

async function assertBlockedDateBelongsToProfile(
  supabase: SupabaseClient<Database>,
  blockedDateId: string,
  targetProfileId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("availability_blocked_dates")
    .select("beautician_profile_id")
    .eq("id", blockedDateId)
    .maybeSingle();
  if (error) throw new Error(`Failed to verify blocked date: ${error.message}`);
  if (!data || data.beautician_profile_id !== targetProfileId) {
    throw new Error("Blocked date not found for this professional.");
  }
}

async function assertServiceAreaBelongsToProfile(
  supabase: SupabaseClient<Database>,
  areaId: string,
  targetProfileId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("service_areas")
    .select("beautician_profile_id")
    .eq("id", areaId)
    .maybeSingle();
  if (error) throw new Error(`Failed to verify service area: ${error.message}`);
  if (!data || data.beautician_profile_id !== targetProfileId) {
    throw new Error("Service area not found for this professional.");
  }
}

// ---------- availability settings ----------

export async function getAvailabilityAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<Tables<"availability_settings"> | null> {
  await assertIsAdmin(supabase, adminUserId);
  const { getAvailabilityForProfile } = await import("@/data/dashboard/availability.server");
  return getAvailabilityForProfile(supabase, targetProfileId);
}

/**
 * Full availability-settings update — the same fields the professional's
 * own /dashboard/availability page edits (accepting_bookings, notice/
 * window presets, appointment type, travel_available, working hours,
 * timezone, notes). Operational availability only — never a confirmed
 * booking, and never touches service areas.
 */
export async function updateAvailabilityAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  input: AvailabilityInput,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { getAvailabilityForProfile, saveAvailabilityForProfile } =
    await import("@/data/dashboard/availability.server");
  const before = await getAvailabilityForProfile(supabase, targetProfileId);
  await saveAvailabilityForProfile(supabase, targetProfileId, input);

  if (!before || before.accepting_bookings !== input.accepting_bookings) {
    await logAdminAction(
      supabase,
      "profile_updated",
      "beautician_profile",
      targetProfileId,
      { accepting_bookings: before?.accepting_bookings ?? null },
      { accepting_bookings: input.accepting_bookings },
    );
  }
}

// ---------- blocked dates ----------

export async function listBlockedDatesAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<Tables<"availability_blocked_dates">[]> {
  await assertIsAdmin(supabase, adminUserId);
  const { listBlockedDatesForProfile } = await import("@/data/dashboard/availability.server");
  return listBlockedDatesForProfile(supabase, targetProfileId);
}

export async function addBlockedDateAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  input: { blocked_date: string; reason: string | null },
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { addBlockedDateForProfile } = await import("@/data/dashboard/availability.server");
  await addBlockedDateForProfile(supabase, targetProfileId, input);
}

export async function deleteBlockedDateAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  blockedDateId: string,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  await assertBlockedDateBelongsToProfile(supabase, blockedDateId, targetProfileId);
  const { deleteOwnBlockedDate } = await import("@/data/dashboard/availability.server");
  await deleteOwnBlockedDate(supabase, blockedDateId);
}

// ---------- service areas ----------

export async function listServiceAreasAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<Tables<"service_areas">[]> {
  await assertIsAdmin(supabase, adminUserId);
  const { listServiceAreasForProfile } = await import("@/data/dashboard/service-areas.server");
  return listServiceAreasForProfile(supabase, targetProfileId);
}

export async function createServiceAreaAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  input: ServiceAreaInput,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { assertOwnerCanCreate } = await import("@/data/dashboard/plan-enforcement.server");
  await assertOwnerCanCreate(supabase, targetProfileId, "service_areas");
  const { createServiceAreaForProfile } = await import("@/data/dashboard/service-areas.server");
  await createServiceAreaForProfile(supabase, targetProfileId, input);
}

export async function updateServiceAreaAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  areaId: string,
  updates: Partial<ServiceAreaInput>,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  await assertServiceAreaBelongsToProfile(supabase, areaId, targetProfileId);
  const { updateServiceArea } = await import("@/data/dashboard/service-areas.server");
  await updateServiceArea(supabase, areaId, updates);
}

export async function deleteServiceAreaAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  areaId: string,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  await assertServiceAreaBelongsToProfile(supabase, areaId, targetProfileId);
  const { deleteServiceArea } = await import("@/data/dashboard/service-areas.server");
  await deleteServiceArea(supabase, areaId);
}
