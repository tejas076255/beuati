// Server-only. Master Admin Console — Gallery Manager (Phase 5.2C).
//
// Admin never impersonates the beautician: every function here runs under
// the ADMIN's own authenticated session (assertIsAdmin checks the real
// caller), operating on an explicitly-supplied target beautician_profile_id
// resolved from the URL slug via the SAME resolveAdminTargetProfile already
// established in Phase 5.2A (src/data/admin/services.server.ts). RLS
// already permits this — portfolio_items/portfolio_images owner policies
// already include an `OR has_role(auth.uid(),'admin')` clause (via
// owns_beautician_profile(), confirmed live in the Phase 5.1 audit and
// re-confirmed for this phase) — so no RLS change was needed.
//
// Query/mutation logic itself is never duplicated: every read/write below
// delegates to the exact same bpId-parameterized core functions in
// src/data/dashboard/gallery.server.ts that the beautician's own
// /dashboard/gallery page uses — this file only adds the admin
// authorization gate, explicit target resolution reuse, and audit logging
// on top. Those core functions now also carry an explicit
// item/image-belongs-to-bpId check (added this phase) that RLS alone
// didn't previously enforce at the application layer — see
// dashboard/gallery.server.ts's assertItemBelongsToProfile doc comment.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import type {
  GalleryItemInput,
  NewGalleryImage,
  PortfolioItemUpdate,
  PortfolioItemWithImages,
} from "@/data/dashboard/gallery.server";

export async function listGalleryAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<PortfolioItemWithImages[]> {
  await assertIsAdmin(supabase, adminUserId);
  const { listPortfolioItemsForProfile } = await import("@/data/dashboard/gallery.server");
  return listPortfolioItemsForProfile(supabase, targetProfileId);
}

export async function createGalleryItemAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  input: GalleryItemInput,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { assertOwnerCanAddGalleryPhotos } =
    await import("@/data/dashboard/plan-enforcement.server");
  await assertOwnerCanAddGalleryPhotos(supabase, targetProfileId, input.images.length);
  const { createPortfolioItemForProfile } = await import("@/data/dashboard/gallery.server");
  const newId = await createPortfolioItemForProfile(supabase, targetProfileId, input);

  await logAdminAction(supabase, "gallery_item_created", "gallery_item", newId, null, {
    title: input.title,
    category: input.category,
    imageCount: input.images.length,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function updateGalleryItemAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  itemId: string,
  updates: PortfolioItemUpdate,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("portfolio_items")
    .select("title, category, is_published, service_id")
    .eq("id", itemId)
    .maybeSingle();

  const { updatePortfolioItemForProfile } = await import("@/data/dashboard/gallery.server");
  await updatePortfolioItemForProfile(supabase, targetProfileId, itemId, updates);

  await logAdminAction(
    supabase,
    "gallery_item_updated",
    "gallery_item",
    itemId,
    (before as Json | null) ?? null,
    { ...updates, beautician_profile_id: targetProfileId } as Json,
  );
}

export async function addGalleryImagesAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  itemId: string,
  images: NewGalleryImage[],
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { assertOwnerCanAddGalleryPhotos } =
    await import("@/data/dashboard/plan-enforcement.server");
  await assertOwnerCanAddGalleryPhotos(supabase, targetProfileId, images.length);
  const { addPortfolioImagesForProfile } = await import("@/data/dashboard/gallery.server");
  await addPortfolioImagesForProfile(supabase, targetProfileId, itemId, images);

  await logAdminAction(supabase, "gallery_item_updated", "gallery_item", itemId, null, {
    imagesAdded: images.length,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function updateGalleryImageAltAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  imageId: string,
  altText: string,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { updateImageAltTextForProfile } = await import("@/data/dashboard/gallery.server");
  await updateImageAltTextForProfile(supabase, targetProfileId, imageId, altText);

  await logAdminAction(supabase, "gallery_item_updated", "gallery_item", imageId, null, {
    imageAltTextUpdated: true,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function deleteGalleryImageAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  imageId: string,
): Promise<string | null> {
  await assertIsAdmin(supabase, adminUserId);
  const { deletePortfolioImageForProfile } = await import("@/data/dashboard/gallery.server");
  const storagePath = await deletePortfolioImageForProfile(supabase, targetProfileId, imageId);

  await logAdminAction(
    supabase,
    "gallery_item_updated",
    "gallery_item",
    imageId,
    { storage_path: storagePath } as Json,
    null,
  );
  return storagePath;
}

export async function deleteGalleryItemAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  itemId: string,
): Promise<Tables<"portfolio_images">[]> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("portfolio_items")
    .select("title, category, beautician_profile_id")
    .eq("id", itemId)
    .maybeSingle();

  const { deletePortfolioItemForProfile } = await import("@/data/dashboard/gallery.server");
  const images = await deletePortfolioItemForProfile(supabase, targetProfileId, itemId);

  await logAdminAction(
    supabase,
    "gallery_item_deleted",
    "gallery_item",
    itemId,
    (before as Json | null) ?? null,
    null,
  );
  return images;
}
