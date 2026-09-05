// Server-only. Owner-scoped Portfolio Completion Score read. The score
// itself is entirely system-computed in SQL
// (public.compute_portfolio_score / compute_portfolio_score_by_id, see
// the completion-score migration) — this file only resolves the caller's
// own beautician_profile_id and calls the RPC. No scoring logic lives
// here or anywhere in TypeScript.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";
import type { CompletionScoreBreakdown } from "@/lib/completion-score";

export async function getOwnCompletionScore(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CompletionScoreBreakdown> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { data, error } = await supabase.rpc("compute_portfolio_score_by_id", { _bp_id: bpId });
  if (error) throw new Error(`Failed to load completion score: ${error.message}`);
  return data as unknown as CompletionScoreBreakdown;
}
