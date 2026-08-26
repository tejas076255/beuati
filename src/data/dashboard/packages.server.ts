// Server-only. Owner-scoped `packages` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

export async function listOwnPackages(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"packages">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load packages: ${error.message}`);
  return data ?? [];
}

export type PackageInput = Pick<
  TablesInsert<"packages">,
  | "name"
  | "price"
  | "price_type"
  | "note"
  | "best_for"
  | "inclusions"
  | "is_featured"
  | "is_popular"
  | "is_active"
>;

export async function createPackage(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: PackageInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { error } = await supabase
    .from("packages")
    .insert({ ...input, beautician_profile_id: bpId });

  if (error) throw new Error(`Failed to add package: ${error.message}`);
}

export async function updatePackage(
  supabase: SupabaseClient<Database>,
  packageId: string,
  updates: Partial<PackageInput>,
): Promise<void> {
  const { error } = await supabase.from("packages").update(updates).eq("id", packageId);
  if (error) throw new Error(`Failed to update package: ${error.message}`);
}

export async function deletePackage(
  supabase: SupabaseClient<Database>,
  packageId: string,
): Promise<void> {
  const { error } = await supabase.from("packages").delete().eq("id", packageId);
  if (error) throw new Error(`Failed to delete package: ${error.message}`);
}
