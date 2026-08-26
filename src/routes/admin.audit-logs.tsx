import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Database } from "@/integrations/supabase/types";
import type { AdminAuditLogEntry } from "@/data/admin/audit.server";

export const Route = createFileRoute("/admin/audit-logs")({
  component: AuditLogsPage,
});

const listAuditLogsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAuditLogs } = await import("@/data/admin/audit.server");
    return listAuditLogs(context.supabase, context.userId);
  });

const ACTIONS: Database["public"]["Enums"]["admin_audit_action"][] = [
  "profile_status_changed",
  "verification_changed",
  "featured_changed",
  "admin_role_granted",
  "admin_role_revoked",
  "review_moderated",
  "review_deleted",
];

const ENTITY_TYPES: Database["public"]["Enums"]["admin_audit_entity_type"][] = [
  "beautician_profile",
  "user_role",
  "review",
];

const ALL = "__all__";

function actionLabel(action: Database["public"]["Enums"]["admin_audit_action"]) {
  return action.replace(/_/g, " ");
}

function actionBadgeVariant(action: Database["public"]["Enums"]["admin_audit_action"]) {
  switch (action) {
    case "admin_role_granted":
    case "verification_changed":
    case "featured_changed":
      return "default" as const;
    case "admin_role_revoked":
    case "review_deleted":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function AuditLogDetailDialog({
  entry,
  onClose,
}: {
  entry: AdminAuditLogEntry | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Audit event details</DialogTitle>
        </DialogHeader>
        {entry && (
          <dl className="space-y-3 text-sm">
            {[
              ["Actor", entry.actorName || entry.actorEmail || entry.actor_user_id],
              ["Action", actionLabel(entry.action)],
              ["Entity type", entry.entity_type],
              ["Entity ID", entry.entity_id],
              ["When", new Date(entry.created_at).toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="col-span-2 break-words">{value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-muted-foreground">Old value</dt>
              <dd>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-secondary p-3 text-xs">
                  {entry.old_value ? JSON.stringify(entry.old_value, null, 2) : "—"}
                </pre>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">New value</dt>
              <dd>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-secondary p-3 text-xs">
                  {entry.new_value ? JSON.stringify(entry.new_value, null, 2) : "—"}
                </pre>
              </dd>
            </div>
            {entry.metadata && Object.keys(entry.metadata as object).length > 0 && (
              <div>
                <dt className="text-muted-foreground">Metadata</dt>
                <dd>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-secondary p-3 text-xs">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </dd>
              </div>
            )}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuditLogsPage() {
  const logsQuery = useQuery({ queryKey: ["admin-audit-logs"], queryFn: () => listAuditLogsFn() });

  const [actorFilter, setActorFilter] = useState<string>(ALL);
  const [actionFilter, setActionFilter] = useState<string>(ALL);
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<AdminAuditLogEntry | null>(null);

  const logs = useMemo(() => logsQuery.data ?? [], [logsQuery.data]);

  const actors = useMemo(
    () =>
      Array.from(
        new Set(logs.map((l) => l.actorName || l.actorEmail || l.actor_user_id)),
      ) as string[],
    [logs],
  );

  const filtered = useMemo(
    () =>
      logs.filter((entry) => {
        const actorLabel = entry.actorName || entry.actorEmail || entry.actor_user_id;
        if (actorFilter !== ALL && actorLabel !== actorFilter) return false;
        if (actionFilter !== ALL && entry.action !== actionFilter) return false;
        if (entityTypeFilter !== ALL && entry.entity_type !== entityTypeFilter) return false;
        if (dateFrom && entry.created_at < dateFrom) return false;
        if (dateTo && entry.created_at > `${dateTo}T23:59:59`) return false;
        return true;
      }),
    [logs, actorFilter, actionFilter, entityTypeFilter, dateFrom, dateTo],
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Audit Logs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Append-only record of important admin actions across the platform.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Select value={actorFilter} onValueChange={setActorFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Actor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All actors</SelectItem>
            {actors.map((actor) => (
              <SelectItem key={actor} value={actor}>
                {actor}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All actions</SelectItem>
            {ACTIONS.map((action) => (
              <SelectItem key={action} value={action}>
                {actionLabel(action)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All entity types</SelectItem>
            {ENTITY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[150px]"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[150px]"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {logsQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : logsQuery.isError ? (
          <p className="p-6 text-sm text-destructive">
            {(logsQuery.error as Error).message || "Admin access required."}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No audit events match these filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">
                    {entry.actorName || entry.actorEmail || entry.actor_user_id}
                  </TableCell>
                  <TableCell>
                    <Badge variant={actionBadgeVariant(entry.action)}>
                      {actionLabel(entry.action)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.entity_type.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedEntry(entry)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AuditLogDetailDialog entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
