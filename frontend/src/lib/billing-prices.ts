// Billing Phase A — the ONE canonical price catalog for paid plans. Billing
// is the authority; marketing/display data (src/data/home.ts) derives its
// shown rupee figures from this module, never the other way around. The
// browser only ever submits a (plan, billing_cycle) purchase intent — the
// trusted server order-creation path looks up the authoritative amount from
// here, exactly like assertWithinPlanLimit() never trusts a client-supplied
// count. No duplicate price constants are allowed anywhere else in the app.
import type { PortfolioPlan } from "@/lib/plan-limits";

export type PaidPlan = Exclude<PortfolioPlan, "free">;
export type BillingCycle = "monthly" | "yearly";

export const BILLING_CURRENCY = "INR" as const;

const PAID_PLANS: readonly PaidPlan[] = ["starter", "silver", "gold", "platinum"];

/** Canonical amounts in paise — never rupees — matching billing_orders.amount_paise. */
const BILLING_PRICES_PAISE: Record<PaidPlan, Record<BillingCycle, number>> = {
  starter: { monthly: 39900, yearly: 399000 },
  silver: { monthly: 79900, yearly: 799000 },
  gold: { monthly: 149900, yearly: 1499000 },
  platinum: { monthly: 299900, yearly: 2999000 },
};

export function isPaidPlan(plan: PortfolioPlan): plan is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(plan);
}

export function isBillingCycle(value: string): value is BillingCycle {
  return value === "monthly" || value === "yearly";
}

/** Server-authoritative price lookup — the only legitimate source of an
 * order's amount_paise. Never accept a price from the browser. */
export function getPriceInPaise(plan: PaidPlan, cycle: BillingCycle): number {
  return BILLING_PRICES_PAISE[plan][cycle];
}

/** Display-only conversion for marketing/UI — never used to compute an
 * order's authoritative amount. */
export function paiseToRupeeDisplay(paise: number): number {
  return paise / 100;
}

/** Convenience for UI code that wants { monthly, yearly } rupee figures for
 * a given plan without touching paise directly. */
export function getDisplayPricing(plan: PaidPlan): Record<BillingCycle, number> {
  const paise = BILLING_PRICES_PAISE[plan];
  return {
    monthly: paiseToRupeeDisplay(paise.monthly),
    yearly: paiseToRupeeDisplay(paise.yearly),
  };
}
