// Server-only. Owner-scoped `portfolio_items`/`portfolio_images` CRUD for
// the Portfolio Builder. RLS (owns_beautician_profile()) enforces ownership.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

export type PortfolioItemWithImages = Tables<"portfolio_items"> & {
  images: Tables<"portfolio_images">[];
};

export async function listOwnPortfolioItems(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PortfolioItemWithImages[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
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

export interface NewGalleryImage {
  storagePath: string;
  altText?: string;
}

export async function createPortfolioItemWithImages(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
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
  },
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);

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
}

export async function deletePortfolioItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
): Promise<Tables<"portfolio_images">[]> {
  const { data: images } = await supabase
    .from("portfolio_images")
    .select("*")
    .eq("portfolio_item_id", itemId);

  const { error } = await supabase.from("portfolio_items").delete().eq("id", itemId);
  if (error) throw new Error(`Failed to delete gallery item: ${error.message}`);

  return images ?? [];
}

export async function updatePortfolioItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
  updates: {
    title: string;
    category: string;
    isPublished?: boolean;
    /** See createPortfolioItemWithImages — same DB-enforced ownership rule. */
    serviceId?: string | null;
  },
): Promise<void> {
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

export async function addPortfolioImages(
  supabase: SupabaseClient<Database>,
  itemId: string,
  images: NewGalleryImage[],
): Promise<void> {
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

/** Saves the beautician's own photo description for one gallery image —
 * reuses the existing `alt_text` column (already read on the public side),
 * no schema change. Empty input clears back to null so the automatic
 * fallback in src/lib/media-alt-text.ts takes over again. */
export async function updateImageAltText(
  supabase: SupabaseClient<Database>,
  imageId: string,
  altText: string,
): Promise<void> {
  const { error } = await supabase
    .from("portfolio_images")
    .update({ alt_text: altText.trim() || null })
    .eq("id", imageId);
  if (error) throw new Error(`Failed to save photo description: ${error.message}`);
}

export async function deletePortfolioImage(
  supabase: SupabaseClient<Database>,
  imageId: string,
): Promise<string | null> {
  const { data: image } = await supabase
    .from("portfolio_images")
    .select("storage_path")
    .eq("id", imageId)
    .single();

  const { error } = await supabase.from("portfolio_images").delete().eq("id", imageId);
  if (error) throw new Error(`Failed to remove image: ${error.message}`);

  return image?.storage_path ?? null;
}
