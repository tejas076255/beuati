// Admin — Sources page (Content section).
// Provides a read-only breakdown of how professionals signed up (by
// signup_source) plus a quick-reference for the known source values.
// Editing a specific professional's source is done inline on the
// Professionals table (/admin/profiles) — this page is for overview and
// documentation, not individual record management.
import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SIGNUP_SOURCES } from "./admin.profiles";

export const Route = createFileRoute("/admin/sources")({
  component: SourcesPage,
});

const listProfileSourcesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertIsAdmin } = await import("@/data/admin/shared.server");
    await assertIsAdmin(context.supabase, context.userId);

    const { data, error } = await context.supabase
      .from("beautician_profiles")
      .select("signup_source");

    if (error) throw new Error(`Failed to load profiles: ${error.message}`);
    return (data ?? []) as { signup_source: string | null }[];
  });

function SourcesPage() {
  const sourcesQuery = useQuery({
    queryKey: ["admin-sources"],
    queryFn: () => listProfileSourcesFn(),
  });

  const breakdown = useMemo(() => {
    const rows = sourcesQuery.data ?? [];
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const key = row.signup_source ?? "Not set";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }));
  }, [sourcesQuery.data]);

  const total = useMemo(
    () => (sourcesQuery.data ?? []).length,
    [sourcesQuery.data],
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Sources</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        How professionals found and signed up to BeautyFolio.
      </p>

      {/* ── Known sources reference ──────────────────────────────────────── */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground">Configured sources</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {SIGNUP_SOURCES.map((s) => (
            <Badge key={s} variant="outline" className="text-sm">
              {s}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          To add a new source, update{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            SIGNUP_SOURCES
          </code>{" "}
          in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            admin.profiles.tsx
          </code>
          . The field is free-text in the database — no migration required.
        </p>
      </div>

      {/* ── Breakdown table ──────────────────────────────────────────────── */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {sourcesQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : sourcesQuery.isError ? (
          <p className="p-6 text-sm text-destructive">
            {(sourcesQuery.error as Error).message || "Admin access required."}
          </p>
        ) : breakdown.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No professionals yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Professionals</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.map(({ source, count }) => (
                <TableRow key={source}>
                  <TableCell className="font-medium">
                    {source === "Not set" ? (
                      <span className="text-muted-foreground">Not set</span>
                    ) : (
                      source
                    )}
                  </TableCell>
                  <TableCell className="text-right">{count}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {total > 0 ? `${Math.round((count / total) * 100)}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Edit a professional's source inline from the{" "}
        <a
          href="/admin/profiles"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Professionals
        </a>{" "}
        table.
      </p>
    </div>
  );
}
