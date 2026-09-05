// Server-only. Admin-facing Portfolio Completion Score read for an
// explicitly-target professional. The RPC itself (compute_portfolio_score_by_id)
// already authorizes Admin internally (has_role check) — this file's
// assertIsAdmin call is defense-in-depth matching every other admin/*.server.ts
// file's convention, not the only guard.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import type { CompletionScoreBreakdown } from "@/lib/completion-score";

export async function getCompletionScoreAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<CompletionScoreBreakdown> {
  await assertIsAdmin(supabase, adminUserId);
  const { data, error } = await supabase.rpc("compute_portfolio_score_by_id", {
    _bp_id: targetProfileId,
  });
  if (error) throw new Error(`Failed to load completion score: ${error.message}`);
  return data as unknown as CompletionScoreBreakdown;
}
