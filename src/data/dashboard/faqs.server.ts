// Server-only. Owner-scoped `faqs` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

export async function listOwnFaqs(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"faqs">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { data, error } = await supabase
    .from("faqs")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load FAQs: ${error.message}`);
  return data ?? [];
}

export type FaqInput = Pick<TablesInsert<"faqs">, "question" | "answer" | "is_published">;

export async function createFaq(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: FaqInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { error } = await supabase.from("faqs").insert({ ...input, beautician_profile_id: bpId });
  if (error) throw new Error(`Failed to add FAQ: ${error.message}`);
}

export async function updateFaq(
  supabase: SupabaseClient<Database>,
  faqId: string,
  updates: Partial<FaqInput>,
): Promise<void> {
  const { error } = await supabase.from("faqs").update(updates).eq("id", faqId);
  if (error) throw new Error(`Failed to update FAQ: ${error.message}`);
}

export async function deleteFaq(supabase: SupabaseClient<Database>, faqId: string): Promise<void> {
  const { error } = await supabase.from("faqs").delete().eq("id", faqId);
  if (error) throw new Error(`Failed to delete FAQ: ${error.message}`);
}
