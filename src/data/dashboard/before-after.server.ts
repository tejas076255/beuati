// Server-only. Owner-scoped `before_after_items`/`before_after_images` CRUD
// for the Portfolio Builder. RLS (owns_beautician_profile()) enforces
// ownership.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

export type BeforeAfterItemWithImages = Tables<"before_after_items"> & {
  images: Tables<"before_after_images">[];
};

// Phase 5.2D — bpId-parameterized core query, shared by both the
// beautician's own-profile path (listOwnBeforeAfterItems, below) and the
// Master Admin Console's explicit-target path
// (src/data/admin/before-after.server.ts). This is the ONE query both
// callers use — never a duplicated/forked copy.
export async function listBeforeAfterItemsForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<BeforeAfterItemWithImages[]> {
  const { data: items, error } = await supabase
    .from("before_after_items")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load before/after items: ${error.message}`);
  if (!items || items.length === 0) return [];

  const { data: images, error: imagesError } = await supabase
    .from("before_after_images")
    .select("*")
    .in(
      "before_after_id",
      items.map((i) => i.id),
    );

  if (imagesError) throw new Error(`Failed to load before/after images: ${imagesError.message}`);

  const byItem = new Map<string, Tables<"before_after_images">[]>();
  for (const img of images ?? []) {
    const list = byItem.get(img.before_after_id) ?? [];
    list.push(img);
    byItem.set(img.before_after_id, list);
  }

  return items.map((item) => ({ ...item, images: byItem.get(item.id) ?? [] }));
}

export async function listOwnBeforeAfterItems(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BeforeAfterItemWithImages[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return listBeforeAfterItemsForProfile(supabase, bpId);
}

export interface BeforeAfterPairInput {
  title: string;
  eventType: string;
  location: string;
  description?: string;
  beforeStoragePath: string;
  afterStoragePath: string;
  isPublished?: boolean;
  /** Explicit, beautician-selected link to one of their own services
   * (Phase 3F.5) — applies to the whole before/after pair, never per-side.
   * DB-enforced ownership via trg_before_after_items_service_ownership
   * (guard_media_service_ownership()) — a service_id belonging to a
   * different beautician_profile_id is rejected at the database level
   * regardless of caller, admin included. */
  serviceId?: string | null;
}

// Phase 5.2D — bpId-parameterized core, shared with the admin path.
// Returns the new item's id so admin callers can attach it to an
// audit-log entity_id; the beautician's own path
// (createBeforeAfterPair, below) ignores it.
export async function createBeforeAfterPairForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  input: BeforeAfterPairInput,
): Promise<string> {
  const { data: item, error } = await supabase
    .from("before_after_items")
    .insert({
      beautician_profile_id: bpId,
      title: input.title,
      event_type: input.eventType,
      location: input.location,
      description: input.description || null,
      is_published: input.isPublished ?? true,
      service_id: input.serviceId ?? null,
    })
    .select("id")
    .single();

  if (error || !item) throw new Error(`Failed to create before/after item: ${error?.message}`);

  const { error: imagesError } = await supabase.from("before_after_images").insert([
    {
      before_after_id: item.id,
      image_type: "before",
      storage_path: input.beforeStoragePath,
      sort_order: 0,
    },
    {
      before_after_id: item.id,
      image_type: "after",
      storage_path: input.afterStoragePath,
      sort_order: 0,
    },
  ]);
  if (imagesError) throw new Error(`Failed to save before/after images: ${imagesError.message}`);

  return item.id;
}

export async function createBeforeAfterPair(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: BeforeAfterPairInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await createBeforeAfterPairForProfile(supabase, bpId, input);
}

/**
 * Confirms `itemId` actually belongs to `bpId` before any mutation — the
 * previous version of this file had NO application-layer ownership check
 * at all on any item/image mutation, relying purely on RLS
 * (owns_beautician_profile(), which already includes an admin-OR clause).
 * Correct for the beautician's own path (RLS alone fully secures it), but
 * insufficient for the admin path — same defense-in-depth pattern already
 * applied to Services (Phase 5.2A §12) and Gallery (Phase 5.2C §11/§12).
 */
async function assertItemBelongsToProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  itemId: string,
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("before_after_items")
    .select("beautician_profile_id")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error(`Failed to load before/after item: ${error?.message ?? "not found"}`);
  }
  if (existing.beautician_profile_id !== bpId) {
    throw new Error("This before/after item does not belong to the selected profile.");
  }
}

/** Same ownership guarantee as assertItemBelongsToProfile, but for an
 * image row (before or after side) — resolved through its parent
 * before_after_items row, since images don't carry
 * beautician_profile_id directly. */
async function assertImageBelongsToProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  imageId: string,
): Promise<void> {
  const { data: image, error } = await supabase
    .from("before_after_images")
    .select("before_after_id")
    .eq("id", imageId)
    .maybeSingle();
  if (error || !image) {
    throw new Error(`Failed to load image: ${error?.message ?? "not found"}`);
  }
  await assertItemBelongsToProfile(supabase, bpId, image.before_after_id);
}

export interface BeforeAfterItemUpdate {
  title: string;
  eventType: string;
  location: string;
  description?: string;
  isPublished?: boolean;
  /** See createBeforeAfterPairForProfile — same DB-enforced ownership rule. */
  serviceId?: string | null;
}

export async function updateBeforeAfterItemForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  itemId: string,
  updates: BeforeAfterItemUpdate,
): Promise<void> {
  await assertItemBelongsToProfile(supabase, bpId, itemId);

  const { error } = await supabase
    .from("before_after_items")
    .update({
      title: updates.title,
      event_type: updates.eventType,
      location: updates.location,
      description: updates.description || null,
      ...(updates.isPublished != null ? { is_published: updates.isPublished } : {}),
      service_id: updates.serviceId ?? null,
    })
    .eq("id", itemId);

  if (error) throw new Error(`Failed to update before/after item: ${error.message}`);
}

export async function updateBeforeAfterItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemId: string,
  updates: BeforeAfterItemUpdate,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await updateBeforeAfterItemForProfile(supabase, bpId, itemId, updates);
}

/** Replaces the storage_path on an existing before/after image row in
 * place — preserves image_type/sort_order, so editing one side of the pair
 * never disturbs the other, and never needs to delete+recreate the row.
 * Safe replacement order (unchanged): the caller uploads the NEW object
 * first, calls this to point the DB row at it, and only deletes the OLD
 * storage object after this DB update has succeeded — so a failure here
 * never leaves the pair pointing at a deleted object. */
export async function replaceBeforeAfterImageForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  imageId: string,
  newStoragePath: string,
): Promise<string | null> {
  await assertImageBelongsToProfile(supabase, bpId, imageId);

  const { data: existing } = await supabase
    .from("before_after_images")
    .select("storage_path")
    .eq("id", imageId)
    .single();

  const { error } = await supabase
    .from("before_after_images")
    .update({ storage_path: newStoragePath })
    .eq("id", imageId);

  if (error) throw new Error(`Failed to replace image: ${error.message}`);
  return existing?.storage_path ?? null;
}

export async function replaceBeforeAfterImage(
  supabase: SupabaseClient<Database>,
  userId: string,
  imageId: string,
  newStoragePath: string,
): Promise<string | null> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return replaceBeforeAfterImageForProfile(supabase, bpId, imageId, newStoragePath);
}

/** Saves the beautician's own photo description for one before/after image
 * — reuses the existing `alt_text` column, no schema change. Empty input
 * clears back to null so the automatic before/after fallback takes over. */
export async function updateImageAltTextForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  imageId: string,
  altText: string,
): Promise<void> {
  await assertImageBelongsToProfile(supabase, bpId, imageId);

  const { error } = await supabase
    .from("before_after_images")
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

export async function deleteBeforeAfterItemForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  itemId: string,
): Promise<Tables<"before_after_images">[]> {
  await assertItemBelongsToProfile(supabase, bpId, itemId);

  const { data: images } = await supabase
    .from("before_after_images")
    .select("*")
    .eq("before_after_id", itemId);

  const { error } = await supabase.from("before_after_items").delete().eq("id", itemId);
  if (error) throw new Error(`Failed to delete before/after item: ${error.message}`);

  return images ?? [];
}

export async function deleteBeforeAfterItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemId: string,
): Promise<Tables<"before_after_images">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return deleteBeforeAfterItemForProfile(supabase, bpId, itemId);
}
