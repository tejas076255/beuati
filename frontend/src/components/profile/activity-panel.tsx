// Per-beautician Admin Activity tab — a read-only chronological view over
// the SAME audit_logs table + actor-join pattern already used by the
// platform-wide /admin/audit-logs page, scoped server-side to this one
// profile's own admin actions (see listAuditLogsForBeautician in
// src/data/admin/audit.server.ts). No new audit system, no create/edit/
// delete actions here — history only.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminAuditLogEntry } from "@/data/admin/audit.server";
import type { Database } from "@/integrations/supabase/types";

function actionLabel(action: Database["public"]["Enums"]["admin_audit_action"]) {
  return action.replace(/_/g, " ");
}

function actionBadgeVariant(action: Database["public"]["Enums"]["admin_audit_action"]) {
  switch (action) {
    case "verification_changed":
    case "featured_changed":
      return "default" as const;
    default:
      return "outline" as const;
  }
}

export function ActivityPanel({
  profileDisplayName,
  entries,
  isLoading,
}: {
  profileDisplayName: string;
  entries: AdminAuditLogEntry[];
  isLoading: boolean;
}) {
  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-semibold">Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin actions recorded directly against {profileDisplayName}'s profile — status,
          verification, and featured changes. For platform-wide history (reviews, services, and
          other items), see Audit Logs.
        </p>
      </div>

      <div className="mt-6">
        <Card className="border-border/70 shadow-sm" data-testid="activity-recent-list">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={actionBadgeVariant(entry.action)}>
                        {actionLabel(entry.action)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {entry.actorName || entry.actorEmail || "Admin"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
