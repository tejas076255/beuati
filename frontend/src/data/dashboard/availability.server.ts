// Server-only. Owner-scoped `availability_settings` read/upsert and
// `availability_blocked_dates` CRUD for the Portfolio Builder. RLS
// (owns_beautician_profile()) enforces ownership on every operation.
// Unlike beautician_profiles, no availability_settings row is auto-created
// at signup — this table only gets a row the first time a beautician saves
// their booking settings — so writes always upsert on the (unique)
// beautician_profile_id.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

// bpId-parameterized core read, reused by both getOwnAvailability (below)
// and the Admin per-beautician workspace (src/data/admin/availability.server.ts)
// — same pattern already established for profile/reviews (getProfileForProfile,
// listReviewsForProfile).
export async function getAvailabilityForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<Tables<"availability_settings"> | null> {
  const { data, error } = await supabase
    .from("availability_settings")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load availability: ${error.message}`);
  return data;
}

export async function getOwnAvailability(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"availability_settings"> | null> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return getAvailabilityForProfile(supabase, bpId);
}

export type AvailabilityInput = Pick<
  TablesInsert<"availability_settings">,
  | "accepting_bookings"
  | "advance_booking_days"
  | "minimum_notice_hours"
  | "working_hours_note"
  | "timezone"
  | "appointment_type"
  | "travel_available"
  | "working_hours"
  | "travel_radius_km"
  | "travel_charge_enabled"
  | "travel_charge_type"
  | "travel_charge_amount"
>;

// bpId-parameterized core upsert. Accepts a partial input so a caller can
// safely update a single field (e.g. the Admin workspace's "accepting
// bookings" toggle) without needing to resend the full settings object —
// Postgres upsert's ON CONFLICT DO UPDATE only sets the columns present in
// the payload, leaving every other existing column untouched.
export async function saveAvailabilityForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  input: Partial<AvailabilityInput>,
): Promise<void> {
  const { error } = await supabase
    .from("availability_settings")
    .upsert({ ...input, beautician_profile_id: bpId }, { onConflict: "beautician_profile_id" });

  if (error) throw new Error(`Failed to save availability: ${error.message}`);
}

export async function saveOwnAvailability(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AvailabilityInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return saveAvailabilityForProfile(supabase, bpId, input);
}

// ---------- blocked dates ----------

export async function listBlockedDatesForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<Tables<"availability_blocked_dates">[]> {
  const { data, error } = await supabase
    .from("availability_blocked_dates")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("blocked_date");

  if (error) throw new Error(`Failed to load blocked dates: ${error.message}`);
  return data ?? [];
}

export async function listOwnBlockedDates(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"availability_blocked_dates">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return listBlockedDatesForProfile(supabase, bpId);
}

export async function addBlockedDateForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  input: { blocked_date: string; reason: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("availability_blocked_dates")
    .insert({ ...input, beautician_profile_id: bpId });

  if (error) {
    // 23505 = unique_violation — the same date was already blocked.
    if (error.code === "23505") throw new Error("That date is already blocked.");
    throw new Error(`Failed to add blocked date: ${error.message}`);
  }
}

export async function addOwnBlockedDate(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { blocked_date: string; reason: string | null },
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return addBlockedDateForProfile(supabase, bpId, input);
}

export async function deleteOwnBlockedDate(
  supabase: SupabaseClient<Database>,
  blockedDateId: string,
): Promise<void> {
  const { error } = await supabase
    .from("availability_blocked_dates")
    .delete()
    .eq("id", blockedDateId);

  if (error) throw new Error(`Failed to remove blocked date: ${error.message}`);
}

// ---------- working hours (app-level shape stored as JSONB) ----------

export const WORKING_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type WorkingDay = (typeof WORKING_DAYS)[number];

export interface DayHours {
  day: WorkingDay;
  available: boolean;
  start: string;
  end: string;
}

export function parseWorkingHours(value: Json | null): DayHours[] {
  if (!Array.isArray(value)) return [];
  const byDay = new Map<string, DayHours>();
  for (const entry of value) {
    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof entry["day"] === "string" &&
      (WORKING_DAYS as readonly string[]).includes(entry["day"])
    ) {
      byDay.set(entry["day"], {
        day: entry["day"] as WorkingDay,
        available: Boolean(entry["available"]),
        start: typeof entry["start"] === "string" ? entry["start"] : "10:00",
        end: typeof entry["end"] === "string" ? entry["end"] : "19:00",
      });
    }
  }
  return WORKING_DAYS.map(
    (day) => byDay.get(day) ?? { day, available: false, start: "10:00", end: "19:00" },
  );
}
