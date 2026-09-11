// Server-only. Platform-wide beautician_profiles moderation for admins.
// RLS already grants admins full access to every profile (every owner
// policy on beautician_profiles is `OR has_role(auth.uid(),'admin')`), but
// this file explicitly checks the caller's role first rather than relying
// solely on RLS to silently filter results — a non-admin owner should see a
// clear "not authorized" message, not a table that looks like "the whole
// platform has 1 profile" (their own, via the owner policy).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import {
  PLAN_LABELS,
  MODULE_LABELS,
  type PlanLimitedModule,
  type PortfolioPlan,
} from "@/lib/plan-limits";

export type AdminProfileSummary = Pick<
  Tables<"beautician_profiles">,
  | "id"
  | "slug"
  | "display_name"
  | "status"
  | "is_demo"
  | "is_verified"
  | "is_featured"
  | "created_at"
  | "review_count"
  | "client_count"
  | "plan"
  | "completion_score"
  | "signup_source"
  | "billing_hold"
  | "plan_expires_at"
>;

export async function listAllProfiles(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminProfileSummary[]> {
  await assertIsAdmin(supabase, userId);

  const { data, error } = await supabase
    .from("beautician_profiles")
    .select(
      "id, slug, display_name, status, is_demo, is_verified, is_featured, created_at, review_count, client_count, plan, completion_score, signup_source, billing_hold, plan_expires_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load profiles: ${error.message}`);
  return data ?? [];
}

/**
 * Before a downgrade, validate the portfolio against the target tier
 * without deleting or hiding anything. Returns a list of human-readable
 * reasons (empty = the downgrade may proceed). Never called for an upgrade
 * (upgrades are always allowed) — callers should skip this check whenever
 * the target plan's rank is not lower than the current one.
 *
 * Billing Phase A: this now calls the ONE canonical DB compatibility
 * engine, public.check_plan_compatibility() — the same function
 * reconcile_commercial_state() uses for automatic expiry-to-Free. This
 * function only formats the DB's own verdict into actionable messages; it
 * must never recompute module counts/limits or the GTM rule independently
 * (that duplicated TS-side calculation — a per-module count loop plus a
 * separate gallery-photos and GTM check — has been removed).
 *
 * _ignore_gtm is deliberately `false` here: a manual Admin downgrade stays
 * strict — stored GTM tracking below Silver continues to block it unless
 * explicitly removed first. Automatic billing expiry (reconcile_commercial_
 * state()) is the ONLY caller allowed to pass `true`.
 */
export async function validatePlanDowngrade(
  supabase: SupabaseClient<Database>,
  profileId: string,
  targetPlan: PortfolioPlan,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("check_plan_compatibility", {
    _bp_id: profileId,
    _target_plan: targetPlan,
    _ignore_gtm: false,
  });
  if (error) throw new Error(`Failed to check plan compatibility: ${error.message}`);

  const reasons: string[] = [];
  for (const row of data ?? []) {
    if (row.compatible) continue;

    if (row.module === "gtm_tracking") {
      reasons.push(
        `A GTM tracking container is configured, but ${PLAN_LABELS[targetPlan]} does not allow tracking — remove it first.`,
      );
      continue;
    }

    const label = MODULE_LABELS[row.module as PlanLimitedModule] ?? row.module.replace(/_/g, " ");
    reasons.push(
      row.limit_count === 0
        ? `${row.current_count} ${label} exist, but ${PLAN_LABELS[targetPlan]} does not allow this content type — remove them first.`
        : `${row.current_count} ${label} exist, exceeding ${PLAN_LABELS[targetPlan]}'s limit of ${row.limit_count} — remove some first.`,
    );
  }

  return reasons;
}

const PLAN_RANK: Record<PortfolioPlan, number> = {
  free: 0,
  starter: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

/**
 * Admin-only plan change. Upgrades are always allowed. Downgrades are
 * validated first (see validatePlanDowngrade, now backed by the canonical
 * check_plan_compatibility() DB function) and rejected with an actionable
 * reason if the portfolio doesn't fit the target tier — content is never
 * deleted or hidden automatically. Admin can clean up the portfolio first
 * and retry.
 *
 * Billing Phase A commercial-state correctness: an explicit Admin plan
 * change is the second (alongside reconcile_commercial_state()) legitimate
 * writer of the 4 commercial-state columns, and must agree with its
 * semantics rather than inventing a second, divergent one —
 * - plan_source becomes 'manual' for any Admin-granted non-Free plan,
 *   'free' when Admin explicitly sets Free.
 * - plan_expires_at stays NULL: no expiry input is exposed by this phase
 *   (Admin manual grants remain indefinite by design — see
 *   reconcile_commercial_state()'s "manual, non-expiring" no-op branch).
 *   Expiry UI is deferred, not implemented here.
 * - billing_hold is explicitly cleared: an Admin setting a plan is a
 *   deliberate, authoritative correction of commercial state, so it also
 *   resolves any prior hold — a second, Admin-driven recovery path
 *   alongside confirm_continue_on_free(), appropriate since Admin already
 *   has full override authority over plan itself.
 * - commercial_state_version increments ONLY when the resulting state
 *   (plan, plan_source, plan_expires_at, billing_hold) actually differs
 *   from what was stored — so a stale future webhook correctly observes
 *   the new version, and a genuine no-op never bumps it.
 * - No billing_orders/payments rows are created or touched — this path
 *   never fabricates billing history; the change is recorded only via the
 *   existing audit_logs mechanism below, same as before this phase.
 */
export async function updateProfilePlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  profileId: string,
  targetPlan: PortfolioPlan,
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { data: before, error: fetchError } = await supabase
    .from("beautician_profiles")
    .select("plan, plan_source, plan_expires_at, billing_hold, commercial_state_version")
    .eq("id", profileId)
    .maybeSingle();
  if (fetchError || !before)
    throw new Error(`Failed to load profile: ${fetchError?.message ?? "not found"}`);

  if (PLAN_RANK[targetPlan] < PLAN_RANK[before.plan]) {
    const reasons = await validatePlanDowngrade(supabase, profileId, targetPlan);
    if (reasons.length > 0) {
      throw new Error(`Cannot downgrade to ${PLAN_LABELS[targetPlan]}: ${reasons.join(" ")}`);
    }
  }

  const nextPlanSource = targetPlan === "free" ? "free" : "manual";
  const nextExpiresAt: string | null = null;
  const nextBillingHold = false;

  const stateUnchanged =
    before.plan === targetPlan &&
    before.plan_source === nextPlanSource &&
    before.plan_expires_at === nextExpiresAt &&
    before.billing_hold === nextBillingHold;
  if (stateUnchanged) return;

  const { error } = await supabase
    .from("beautician_profiles")
    .update({
      plan: targetPlan,
      plan_source: nextPlanSource,
      plan_expires_at: nextExpiresAt,
      billing_hold: nextBillingHold,
      commercial_state_version: before.commercial_state_version + 1,
    })
    .eq("id", profileId);
  if (error) throw new Error(`Failed to update plan: ${error.message}`);

  await logAdminAction(
    supabase,
    "plan_changed",
    "beautician_profile",
    profileId,
    { plan: before.plan, plan_source: before.plan_source },
    { plan: targetPlan, plan_source: nextPlanSource },
  );
}

export async function updateProfileStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  profileId: string,
  status: Database["public"]["Enums"]["portfolio_status"],
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { data: before } = await supabase
    .from("beautician_profiles")
    .select("status")
    .eq("id", profileId)
    .maybeSingle();

  const { error } = await supabase
    .from("beautician_profiles")
    .update({ status })
    .eq("id", profileId);
  if (error) throw new Error(`Failed to update status: ${error.message}`);

  if (before && before.status !== status) {
    await logAdminAction(
      supabase,
      "profile_status_changed",
      "beautician_profile",
      profileId,
      { status: before.status },
      { status },
    );
  }
}

// Trigger-guarded: guard_beautician_profile_flags() resets these columns to
// their previous value on UPDATE unless the caller has the admin role, so
// this is defense-in-depth on top of the DB-level protection, not the only
// protection — same pattern as updateReviewModeration's is_verified field.
export async function updateProfileFlags(
  supabase: SupabaseClient<Database>,
  userId: string,
  profileId: string,
  updates: Partial<Pick<Tables<"beautician_profiles">, "is_verified" | "is_featured">>,
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { data: before } = await supabase
    .from("beautician_profiles")
    .select("is_verified, is_featured")
    .eq("id", profileId)
    .maybeSingle();

  const { error } = await supabase.from("beautician_profiles").update(updates).eq("id", profileId);
  if (error) throw new Error(`Failed to update profile flags: ${error.message}`);

  if (before) {
    if ("is_verified" in updates && updates.is_verified !== before.is_verified) {
      await logAdminAction(
        supabase,
        "verification_changed",
        "beautician_profile",
        profileId,
        { is_verified: before.is_verified },
        { is_verified: updates.is_verified },
      );
    }
    if ("is_featured" in updates && updates.is_featured !== before.is_featured) {
      await logAdminAction(
        supabase,
        "featured_changed",
        "beautician_profile",
        profileId,
        { is_featured: before.is_featured },
        { is_featured: updates.is_featured },
      );
    }
  }
}

export async function updateProfileSource(
  supabase: SupabaseClient<Database>,
  userId: string,
  profileId: string,
  signup_source: string | null,
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { error } = await supabase
    .from("beautician_profiles")
    .update({ signup_source })
    .eq("id", profileId);
  if (error) throw new Error(`Failed to update source: ${error.message}`);

  await logAdminAction(
    supabase,
    "profile_status_changed",
    "beautician_profile",
    profileId,
    {},
    { signup_source },
  );
}
