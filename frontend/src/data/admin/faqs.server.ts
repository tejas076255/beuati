// Server-only. Master Admin Console — FAQs Manager (Phase 5.2G).
//
// Admin never impersonates the beautician: every function here runs under
// the ADMIN's own authenticated session (assertIsAdmin checks the real
// caller), operating on an explicitly-supplied target beautician_profile_id
// resolved from the URL slug via the SAME resolveAdminTargetProfile already
// established in Phase 5.2A. RLS already permits this — `faqs`' owner
// policy already includes an `OR has_role(auth.uid(),'admin')` clause (via
// owns_beautician_profile(), re-confirmed live for this phase) — so no RLS
// change was needed.
//
// Query/mutation logic itself is never duplicated: every read/write below
// delegates to the exact same bpId-parameterized core functions in
// src/data/dashboard/faqs.server.ts that the beautician's own
// /dashboard/faqs page uses — this file only adds the admin authorization
// gate, explicit target resolution reuse, and audit logging on top. Those
// core functions now also carry an explicit faq-belongs-to-bpId check
// (added this phase, mirroring Gallery/Before & After/Videos/Packages
// hardening from 5.2C/5.2D/5.2E/5.2F) that RLS alone didn't previously
// enforce at the application layer.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import type { FaqInput } from "@/data/dashboard/faqs.server";

export async function listFaqsAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<Tables<"faqs">[]> {
  await assertIsAdmin(supabase, adminUserId);
  const { listFaqsForProfile } = await import("@/data/dashboard/faqs.server");
  return listFaqsForProfile(supabase, targetProfileId);
}

export async function createFaqAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  input: FaqInput,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { assertOwnerCanCreate } = await import("@/data/dashboard/plan-enforcement.server");
  await assertOwnerCanCreate(supabase, targetProfileId, "faqs");
  const { createFaqForProfile } = await import("@/data/dashboard/faqs.server");
  const newId = await createFaqForProfile(supabase, targetProfileId, input);

  await logAdminAction(supabase, "faq_created", "faq", newId, null, {
    question: input.question,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function updateFaqAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  faqId: string,
  updates: Partial<FaqInput>,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("faqs")
    .select("question, answer, is_published")
    .eq("id", faqId)
    .maybeSingle();

  const { updateFaqForProfile } = await import("@/data/dashboard/faqs.server");
  await updateFaqForProfile(supabase, targetProfileId, faqId, updates);

  await logAdminAction(supabase, "faq_updated", "faq", faqId, (before as Json | null) ?? null, {
    ...updates,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function deleteFaqAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  faqId: string,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("faqs")
    .select("question, beautician_profile_id")
    .eq("id", faqId)
    .maybeSingle();

  const { deleteFaqForProfile } = await import("@/data/dashboard/faqs.server");
  await deleteFaqForProfile(supabase, targetProfileId, faqId);

  await logAdminAction(
    supabase,
    "faq_deleted",
    "faq",
    faqId,
    (before as Json | null) ?? null,
    null,
  );
}
