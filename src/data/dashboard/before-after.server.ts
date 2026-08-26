// Server-only. Owner-scoped `before_after_items`/`before_after_images` CRUD
// for the Portfolio Builder. RLS (owns_beautician_profile()) enforces
// ownership.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

export type BeforeAfterItemWithImages = Tables<"before_after_items"> & {
  images: Tables<"before_after_images">[];
};

export async function listOwnBeforeAfterItems(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BeforeAfterItemWithImages[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
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

export async function createBeforeAfterPair(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    title: string;
    eventType: string;
    location: string;
    description?: string;
    beforeStoragePath: string;
    afterStoragePath: string;
    isPublished?: boolean;
    /** Explicit, beautician-selected link to one of their own services
     * (Phase 3F.5) — applies to the whole before/after pair, never per-side.
     * DB-enforced ownership via a BEFORE INSERT/UPDATE trigger. */
    serviceId?: string | null;
  },
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);

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
}

export async function updateBeforeAfterItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
  updates: {
    title: string;
    eventType: string;
    location: string;
    description?: string;
    isPublished?: boolean;
    /** See createBeforeAfterPair — same DB-enforced ownership rule. */
    serviceId?: string | null;
  },
): Promise<void> {
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

/** Replaces the storage_path on an existing before/after image row in
 * place — preserves image_type/sort_order, so editing one side of the pair
 * never disturbs the other, and never needs to delete+recreate the row. */
export async function replaceBeforeAfterImage(
  supabase: SupabaseClient<Database>,
  imageId: string,
  newStoragePath: string,
): Promise<string | null> {
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

/** Saves the beautician's own photo description for one before/after image
 * — reuses the existing `alt_text` column, no schema change. Empty input
 * clears back to null so the automatic before/after fallback takes over. */
export async function updateImageAltText(
  supabase: SupabaseClient<Database>,
  imageId: string,
  altText: string,
): Promise<void> {
  const { error } = await supabase
    .from("before_after_images")
    .update({ alt_text: altText.trim() || null })
    .eq("id", imageId);
  if (error) throw new Error(`Failed to save photo description: ${error.message}`);
}

export async function deleteBeforeAfterItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
): Promise<Tables<"before_after_images">[]> {
  const { data: images } = await supabase
    .from("before_after_images")
    .select("*")
    .eq("before_after_id", itemId);

  const { error } = await supabase.from("before_after_items").delete().eq("id", itemId);
  if (error) throw new Error(`Failed to delete before/after item: ${error.message}`);

  return images ?? [];
}
