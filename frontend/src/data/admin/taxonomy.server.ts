// Server-only. Admin-managed reference taxonomies used across every
// beautician's Services page: categories and specializations. RLS
// (svc_cat_admin_write / spec_admin_write) already restricts writes to
// admins; this file just decides what to insert and generates a unique slug.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { slugify } from "@/lib/slugify";
import { assertIsAdmin } from "./shared.server";

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export type TaxonomyInput = {
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

async function insertCategoryWithUniqueSlug(
  supabase: SupabaseClient<Database>,
  input: TaxonomyInput,
): Promise<void> {
  const baseSlug = slugify(input.name) || "item";

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
    const { error } = await supabase
      .from("service_categories")
      .insert({ ...input, slug: candidateSlug });

    if (!error) return;
    // 23505 = unique_violation (slug already taken) — retry with a suffix.
    if (error.code !== "23505") throw new Error(`Failed to create: ${error.message}`);
  }

  throw new Error("Could not generate a unique slug — please try a different name.");
}

async function insertSpecializationWithUniqueSlug(
  supabase: SupabaseClient<Database>,
  input: TaxonomyInput,
): Promise<void> {
  const baseSlug = slugify(input.name) || "item";

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
    const { error } = await supabase
      .from("specializations")
      .insert({ ...input, slug: candidateSlug });

    if (!error) return;
    // 23505 = unique_violation (slug already taken) — retry with a suffix.
    if (error.code !== "23505") throw new Error(`Failed to create: ${error.message}`);
  }

  throw new Error("Could not generate a unique slug — please try a different name.");
}

// ---------- service categories ----------

export async function listServiceCategories(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"service_categories">[]> {
  await assertIsAdmin(supabase, userId);
  const { data, error } = await supabase.from("service_categories").select("*").order("sort_order");
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  return data ?? [];
}

export async function createServiceCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: TaxonomyInput,
): Promise<void> {
  await assertIsAdmin(supabase, userId);
  await insertCategoryWithUniqueSlug(supabase, input);
}

export async function updateServiceCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  updates: Partial<TaxonomyInput>,
): Promise<void> {
  await assertIsAdmin(supabase, userId);
  const { error } = await supabase.from("service_categories").update(updates).eq("id", id);
  if (error) throw new Error(`Failed to update category: ${error.message}`);
}

export async function deleteServiceCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
): Promise<void> {
  await assertIsAdmin(supabase, userId);
  const { error } = await supabase.from("service_categories").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete category: ${error.message}`);
}

// ---------- specializations ----------

export async function listSpecializations(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"specializations">[]> {
  await assertIsAdmin(supabase, userId);
  const { data, error } = await supabase.from("specializations").select("*").order("sort_order");
  if (error) throw new Error(`Failed to load specializations: ${error.message}`);
  return data ?? [];
}

export async function createSpecialization(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: TaxonomyInput,
): Promise<void> {
  await assertIsAdmin(supabase, userId);
  await insertSpecializationWithUniqueSlug(supabase, input);
}

export async function updateSpecialization(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  updates: Partial<TaxonomyInput>,
): Promise<void> {
  await assertIsAdmin(supabase, userId);
  const { error } = await supabase.from("specializations").update(updates).eq("id", id);
  if (error) throw new Error(`Failed to update specialization: ${error.message}`);
}

export async function deleteSpecialization(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
): Promise<void> {
  await assertIsAdmin(supabase, userId);
  const { error } = await supabase.from("specializations").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete specialization: ${error.message}`);
}
