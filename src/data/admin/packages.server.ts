// Server-only. Master Admin Console — Packages Manager (Phase 5.2F).
//
// Admin never impersonates the beautician: every function here runs under
// the ADMIN's own authenticated session (assertIsAdmin checks the real
// caller), operating on an explicitly-supplied target beautician_profile_id
// resolved from the URL slug via the SAME resolveAdminTargetProfile already
// established in Phase 5.2A. RLS already permits this — `packages`' owner
// policy already includes an `OR has_role(auth.uid(),'admin')` clause (via
// owns_beautician_profile(), re-confirmed live for this phase) — so no RLS
// change was needed.
//
// Query/mutation logic itself is never duplicated: every read/write below
// delegates to the exact same bpId-parameterized core functions in
// src/data/dashboard/packages.server.ts that the beautician's own
// /dashboard/packages page uses — this file only adds the admin
// authorization gate, explicit target resolution reuse, and audit logging
// on top. Those core functions now also carry an explicit
// package-belongs-to-bpId check (added this phase, mirroring Gallery/
// Before & After/Videos hardening from 5.2C/5.2D/5.2E) that RLS alone
// didn't previously enforce at the application layer.
//
// No service-linking: the current Packages product has none (see the
// audit note in dashboard/packages.server.ts) — this file introduces no
// such feature.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import type { PackageInput } from "@/data/dashboard/packages.server";

export async function listPackagesAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<Tables<"packages">[]> {
  await assertIsAdmin(supabase, adminUserId);
  const { listPackagesForProfile } = await import("@/data/dashboard/packages.server");
  return listPackagesForProfile(supabase, targetProfileId);
}

export async function createPackageAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  input: PackageInput,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { createPackageForProfile } = await import("@/data/dashboard/packages.server");
  const newId = await createPackageForProfile(supabase, targetProfileId, input);

  await logAdminAction(supabase, "package_created", "package", newId, null, {
    name: input.name,
    price: input.price,
    price_type: input.price_type,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function updatePackageAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  packageId: string,
  updates: Partial<PackageInput>,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("packages")
    .select("name, price, price_type, is_active, is_featured, is_popular")
    .eq("id", packageId)
    .maybeSingle();

  const { updatePackageForProfile } = await import("@/data/dashboard/packages.server");
  await updatePackageForProfile(supabase, targetProfileId, packageId, updates);

  await logAdminAction(
    supabase,
    "package_updated",
    "package",
    packageId,
    (before as Json | null) ?? null,
    { ...updates, beautician_profile_id: targetProfileId } as Json,
  );
}

export async function deletePackageAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  packageId: string,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("packages")
    .select("name, price, beautician_profile_id")
    .eq("id", packageId)
    .maybeSingle();

  const { deletePackageForProfile } = await import("@/data/dashboard/packages.server");
  await deletePackageForProfile(supabase, targetProfileId, packageId);

  await logAdminAction(
    supabase,
    "package_deleted",
    "package",
    packageId,
    (before as Json | null) ?? null,
    null,
  );
}
