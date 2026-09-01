// Server-only. Owner-scoped `packages` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation.
//
// Phase 5.2F audit note: the `packages` table has no service-linkage
// column, and while a `package_services` join table exists in the live
// schema (package_id/service_id/quantity/sort_order), it is referenced
// nowhere in application code — confirmed via a full source grep. The
// current product's Packages feature has no service-linking UI at all;
// `inclusions` (below) is a plain free-text list, unrelated to that table.
// This phase does not introduce service-linking, per the explicit
// "do not invent fields not present in the current product" instruction —
// see the Phase 5.2F report for the full finding.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

// Phase 5.2F — bpId-parameterized core query, shared by both the
// beautician's own-profile path (listOwnPackages, below) and the Master
// Admin Console's explicit-target path (src/data/admin/packages.server.ts).
// This is the ONE query both callers use — never a duplicated/forked copy.
export async function listPackagesForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<Tables<"packages">[]> {
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load packages: ${error.message}`);
  return data ?? [];
}

export async function listOwnPackages(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"packages">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return listPackagesForProfile(supabase, bpId);
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

// Phase 5.2F — bpId-parameterized core, shared with the admin path.
// Returns the new row's id so admin callers can attach it to an audit-log
// entity_id; the beautician's own path (createPackage, below) ignores it.
export async function createPackageForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  input: PackageInput,
): Promise<string> {
  const { data, error } = await supabase
    .from("packages")
    .insert({ ...input, beautician_profile_id: bpId })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to add package: ${error?.message}`);
  return data.id;
}

export async function createPackage(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: PackageInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await createPackageForProfile(supabase, bpId, input);
}

/**
 * Confirms `packageId` actually belongs to `bpId` before any mutation —
 * the previous version of this file had NO application-layer ownership
 * check at all on update/delete, relying purely on RLS
 * (owns_beautician_profile(), which already includes an admin-OR clause).
 * Correct for the beautician's own path (RLS alone fully secures it), but
 * insufficient for the admin path — same defense-in-depth pattern already
 * applied to Services (5.2A), Gallery (5.2C), Before & After (5.2D), and
 * Videos (5.2E).
 */
async function assertPackageBelongsToProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  packageId: string,
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("packages")
    .select("beautician_profile_id")
    .eq("id", packageId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error(`Failed to load package: ${error?.message ?? "not found"}`);
  }
  if (existing.beautician_profile_id !== bpId) {
    throw new Error("This package does not belong to the selected profile.");
  }
}

export async function updatePackageForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  packageId: string,
  updates: Partial<PackageInput>,
): Promise<void> {
  await assertPackageBelongsToProfile(supabase, bpId, packageId);

  const { error } = await supabase.from("packages").update(updates).eq("id", packageId);
  if (error) throw new Error(`Failed to update package: ${error.message}`);
}

export async function updatePackage(
  supabase: SupabaseClient<Database>,
  userId: string,
  packageId: string,
  updates: Partial<PackageInput>,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await updatePackageForProfile(supabase, bpId, packageId, updates);
}

export async function deletePackageForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  packageId: string,
): Promise<void> {
  await assertPackageBelongsToProfile(supabase, bpId, packageId);

  const { error } = await supabase.from("packages").delete().eq("id", packageId);
  if (error) throw new Error(`Failed to delete package: ${error.message}`);
}

export async function deletePackage(
  supabase: SupabaseClient<Database>,
  userId: string,
  packageId: string,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await deletePackageForProfile(supabase, bpId, packageId);
}
