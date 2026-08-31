// Server-only. Owner-scoped `portfolio_items`/`portfolio_images` CRUD for
// the Portfolio Builder. RLS (owns_beautician_profile()) enforces ownership.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

export type PortfolioItemWithImages = Tables<"portfolio_items"> & {
  images: Tables<"portfolio_images">[];
};

// Phase 5.2C — bpId-parameterized core query, shared by both the
// beautician's own-profile path (listOwnPortfolioItems, below) and the
// Master Admin Console's explicit-target path
// (src/data/admin/gallery.server.ts). This is the ONE query both callers
// use — never a duplicated/forked copy.
export async function listPortfolioItemsForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<PortfolioItemWithImages[]> {
  const { data: items, error } = await supabase
    .from("portfolio_items")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load gallery: ${error.message}`);
  if (!items || items.length === 0) return [];

  const { data: images, error: imagesError } = await supabase
    .from("portfolio_images")
    .select("*")
    .in(
      "portfolio_item_id",
      items.map((i) => i.id),
    )
    .order("sort_order");

  if (imagesError) throw new Error(`Failed to load gallery images: ${imagesError.message}`);

  const byItem = new Map<string, Tables<"portfolio_images">[]>();
  for (const img of images ?? []) {
    const list = byItem.get(img.portfolio_item_id) ?? [];
    list.push(img);
    byItem.set(img.portfolio_item_id, list);
  }

  return items.map((item) => ({ ...item, images: byItem.get(item.id) ?? [] }));
}

export async function listOwnPortfolioItems(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PortfolioItemWithImages[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return listPortfolioItemsForProfile(supabase, bpId);
}

export interface NewGalleryImage {
  storagePath: string;
  altText?: string;
}

export interface GalleryItemInput {
  title: string;
  category: string;
  images: NewGalleryImage[];
  isPublished?: boolean;
  /** Explicit, beautician-selected link to one of their own services
   * (Phase 3F.5) — never inferred from category/title. `owns_service()`
   * (enforced at the DB level via a BEFORE INSERT/UPDATE trigger) rejects
   * any service_id that doesn't belong to this same profile, so a forged
   * cross-profile assignment can't succeed even if this value were
   * tampered with client-side. */
  serviceId?: string | null;
}

// Phase 5.2C — bpId-parameterized core, shared with the admin path.
// Returns the new item's id so admin callers can attach it to an
// audit-log entity_id; the beautician's own path
// (createPortfolioItemWithImages, below) ignores it.
export async function createPortfolioItemForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  input: GalleryItemInput,
): Promise<string> {
  const { data: item, error } = await supabase
    .from("portfolio_items")
    .insert({
      beautician_profile_id: bpId,
      title: input.title,
      category: input.category,
      is_published: input.isPublished ?? true,
      service_id: input.serviceId ?? null,
    })
    .select("id")
    .single();

  if (error || !item) throw new Error(`Failed to create gallery item: ${error?.message}`);

  const rows = input.images.map((img, index) => ({
    portfolio_item_id: item.id,
    storage_path: img.storagePath,
    alt_text: img.altText ?? null,
    sort_order: index,
    is_cover: index === 0,
  }));

  const { error: imagesError } = await supabase.from("portfolio_images").insert(rows);
  if (imagesError) throw new Error(`Failed to save gallery images: ${imagesError.message}`);

  return item.id;
}

export async function createPortfolioItemWithImages(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: GalleryItemInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await createPortfolioItemForProfile(supabase, bpId, input);
}

/**
 * Confirms `itemId` actually belongs to `bpId` before any mutation — the
 * previous version of this file had NO application-layer ownership check
 * at all on any item/image mutation, relying purely on RLS
 * (owns_beautician_profile(), which already includes an admin-OR clause).
 * That's correct for the beautician's own path (RLS alone fully secures
 * it), but insufficient for the admin path: a real admin's session
 * legitimately passes RLS for EVERY beautician's rows, so without this
 * explicit check an admin workspace targeting Beautician A could still
 * mutate a stale/crafted item id belonging to Beautician B (Phase 5.2C
 * §11/§12 — the same defense-in-depth pattern already applied to Services
 * in Phase 5.2A §12).
 */
async function assertItemBelongsToProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  itemId: string,
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("portfolio_items")
    .select("beautician_profile_id")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error(`Failed to load gallery item: ${error?.message ?? "not found"}`);
  }
  if (existing.beautician_profile_id !== bpId) {
    throw new Error("This gallery item does not belong to the selected profile.");
  }
}

/** Same ownership guarantee as assertItemBelongsToProfile, but for an
 * image row — resolved through its parent portfolio_item, since images
 * don't carry beautician_profile_id directly. */
async function assertImageBelongsToProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  imageId: string,
): Promise<void> {
  const { data: image, error } = await supabase
    .from("portfolio_images")
    .select("portfolio_item_id")
    .eq("id", imageId)
    .maybeSingle();
  if (error || !image) {
    throw new Error(`Failed to load image: ${error?.message ?? "not found"}`);
  }
  await assertItemBelongsToProfile(supabase, bpId, image.portfolio_item_id);
}

export async function deletePortfolioItemForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  itemId: string,
): Promise<Tables<"portfolio_images">[]> {
  await assertItemBelongsToProfile(supabase, bpId, itemId);

  const { data: images } = await supabase
    .from("portfolio_images")
    .select("*")
    .eq("portfolio_item_id", itemId);

  const { error } = await supabase.from("portfolio_items").delete().eq("id", itemId);
  if (error) throw new Error(`Failed to delete gallery item: ${error.message}`);

  return images ?? [];
}

export async function deletePortfolioItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemId: string,
): Promise<Tables<"portfolio_images">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return deletePortfolioItemForProfile(supabase, bpId, itemId);
}

export interface PortfolioItemUpdate {
  title: string;
  category: string;
  isPublished?: boolean;
  /** See createPortfolioItemForProfile — same DB-enforced ownership rule. */
  serviceId?: string | null;
}

export async function updatePortfolioItemForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  itemId: string,
  updates: PortfolioItemUpdate,
): Promise<void> {
  await assertItemBelongsToProfile(supabase, bpId, itemId);

  const { error } = await supabase
    .from("portfolio_items")
    .update({
      title: updates.title,
      category: updates.category,
      ...(updates.isPublished != null ? { is_published: updates.isPublished } : {}),
      service_id: updates.serviceId ?? null,
    })
    .eq("id", itemId);
  if (error) throw new Error(`Failed to update gallery item: ${error.message}`);
}

export async function updatePortfolioItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemId: string,
  updates: PortfolioItemUpdate,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await updatePortfolioItemForProfile(supabase, bpId, itemId, updates);
}

export async function addPortfolioImagesForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  itemId: string,
  images: NewGalleryImage[],
): Promise<void> {
  await assertItemBelongsToProfile(supabase, bpId, itemId);

  const { data: existing, error: existingError } = await supabase
    .from("portfolio_images")
    .select("sort_order")
    .eq("portfolio_item_id", itemId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (existingError) throw new Error(`Failed to load gallery images: ${existingError.message}`);
  const nextIndex = (existing?.[0]?.sort_order ?? -1) + 1;

  const rows = images.map((img, index) => ({
    portfolio_item_id: itemId,
    storage_path: img.storagePath,
    alt_text: img.altText ?? null,
    sort_order: nextIndex + index,
    is_cover: false,
  }));

  const { error } = await supabase.from("portfolio_images").insert(rows);
  if (error) throw new Error(`Failed to add gallery images: ${error.message}`);
}

export async function addPortfolioImages(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemId: string,
  images: NewGalleryImage[],
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await addPortfolioImagesForProfile(supabase, bpId, itemId, images);
}

/** Saves the beautician's own photo description for one gallery image —
 * reuses the existing `alt_text` column (already read on the public side),
 * no schema change. Empty input clears back to null so the automatic
 * fallback in src/lib/media-alt-text.ts takes over again. */
export async function updateImageAltTextForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  imageId: string,
  altText: string,
): Promise<void> {
  await assertImageBelongsToProfile(supabase, bpId, imageId);

  const { error } = await supabase
    .from("portfolio_images")
    .update({ alt_text: altText.trim() || null })
    .eq("id", imageId);
  if (error) throw new Error(`Failed to save photo description: ${error.message}`);
}

export async function updateImageAltText(
  supabase: SupabaseClient<Database>,
  userId: string,
  imageId: string,
  altText: string,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await updateImageAltTextForProfile(supabase, bpId, imageId, altText);
}

export async function deletePortfolioImageForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  imageId: string,
): Promise<string | null> {
  await assertImageBelongsToProfile(supabase, bpId, imageId);

  const { data: image } = await supabase
    .from("portfolio_images")
    .select("storage_path")
    .eq("id", imageId)
    .single();

  const { error } = await supabase.from("portfolio_images").delete().eq("id", imageId);
  if (error) throw new Error(`Failed to remove image: ${error.message}`);

  return image?.storage_path ?? null;
}

export async function deletePortfolioImage(
  supabase: SupabaseClient<Database>,
  userId: string,
  imageId: string,
): Promise<string | null> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return deletePortfolioImageForProfile(supabase, bpId, imageId);
}
