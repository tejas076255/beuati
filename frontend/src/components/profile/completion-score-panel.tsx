// Portfolio Completion Score — professional-facing panel. Purely
// presentational: renders whatever src/data/dashboard/completion-score.server.ts
// (a thin wrapper over the SQL RPC) returns, plus the presentation-layer
// milestone/next-best-action helpers from src/lib/completion-score.ts. No
// scoring logic lives here — this is not a customer rating and is
// deliberately kept separate from Verification.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  getMilestone,
  rankNextBestActions,
  type CompletionScoreBreakdown,
} from "@/lib/completion-score";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CompletionScorePanel({
  breakdown,
  isLoading,
}: {
  breakdown: CompletionScoreBreakdown | undefined;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  if (isLoading || !breakdown) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading portfolio completion score…
        </CardContent>
      </Card>
    );
  }

  const milestone = getMilestone(breakdown.total);
  const actions = rankNextBestActions(breakdown);
  const topActions = actions.slice(0, 3);
  const remainingActions = actions.slice(3);

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Portfolio Completion Score</span>
          <span className="font-display text-2xl font-semibold text-primary">
            {breakdown.total}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${breakdown.total}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Badge variant="secondary">{milestone.label}</Badge>
            <p className="text-xs text-muted-foreground">{milestone.message}</p>
          </div>
        </div>

        {topActions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Next best actions
            </p>
            <ul className="mt-2 space-y-1.5">
              {topActions.map((action) => (
                <li key={action.criterionId} className="text-sm">
                  <span className="font-semibold text-primary">+{action.delta}</span> {action.label}
                </li>
              ))}
            </ul>
            {remainingActions.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-auto px-0 text-xs"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? "Show less" : `Show ${remainingActions.length} more`}
                </Button>
                {expanded && (
                  <ul className="mt-1.5 space-y-1.5">
                    {remainingActions.map((action) => (
                      <li key={action.criterionId} className="text-sm text-muted-foreground">
                        <span className="font-semibold text-primary">+{action.delta}</span>{" "}
                        {action.label}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setBreakdownOpen((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            aria-expanded={breakdownOpen}
          >
            <span>Criterion Breakdown</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${breakdownOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          {breakdownOpen && (
            <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {breakdown.criteria.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-xs">
                  <span className={c.earned >= c.max ? "text-foreground" : "text-muted-foreground"}>
                    {c.label}
                  </span>
                  <span className="font-medium">
                    {c.earned}/{c.max}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
