// Shared plan-aware capacity/lock UI for the professional's own dashboard
// content managers (Services/Packages/Gallery/Before & After/Videos/FAQs/
// Service Areas/Reviews). Purely presentational — every manager still owns
// its own create/list/edit UI; this only tells the professional where they
// stand against their plan and, for a fully locked module, replaces the
// editor with an explanation instead of a broken empty state. Never used
// for the Admin workspace (Admin has no content-count limits — see
// src/data/dashboard/plan-enforcement.server.ts).
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PLAN_LABELS, type PlanCapacity, type PortfolioPlan } from "@/lib/plan-limits";

/** Shown above a manager's list when the module has a plan-dependent cap
 * (e.g. "Services: 3 of 5 — Free plan"). Renders nothing extra when the
 * plan has no meaningful ceiling to show (kept simple — always shows the
 * count, since every capped module has a finite limit on every tier). */
export function PlanCapacityBar({
  label,
  plan,
  capacity,
}: {
  label: string;
  plan: PortfolioPlan;
  capacity: PlanCapacity;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
      <Badge variant="outline">{PLAN_LABELS[plan]} plan</Badge>
      <span>
        {label}: <strong className="text-foreground">{capacity.current}</strong> of {capacity.limit}
      </span>
      {capacity.atLimit && (
        <span className="font-medium text-amber-700">
          Limit reached — upgrade your plan for more capacity.
        </span>
      )}
    </div>
  );
}

/** Replaces a manager's editor entirely when a module is fully unavailable
 * on the current plan (limit === 0) — e.g. Packages/Videos/Reviews on
 * Free. Never a broken empty editor. */
export function LockedModuleNotice({
  label,
  plan,
  minimumPlanLabel,
}: {
  label: string;
  plan: PortfolioPlan;
  /** e.g. "Starter" — the lowest plan that unlocks this module. */
  minimumPlanLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-12 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-medium">
          {label} is not available on the {PLAN_LABELS[plan]} plan.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Upgrade to {minimumPlanLabel} or higher to unlock {label.toLowerCase()}.
        </p>
      </div>
    </div>
  );
}
