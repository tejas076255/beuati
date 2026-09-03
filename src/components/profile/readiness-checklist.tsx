// QA-1Q — read-only Portfolio Readiness checklist for the Admin per-
// beautician workspace. Renders the SAME evaluatePortfolioContentReadiness()
// result (src/lib/seo-helpers.ts) already used by ProfileManager's compact
// inline panel and by the professional's own /dashboard/seo full
// checklist — no new business logic, no new percentage/score, just a
// dedicated read-only view grouped the same way dashboard.seo.tsx already
// groups them (Required / Recommended / Technical). Deliberately has no
// deep-links to edit forms (unlike dashboard.seo.tsx's CHECK_ACTIONS,
// which link to the beautician's OWN /dashboard/* routes) — an admin
// viewing this belongs in the same per-beautician workspace's sibling
// tabs (Profile, Services, Gallery, …), not the beautician's private
// dashboard routes.
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  portfolioReadinessMessage,
  portfolioReadinessStateLabel,
  type PortfolioReadiness,
  type PortfolioReadinessCheck,
  type PortfolioReadinessState,
} from "@/lib/seo-helpers";

const STATE_CLASS: Record<PortfolioReadinessState, string> = {
  ready: "text-emerald-600",
  needs_improvement: "text-amber-600",
  not_eligible: "text-muted-foreground",
};

function CheckGroup({
  title,
  description,
  checks,
}: {
  title: string;
  description?: string;
  checks: PortfolioReadinessCheck[];
}) {
  if (checks.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <ul className="mt-2 space-y-1.5">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                check.status === "pass"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-secondary text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {check.status === "pass" ? "✓" : "○"}
            </span>
            <span className="min-w-0">
              <span className="text-foreground">{check.label}</span>
              {check.status === "fail" && (
                <span className="block text-xs text-muted-foreground">{check.recommendation}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Shared read-only Readiness checklist — currently rendered only by the
 * Admin per-beautician workspace's dedicated "Readiness" tab. Takes an
 * already-computed PortfolioReadiness result so it stays pure/presentational,
 * matching the pattern of every other *Manager component in this codebase.
 */
export function ReadinessChecklist({
  title = "Portfolio Readiness",
  subtitle = "Whether this profile is currently complete and valid for its public portfolio.",
  readiness,
  isLoading,
}: {
  title?: string;
  subtitle?: string;
  readiness: PortfolioReadiness | null;
  isLoading: boolean;
}) {
  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="mt-6 space-y-4">
        {isLoading || !readiness ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="flex items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-medium">
                    Status: {portfolioReadinessStateLabel(readiness.state)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {portfolioReadinessMessage(readiness.state)}
                  </p>
                </div>
                <span
                  className={cn("shrink-0 text-xs font-semibold", STATE_CLASS[readiness.state])}
                >
                  {readiness.state !== "ready" &&
                    readiness.state !== "not_eligible" &&
                    `${readiness.requiredFailedCount} required`}
                </span>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <CheckGroup
                  title="Required for search"
                  checks={readiness.checks.filter(
                    (c) => c.required && (c.category === "content" || c.category === "local"),
                  )}
                />
                <CheckGroup
                  title="Recommended (optional — improves customer value, not required for search)"
                  checks={readiness.checks.filter((c) => !c.required && c.category !== "technical")}
                />
                <CheckGroup
                  title="Technical SEO"
                  checks={readiness.checks.filter((c) => c.category === "technical")}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
