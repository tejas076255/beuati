// Server-only. Master Admin Console — Before & After Manager (Phase 5.2D).
//
// Admin never impersonates the beautician: every function here runs under
// the ADMIN's own authenticated session (assertIsAdmin checks the real
// caller), operating on an explicitly-supplied target beautician_profile_id
// resolved from the URL slug via the SAME resolveAdminTargetProfile already
// established in Phase 5.2A. RLS already permits this —
// before_after_items/before_after_images owner policies already include an
// `OR has_role(auth.uid(),'admin')` clause (via owns_beautician_profile(),
// re-confirmed live for this phase) — so no RLS change was needed.
//
// Query/mutation logic itself is never duplicated: every read/write below
// delegates to the exact same bpId-parameterized core functions in
// src/data/dashboard/before-after.server.ts that the beautician's own
// /dashboard/before-after page uses — this file only adds the admin
// authorization gate, explicit target resolution reuse, and audit logging
// on top. Those core functions now also carry an explicit
// item/image-belongs-to-bpId check (added this phase, mirroring Phase
// 5.2C's Gallery hardening) that RLS alone didn't previously enforce at
// the application layer.
//
// Cross-professional service linking is additionally guarded at the
// database level by trg_before_after_items_service_ownership
// (guard_media_service_ownership()) — re-confirmed live this phase — which
// rejects a service_id that doesn't belong to the same
// beautician_profile_id regardless of caller, admin included. This file
// does not, and must not, weaken or duplicate that trigger.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import type {
  BeforeAfterItemUpdate,
  BeforeAfterItemWithImages,
  BeforeAfterPairInput,
} from "@/data/dashboard/before-after.server";

export async function listBeforeAfterAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<BeforeAfterItemWithImages[]> {
  await assertIsAdmin(supabase, adminUserId);
  const { listBeforeAfterItemsForProfile } = await import("@/data/dashboard/before-after.server");
  return listBeforeAfterItemsForProfile(supabase, targetProfileId);
}

export async function createBeforeAfterPairAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  input: BeforeAfterPairInput,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { assertOwnerCanCreate } = await import("@/data/dashboard/plan-enforcement.server");
  await assertOwnerCanCreate(supabase, targetProfileId, "before_after_items");
  const { createBeforeAfterPairForProfile } = await import("@/data/dashboard/before-after.server");
  const newId = await createBeforeAfterPairForProfile(supabase, targetProfileId, input);

  await logAdminAction(supabase, "before_after_created", "before_after_item", newId, null, {
    title: input.title,
    eventType: input.eventType,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function updateBeforeAfterItemAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  itemId: string,
  updates: BeforeAfterItemUpdate,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("before_after_items")
    .select("title, event_type, location, is_published, service_id")
    .eq("id", itemId)
    .maybeSingle();

  const { updateBeforeAfterItemForProfile } = await import("@/data/dashboard/before-after.server");
  await updateBeforeAfterItemForProfile(supabase, targetProfileId, itemId, updates);

  await logAdminAction(
    supabase,
    "before_after_updated",
    "before_after_item",
    itemId,
    (before as Json | null) ?? null,
    { ...updates, beautician_profile_id: targetProfileId } as Json,
  );
}

export async function replaceBeforeAfterImageAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  imageId: string,
  newStoragePath: string,
): Promise<string | null> {
  await assertIsAdmin(supabase, adminUserId);
  const { replaceBeforeAfterImageForProfile } =
    await import("@/data/dashboard/before-after.server");
  const oldPath = await replaceBeforeAfterImageForProfile(
    supabase,
    targetProfileId,
    imageId,
    newStoragePath,
  );

  await logAdminAction(supabase, "before_after_updated", "before_after_item", imageId, null, {
    imageReplaced: true,
    beautician_profile_id: targetProfileId,
  } as Json);
  return oldPath;
}

export async function updateBeforeAfterImageAltAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  imageId: string,
  altText: string,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { updateImageAltTextForProfile } = await import("@/data/dashboard/before-after.server");
  await updateImageAltTextForProfile(supabase, targetProfileId, imageId, altText);

  await logAdminAction(supabase, "before_after_updated", "before_after_item", imageId, null, {
    imageAltTextUpdated: true,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function deleteBeforeAfterItemAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  itemId: string,
): Promise<Tables<"before_after_images">[]> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("before_after_items")
    .select("title, event_type, beautician_profile_id")
    .eq("id", itemId)
    .maybeSingle();

  const { deleteBeforeAfterItemForProfile } = await import("@/data/dashboard/before-after.server");
  const images = await deleteBeforeAfterItemForProfile(supabase, targetProfileId, itemId);

  await logAdminAction(
    supabase,
    "before_after_deleted",
    "before_after_item",
    itemId,
    (before as Json | null) ?? null,
    null,
  );
  return images;
}
