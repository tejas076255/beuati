// 5-tier entitlements — the ONE canonical source of plan capability/limit
// numbers, consumed by dashboard UI, server mutations, Admin UI, and QA
// tests alike. Never duplicate these numbers anywhere else in application
// code. The DB-level enforcement triggers (see the plan-entitlements
// migration) necessarily keep their own mirrored copy in SQL — Postgres
// can't import this file — so any change here must be mirrored there too;
// both files carry a comment pointing at the other.
export type PortfolioPlan = "free" | "starter" | "silver" | "gold" | "platinum";

export const PORTFOLIO_PLANS: readonly PortfolioPlan[] = [
  "free",
  "starter",
  "silver",
  "gold",
  "platinum",
];

export const PLAN_LABELS: Record<PortfolioPlan, string> = {
  free: "Start",
  starter: "Search Ready",
  silver: "Lead Growth",
  gold: "Client Growth",
  platinum: "Brand Growth",
};

const PLAN_RANK: Record<PortfolioPlan, number> = {
  free: 0,
  starter: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

export function planAtLeast(plan: PortfolioPlan, minimum: PortfolioPlan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[minimum];
}

/** Content types with a plan-dependent creation cap. `gallery_photos` counts
 * individual photos (portfolio_images rows), not gallery entries
 * (portfolio_items) — matches the "Gallery (12 photos)" marketing claim and
 * the fact a single gallery entry can hold multiple photos. */
export type PlanLimitedModule =
  | "services"
  | "packages"
  | "gallery_photos"
  | "before_after_items"
  | "portfolio_videos"
  | "faqs"
  | "service_areas"
  | "reviews";

export const MODULE_LABELS: Record<PlanLimitedModule, string> = {
  services: "services",
  packages: "packages",
  gallery_photos: "gallery photos",
  before_after_items: "before & after pairs",
  portfolio_videos: "videos",
  faqs: "FAQs",
  service_areas: "service areas",
  reviews: "reviews",
};

// Canonical FINAL CONTENT LIMITS matrix. Mirrored in SQL by
// public.get_plan_content_limit() in the plan-entitlements migration.
const LIMITS: Record<PlanLimitedModule, Record<PortfolioPlan, number>> = {
  services: { free: 5, starter: 10, silver: 20, gold: 50, platinum: 150 },
  packages: { free: 0, starter: 5, silver: 15, gold: 40, platinum: 100 },
  gallery_photos: { free: 12, starter: 30, silver: 75, gold: 150, platinum: 300 },
  before_after_items: { free: 3, starter: 10, silver: 25, gold: 60, platinum: 120 },
  portfolio_videos: { free: 0, starter: 0, silver: 5, gold: 15, platinum: 30 },
  faqs: { free: 5, starter: 10, silver: 20, gold: 40, platinum: 80 },
  service_areas: { free: 3, starter: 8, silver: 20, gold: 50, platinum: 100 },
  reviews: { free: 0, starter: 20, silver: 50, gold: 100, platinum: 200 },
};

export function getPlanLimit(plan: PortfolioPlan, module: PlanLimitedModule): number {
  return LIMITS[module][plan];
}

/** A module is entirely unavailable on a plan when its limit is 0 —
 * feature-gating and capacity-capping are deliberately the same mechanism. */
export function isModuleAvailable(plan: PortfolioPlan, module: PlanLimitedModule): boolean {
  return getPlanLimit(plan, module) > 0;
}

export const GTM_MIN_PLAN: PortfolioPlan = "silver";

export function planAllowsGtm(plan: PortfolioPlan): boolean {
  return planAtLeast(plan, GTM_MIN_PLAN);
}

/** Throws a friendly, plan-aware error for a single-item creation attempt.
 * `currentCount` must be the count BEFORE this new item. Used by every
 * owner-facing create wrapper except gallery photos, which can add more
 * than one photo per call (see the dedicated gallery check in
 * plan-enforcement.server.ts). */
export function assertWithinPlanLimit(
  module: PlanLimitedModule,
  plan: PortfolioPlan,
  currentCount: number,
): void {
  const limit = getPlanLimit(plan, module);
  const label = MODULE_LABELS[module];
  if (limit === 0) {
    throw new Error(
      `${capitalize(label)} are not available on the ${PLAN_LABELS[plan]} plan. Upgrade to unlock this.`,
    );
  }
  if (currentCount >= limit) {
    throw new Error(
      `You've reached your ${PLAN_LABELS[plan]} plan's limit of ${limit} ${label}. Upgrade for more capacity.`,
    );
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** For "N of limit" capacity UI. limit === 0 means the module is locked. */
export interface PlanCapacity {
  current: number;
  limit: number;
  available: boolean;
  atLimit: boolean;
}

export function getPlanCapacity(
  plan: PortfolioPlan,
  module: PlanLimitedModule,
  currentCount: number,
): PlanCapacity {
  const limit = getPlanLimit(plan, module);
  return {
    current: currentCount,
    limit,
    available: limit > 0,
    atLimit: limit > 0 && currentCount >= limit,
  };
}
