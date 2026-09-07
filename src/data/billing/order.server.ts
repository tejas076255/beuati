// Server-only. Provider-neutral local-order foundation for Billing Phase A.
// Implements ONLY the local-order-first flow and the atomic provider-
// creation claim from the approved design — no HTTP call to any payment
// provider is made anywhere in this file, and nothing here may mark a
// payment captured or an order activated (that remains the Phase B
// webhook handler's exclusive responsibility).
//
// NOTE (expected until the Billing Phase A migration is applied and
// `supabase gen types` is re-run): `billing_orders` does not yet exist in
// the generated Database type, so the `.from("billing_orders")` calls
// below are not yet type-checkable against the real schema. This is the
// documented, expected state for a foundation-only pass.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  getPriceInPaise,
  BILLING_CURRENCY,
  type PaidPlan,
  type BillingCycle,
} from "@/lib/billing-prices";

export const STALE_ORDER_TIMEOUT_MINUTES = 30;
export const PROVIDER_CLAIM_TIMEOUT_MINUTES = 2;

/**
 * Placeholder gateway label. Phase A defines the provider-neutral schema
 * and claim protocol only — no SDK is integrated and no HTTP call to any
 * provider is ever made by this file. Phase B selects and wires an actual
 * gateway; this constant exists solely to satisfy billing_orders.gateway
 * NOT NULL until that happens.
 */
export const PLACEHOLDER_GATEWAY = "unassigned";

export interface LocalOrder {
  id: string;
  status: string;
  gatewayOrderId: string | null;
  gatewayCreationStartedAt: string | null;
}

function toLocalOrder(row: {
  id: string;
  status: string;
  gateway_order_id: string | null;
  gateway_creation_started_at: string | null;
}): LocalOrder {
  return {
    id: row.id,
    status: row.status,
    gatewayOrderId: row.gateway_order_id,
    gatewayCreationStartedAt: row.gateway_creation_started_at,
  };
}

/**
 * Cancels a stale (older than STALE_ORDER_TIMEOUT_MINUTES), still-`created`
 * order for a profile, if one exists. Defensive cleanup, mirroring the
 * rule a future scheduled sweep would also apply — run here so a
 * legitimate new checkout attempt is never blocked by an abandoned one.
 * Never reactivates a stale order; only ever moves created -> cancelled.
 */
async function cancelStaleOpenOrder(
  supabaseAdmin: SupabaseClient<Database>,
  beauticianProfileId: string,
): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_ORDER_TIMEOUT_MINUTES * 60_000).toISOString();
  await supabaseAdmin
    .from("billing_orders")
    .update({ status: "cancelled" })
    .eq("beautician_profile_id", beauticianProfileId)
    .eq("status", "created")
    .lt("created_at", staleBefore);
}

/**
 * Returns the single open (`created`) local order for this profile,
 * creating one if none exists — the local order is always created first,
 * before any external provider call is ever attempted. The amount is
 * always looked up server-side from billing-prices.ts; the caller
 * supplies only (plan, cycle), never a price. `expected_state_version` is
 * snapshotted from the profile's current commercial_state_version so a
 * later webhook can detect whether the profile moved on in the meantime.
 */
export async function getOrCreateOpenOrder(
  supabaseAdmin: SupabaseClient<Database>,
  beauticianProfileId: string,
  plan: PaidPlan,
  cycle: BillingCycle,
): Promise<LocalOrder> {
  await cancelStaleOpenOrder(supabaseAdmin, beauticianProfileId);

  const { data: existing } = await supabaseAdmin
    .from("billing_orders")
    .select("id, status, gateway_order_id, gateway_creation_started_at")
    .eq("beautician_profile_id", beauticianProfileId)
    .eq("status", "created")
    .maybeSingle();

  if (existing) {
    return toLocalOrder(existing);
  }

  const { data: profile } = await supabaseAdmin
    .from("beautician_profiles")
    .select("commercial_state_version")
    .eq("id", beauticianProfileId)
    .single();

  const { data: created, error } = await supabaseAdmin
    .from("billing_orders")
    .insert({
      beautician_profile_id: beauticianProfileId,
      plan,
      billing_cycle: cycle,
      amount_paise: getPriceInPaise(plan, cycle),
      currency: BILLING_CURRENCY,
      gateway: PLACEHOLDER_GATEWAY,
      status: "created",
      expected_state_version: profile?.commercial_state_version ?? 0,
    })
    .select("id, status, gateway_order_id, gateway_creation_started_at")
    .single();

  if (error || !created) {
    // A concurrent request may have won the one-open-order slot between
    // our lookup and insert — reload rather than surface a spurious error.
    const { data: reloaded } = await supabaseAdmin
      .from("billing_orders")
      .select("id, status, gateway_order_id, gateway_creation_started_at")
      .eq("beautician_profile_id", beauticianProfileId)
      .eq("status", "created")
      .maybeSingle();
    if (reloaded) {
      return toLocalOrder(reloaded);
    }
    throw new Error(`Failed to create billing order: ${error?.message ?? "unknown error"}`);
  }

  return toLocalOrder(created);
}

/**
 * Atomically claims the right to call the external payment provider for
 * this order. Exactly one concurrent caller receives `true`; a loser
 * receives `false` and must reload the order rather than calling any
 * provider itself. A crashed claimant's claim expires automatically after
 * PROVIDER_CLAIM_TIMEOUT_MINUTES, letting a later caller re-claim. Holds
 * no open transaction/row lock across an external call — this UPDATE
 * commits immediately and the (not-yet-implemented) HTTP call happens
 * entirely outside it. Never calls a provider itself and never marks a
 * payment or activation.
 */
export async function claimProviderCreation(
  supabaseAdmin: SupabaseClient<Database>,
  orderId: string,
): Promise<boolean> {
  const claimStaleBefore = new Date(
    Date.now() - PROVIDER_CLAIM_TIMEOUT_MINUTES * 60_000,
  ).toISOString();

  const { data, error } = await supabaseAdmin
    .from("billing_orders")
    .update({ gateway_creation_started_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "created")
    .is("gateway_order_id", null)
    .or(`gateway_creation_started_at.is.null,gateway_creation_started_at.lt.${claimStaleBefore}`)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to claim provider-order creation: ${error.message}`);
  }
  return Boolean(data);
}
