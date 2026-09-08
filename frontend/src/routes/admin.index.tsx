import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/")({
  component: DashboardPage,
});

const getDashboardSummaryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getDashboardSummary } = await import("@/data/admin/dashboard.server");
    return getDashboardSummary(context.supabase, context.userId);
  });

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function CardGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </div>
  );
}

function actionLabel(action: string) {
  return action.replace(/_/g, " ");
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "published":
      return "default" as const;
    case "suspended":
      return "destructive" as const;
    case "unpublished":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ["admin-dashboard-summary"],
    queryFn: () => getDashboardSummaryFn(),
  });

  if (summaryQuery.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (summaryQuery.isError) {
    return (
      <p className="p-6 text-sm text-destructive">
        {(summaryQuery.error as Error).message || "Admin access required."}
      </p>
    );
  }

  const data = summaryQuery.data!;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform overview and recent activity.</p>
      </div>

      <CardGroup title="Professionals">
        <StatCard label="Total" value={data.professionals.total} />
        <StatCard label="Published" value={data.professionals.published} />
        <StatCard label="Suspended" value={data.professionals.suspended} />
      </CardGroup>

      <CardGroup title="Leads">
        <StatCard label="New" value={data.leads.new} />
        <StatCard label="Contacted" value={data.leads.contacted} />
        <StatCard label="Qualified" value={data.leads.qualified} />
        <StatCard label="Booked" value={data.leads.booked} />
        <StatCard label="Lost" value={data.leads.lost} />
      </CardGroup>

      <CardGroup title="Services">
        <StatCard label="Categories" value={data.services.categories} />
        <StatCard label="Specializations" value={data.services.specializations} />
      </CardGroup>

      <CardGroup title="Verification">
        <StatCard label="Verified" value={data.verification.verified} />
        <StatCard label="Not verified" value={data.verification.unverified} />
      </CardGroup>

      <CardGroup title="Featured">
        <StatCard label="Featured" value={data.featured.featured} />
        <StatCard label="Not featured" value={data.featured.notFeatured} />
      </CardGroup>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between p-4">
            <h2 className="font-semibold">Recent admin activity</h2>
            <Link
              to="/admin/audit-logs"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          {data.recentActivity.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentActivity.map((entry) => {
                    const actor = entry.actorName || entry.actorEmail || entry.actor_user_id;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-xs" title={actor}>
                          {actor}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="text-xs">
                            {actionLabel(entry.action)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between p-4">
            <h2 className="font-semibold">Recent leads</h2>
            <Link to="/admin/leads" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          {data.recentLeads.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No leads yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="whitespace-nowrap text-xs font-medium">
                        {lead.name ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="text-xs">
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between p-4">
            <h2 className="font-semibold">Recent signups</h2>
            <Link
              to="/admin/profiles"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          {data.recentSignups.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No signups yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentSignups.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="whitespace-nowrap text-xs font-medium">
                        {profile.display_name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={statusBadgeVariant(profile.status)} className="text-xs">
                          {profile.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {profile.is_verified ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
