// Lead Performance Summary — per-beautician Admin dashboard widget.
// Presentational only: takes an already-computed LeadPerformanceSummary
// (src/lib/lead-performance.ts, a pure function over already-fetched
// leads + lead_activities) plus a recent-activity feed. No mutations, no
// business logic here — mirrors the existing *Manager/View component
// pattern (prop-driven, no direct server-fn calls).
import { AlertTriangle, Clock, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "./lead-views";
import { STATUS_META, STATUS_ORDER } from "@/lib/lead-config";
import { activityTypeLabel } from "@/lib/lead-config";
import type { LeadActivityFeedItem, LeadPerformanceSummary } from "@/lib/lead-performance";

function formatRelativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function LeadPerformanceSummaryView({
  summary,
  recentActivity,
  isLoading,
}: {
  summary: LeadPerformanceSummary | null;
  recentActivity: LeadActivityFeedItem[];
  isLoading: boolean;
}) {
  if (isLoading || !summary) {
    return <p className="text-sm text-muted-foreground">Loading performance summary…</p>;
  }

  const maxStageCount = Math.max(...STATUS_ORDER.map((s) => summary.byStage[s]), 1);
  const hasAttention =
    summary.attention.overdueFollowups.length > 0 || summary.attention.staleUntouched.length > 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard size="lg" label="Total leads" value={summary.totalLeads} />
        <StatCard size="lg" label="New / untouched" value={summary.newUntouchedCount} />
        <StatCard size="lg" label="→ Booked (%)" value={summary.conversionRates.toBookedPct} />
        <StatCard
          size="lg"
          label="→ Completed (%)"
          value={summary.conversionRates.toCompletedPct}
        />
      </div>

      {/* Stage funnel */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
            Stage funnel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {STATUS_ORDER.map((status) => {
            const count = summary.byStage[status];
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm">{STATUS_META[status].label}</span>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/40">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{
                      width: `${Math.max(count > 0 ? 2 : 0, (count / maxStageCount) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {count}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Attention required */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            Attention required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasAttention ? (
            <p className="text-sm text-muted-foreground">
              No overdue follow-ups or stale untouched leads right now.
            </p>
          ) : (
            <>
              {summary.attention.overdueFollowups.length > 0 && (
                <div>
                  <p className="text-sm font-medium">
                    {summary.attention.overdueFollowups.length} overdue follow-up
                    {summary.attention.overdueFollowups.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {summary.attention.overdueFollowups.slice(0, 5).map((l) => (
                      <li key={l.id} className="flex items-center justify-between text-sm">
                        <span>{l.name ?? "Unnamed lead"}</span>
                        <Badge variant="outline">{formatRelativeDays(l.days)} overdue</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.attention.staleUntouched.length > 0 && (
                <div>
                  <p className="text-sm font-medium">
                    {summary.attention.staleUntouched.length} lead
                    {summary.attention.staleUntouched.length === 1 ? "" : "s"} untouched
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {summary.attention.staleUntouched.slice(0, 5).map((l) => (
                      <li key={l.id} className="flex items-center justify-between text-sm">
                        <span>{l.name ?? "Unnamed lead"}</span>
                        <Badge variant="outline">{formatRelativeDays(l.days)} since received</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {summary.firstResponse && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Median first response: {summary.firstResponse.medianHours}h across{" "}
              {summary.firstResponse.sampleSize} contacted lead
              {summary.firstResponse.sampleSize === 1 ? "" : "s"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded lead activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="font-medium">{item.leadName ?? "Unnamed lead"}</span>
                    {" — "}
                    {activityTypeLabel(item.activityType)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.occurredAt ? new Date(item.occurredAt).toLocaleDateString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
