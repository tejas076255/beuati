// Server-only. Owner-scoped `faqs` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

// Phase 5.2G — bpId-parameterized core query, shared by both the
// beautician's own-profile path (listOwnFaqs, below) and the Master Admin
// Console's explicit-target path (src/data/admin/faqs.server.ts). This is
// the ONE query both callers use — never a duplicated/forked copy.
export async function listFaqsForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<Tables<"faqs">[]> {
  const { data, error } = await supabase
    .from("faqs")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load FAQs: ${error.message}`);
  return data ?? [];
}

export async function listOwnFaqs(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"faqs">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return listFaqsForProfile(supabase, bpId);
}

export type FaqInput = Pick<TablesInsert<"faqs">, "question" | "answer" | "is_published">;

// Phase 5.2G — bpId-parameterized core, shared with the admin path.
// Returns the new row's id so admin callers can attach it to an audit-log
// entity_id; the beautician's own path (createFaq, below) ignores it.
export async function createFaqForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  input: FaqInput,
): Promise<string> {
  const { data, error } = await supabase
    .from("faqs")
    .insert({ ...input, beautician_profile_id: bpId })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to add FAQ: ${error?.message}`);
  return data.id;
}

export async function createFaq(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: FaqInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await createFaqForProfile(supabase, bpId, input);
}

/**
 * Confirms `faqId` actually belongs to `bpId` before any mutation — the
 * previous version of this file had NO application-layer ownership check
 * at all on update/delete, relying purely on RLS
 * (owns_beautician_profile(), which already includes an admin-OR clause).
 * Correct for the beautician's own path (RLS alone fully secures it), but
 * insufficient for the admin path — same defense-in-depth pattern already
 * applied to Services (5.2A), Gallery (5.2C), Before & After (5.2D),
 * Videos (5.2E), and Packages (5.2F).
 */
async function assertFaqBelongsToProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  faqId: string,
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("faqs")
    .select("beautician_profile_id")
    .eq("id", faqId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error(`Failed to load FAQ: ${error?.message ?? "not found"}`);
  }
  if (existing.beautician_profile_id !== bpId) {
    throw new Error("This FAQ does not belong to the selected profile.");
  }
}

export async function updateFaqForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  faqId: string,
  updates: Partial<FaqInput>,
): Promise<void> {
  await assertFaqBelongsToProfile(supabase, bpId, faqId);

  const { error } = await supabase.from("faqs").update(updates).eq("id", faqId);
  if (error) throw new Error(`Failed to update FAQ: ${error.message}`);
}

export async function updateFaq(
  supabase: SupabaseClient<Database>,
  userId: string,
  faqId: string,
  updates: Partial<FaqInput>,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await updateFaqForProfile(supabase, bpId, faqId, updates);
}

export async function deleteFaqForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  faqId: string,
): Promise<void> {
  await assertFaqBelongsToProfile(supabase, bpId, faqId);

  const { error } = await supabase.from("faqs").delete().eq("id", faqId);
  if (error) throw new Error(`Failed to delete FAQ: ${error.message}`);
}

export async function deleteFaq(
  supabase: SupabaseClient<Database>,
  userId: string,
  faqId: string,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await deleteFaqForProfile(supabase, bpId, faqId);
}
