// Server-only. Thin, trusted wrappers around this codebase's three
// commercial-state SECURITY DEFINER RPCs. Never import this module from a
// route/component file directly — only from other .server.ts modules /
// server function handlers.
//
// - reconcileCommercialState() / ensurePublicAccessSafe() call
//   reconcile_commercial_state() / is_commercial_access_current(), both
//   service_role-only EXECUTE — their caller must dynamically import
//   supabaseAdmin, exactly like client.server.ts's own convention ("load
//   inside server handlers").
// - confirmContinueOnFree() calls confirm_continue_on_free(), which is
//   authenticated-EXECUTE with an in-function ownership/Admin check — its
//   caller must pass the acting user's OWN authenticated Supabase client
//   (never supabaseAdmin; see that function's doc comment below for why).
//
// NOTE (expected until the Billing Phase A migration is actually applied
// and `supabase gen types` is re-run): none of these RPCs yet exist in
// the generated Database type, so the `.rpc(...)` calls below are not yet
// type-checkable against the real schema. This is the documented,
// expected state for a foundation-only pass — see the implementation
// report's TypeScript/build results.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Best-effort, fail-soft reconciliation trigger. A failure here never
 * throws to the caller — the caller's own read of stored commercial state
 * (billing_hold, plan, etc.) is always the actual gate; this call only
 * exists to keep that stored state fresh. A failure leaves stored state
 * exactly as it already was, which is the same bounded staleness risk
 * already accepted for zero-traffic portfolios in the approved design (no
 * scheduled backstop exists yet) — never a new or worse exposure.
 */
export async function reconcileCommercialState(
  supabaseAdmin: SupabaseClient<Database>,
  beauticianProfileId: string,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc("reconcile_commercial_state", {
      _bp_id: beauticianProfileId,
    });
    if (error) {
      console.error(
        `[billing] reconcile_commercial_state failed for ${beauticianProfileId}:`,
        error.message,
      );
    }
  } catch (err) {
    console.error(`[billing] reconcile_commercial_state threw for ${beauticianProfileId}:`, err);
  }
}

/**
 * Public-visibility safety gate (final QA-gate patch). The public
 * portfolio loader is billing-sensitive: it must NEVER continue serving a
 * portfolio on the strength of stale stored state alone if reconciliation
 * couldn't confirm that state is current. This function is the ONLY
 * decision point the public loader consults — it never independently
 * recomputes Free-compatibility (that remains check_plan_compatibility()'s
 * sole authority) and never invents a second grace-period constant (it
 * defers entirely to commercial_grace_period() via the SQL side).
 *
 * Policy:
 * 1. Attempt reconcile_commercial_state(). If it succeeds, stored state is
 *    now authoritative and current — safe to proceed.
 * 2. If reconciliation fails, fall back to is_commercial_access_current():
 *    a narrow, read-only, time/hold-based SQL check that proves whether
 *    the CURRENTLY STORED state independently demonstrates no billing
 *    correction is due (Free, non-expiring manual, or still within paid
 *    access or grace) — never a re-derivation of Free-compatibility.
 * 3. If that safety check itself fails (or the profile can't be read at
 *    all), fail CLOSED — the caller must treat this as "not safe to
 *    serve," never as "assume it's fine."
 *
 * Returns true only when public access is definitively safe to serve;
 * false means the caller must fail closed (treat as unavailable, e.g. by
 * returning the same `null` its "not found" path already returns — see
 * portfolio-query.server.ts). Never mutates `status`/publication choice.
 */
export async function ensurePublicAccessSafe(
  supabaseAdmin: SupabaseClient<Database>,
  beauticianProfileId: string,
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.rpc("reconcile_commercial_state", {
      _bp_id: beauticianProfileId,
    });
    if (!error) return true;
    console.error(
      `[billing] reconcile_commercial_state failed for ${beauticianProfileId}:`,
      error.message,
    );
  } catch (err) {
    console.error(`[billing] reconcile_commercial_state threw for ${beauticianProfileId}:`, err);
  }

  // Reconciliation itself failed — do not blindly trust potentially-stale
  // stored state. Fall back to the narrow, authoritative safety check.
  try {
    const { data, error } = await supabaseAdmin.rpc("is_commercial_access_current", {
      _bp_id: beauticianProfileId,
    });
    if (error) {
      console.error(
        `[billing] is_commercial_access_current failed for ${beauticianProfileId}:`,
        error.message,
      );
      return false; // required safety lookup itself failed — fail closed.
    }
    return Boolean(data);
  } catch (err) {
    console.error(`[billing] is_commercial_access_current threw for ${beauticianProfileId}:`, err);
    return false;
  }
}

/**
 * Billing-hold -> Free recovery. Wraps the SECURITY DEFINER
 * confirm_continue_on_free() RPC, which the professional explicitly
 * invokes after cleaning up content to below Free limits — hold is NEVER
 * auto-cleared by reconciliation merely because content becomes
 * compatible again.
 *
 * Unlike reconcileCommercialState() above, this takes the CALLER'S OWN
 * authenticated Supabase client (e.g. `context.supabase` from
 * requireSupabaseAuth), never supabaseAdmin — the RPC's ownership check
 * relies on `auth.uid()` resolving to the acting user, which a
 * service-role call would leave NULL (and correctly fail
 * "not authorized" for a non-admin). An Admin path may call this with the
 * Admin's own authenticated client for the same reason.
 *
 * Throws (does not swallow) on failure — unlike the fail-soft
 * reconciliation trigger, this is a direct, professional-initiated action
 * whose result the caller must be able to show accurately (e.g. "3
 * services still exceed the Free limit — remove more first").
 *
 * Foundation-only in this phase: no dashboard button/createServerFn route
 * wires this yet — that presentation layer is explicitly deferred to
 * Billing Phase C. This function is the tested, ready-to-call server
 * capability a future "Continue on Free" button will invoke.
 */
export async function confirmContinueOnFree(
  supabase: SupabaseClient<Database>,
  beauticianProfileId: string,
): Promise<void> {
  const { error } = await supabase.rpc("confirm_continue_on_free", {
    _bp_id: beauticianProfileId,
  });
  if (error) {
    throw new Error(`Could not continue on Free: ${error.message}`);
  }
}
