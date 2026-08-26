// Server-only. Owner-scoped `service_areas` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

export async function listOwnServiceAreas(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"service_areas">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { data, error } = await supabase
    .from("service_areas")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load service areas: ${error.message}`);
  return data ?? [];
}

export type ServiceAreaInput = Pick<
  TablesInsert<"service_areas">,
  "city" | "area_name" | "state" | "postal_code" | "is_primary"
>;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export async function createServiceArea(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: ServiceAreaInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);

  // Duplicate protection: the same city+area combination shouldn't be added
  // twice for one profile. No DB-level UNIQUE constraint is used for this
  // because `area_name` is nullable (NULL never equals NULL in SQL, so a
  // unique index wouldn't catch two identical city-only rows) — checked
  // here instead, case-insensitively.
  const { data: existing, error: existingError } = await supabase
    .from("service_areas")
    .select("city, area_name")
    .eq("beautician_profile_id", bpId);
  if (existingError) {
    throw new Error(`Failed to check existing service areas: ${existingError.message}`);
  }
  const isDuplicate = (existing ?? []).some(
    (a) =>
      normalize(a.city) === normalize(input.city) &&
      normalize(a.area_name) === normalize(input.area_name),
  );
  if (isDuplicate) {
    throw new Error("This service area has already been added.");
  }

  const { error } = await supabase
    .from("service_areas")
    .insert({ ...input, beautician_profile_id: bpId });

  if (error) throw new Error(`Failed to add service area: ${error.message}`);
}

export async function updateServiceArea(
  supabase: SupabaseClient<Database>,
  areaId: string,
  updates: Partial<ServiceAreaInput>,
): Promise<void> {
  const { error } = await supabase.from("service_areas").update(updates).eq("id", areaId);
  if (error) throw new Error(`Failed to update service area: ${error.message}`);
}

export async function deleteServiceArea(
  supabase: SupabaseClient<Database>,
  areaId: string,
): Promise<void> {
  const { error } = await supabase.from("service_areas").delete().eq("id", areaId);
  if (error) throw new Error(`Failed to delete service area: ${error.message}`);
}
