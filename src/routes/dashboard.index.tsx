import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Inbox,
  Image,
  Layers,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  User,
} from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMilestone, rankNextBestActions, type CompletionScoreBreakdown } from "@/lib/completion-score";
import { PLAN_LABELS, type PortfolioPlan } from "@/lib/plan-limits";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardOverviewPage,
});

// ---- server functions ----

const getDashboardOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnBeauticianProfileId } = await import("@/data/dashboard/shared.server");
    const { getOwnCompletionScore } = await import("@/data/dashboard/completion-score.server");
    const { countNewLeads, listOwnLeadsWithInquiry } = await import("@/data/leads-query.server");

    const bpId = await getOwnBeauticianProfileId(context.supabase, context.userId);

    // Run all queries in parallel for performance
    const [scoreBreakdown, newLeadsCount, allLeads, profileRow, planRow] = await Promise.all([
      getOwnCompletionScore(context.supabase, context.userId),
      countNewLeads(context.supabase),
      listOwnLeadsWithInquiry(context.supabase),
      // Profile summary
      context.supabase
        .from("beautician_profiles")
        .select("display_name, slug, status, plan, profile_image_url, is_verified")
        .eq("id", bpId)
        .single()
        .then((r) => r.data),
      // Plan info from beautician_profiles
      context.supabase
        .from("beautician_profiles")
        .select("plan")
        .eq("id", bpId)
        .single()
        .then((r) => r.data),
    ]);

    // Lead pipeline counts
    const statusCounts: Record<string, number> = {};
    for (const lead of allLeads) {
      statusCounts[lead.status] = (statusCounts[lead.status] ?? 0) + 1;
    }

    // Content counts for quick health check
    const [servicesRes, reviewsRes] = await Promise.all([
      context.supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("beautician_profile_id", bpId)
        .eq("is_active", true),
      context.supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("beautician_profile_id", bpId)
        .eq("is_published", true),
    ]);

    return {
      score: scoreBreakdown as CompletionScoreBreakdown,
      newLeadsCount,
      totalLeads: allLeads.length,
      bookedLeads: statusCounts["booked"] ?? 0,
      completedLeads: statusCounts["completed"] ?? 0,
      profile: profileRow,
      plan: (planRow?.plan ?? "free") as PortfolioPlan,
      activeServices: servicesRes.count ?? 0,
      publishedReviews: reviewsRes.count ?? 0,
    };
  });

// ---- component ----

function DashboardOverviewPage() {
  const overviewQuery = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => getDashboardOverviewFn(),
  });

  if (overviewQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Loading your dashboard…
      </div>
    );
  }

  if (overviewQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        {(overviewQuery.error as Error).message || "Failed to load dashboard."}
      </p>
    );
  }

  const data = overviewQuery.data!;
  const { score, profile, plan } = data;
  const milestone = getMilestone(score.total);
  const topActions = rankNextBestActions(score).slice(0, 3);
  const isPublished = profile?.status === "published";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {profile?.display_name ? `Welcome back, ${profile.display_name.split(" ")[0]}` : "Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's how your BeautyFolio is performing today.
          </p>
        </div>
        {profile?.slug && (
          <Link
            to="/portfolio/$slug"
            params={{ slug: profile.slug }}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            View Public Portfolio
          </Link>
        )}
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={isPublished ? "default" : "secondary"} className="text-xs">
          {isPublished ? "Published" : "Draft"}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {PLAN_LABELS[plan]} plan
        </Badge>
        {profile?.is_verified && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Verified
          </Badge>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          label="Portfolio Score"
          value={`${score.total}/100`}
          sub={milestone.label}
          to="/dashboard/profile"
        />
        <MetricCard
          icon={<Inbox className="h-4 w-4 text-primary" />}
          label="New Leads"
          value={data.newLeadsCount}
          sub={`${data.totalLeads} total`}
          to="/dashboard/leads"
          highlight={data.newLeadsCount > 0}
        />
        <MetricCard
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          label="Active Services"
          value={data.activeServices}
          to="/dashboard/services"
        />
        <MetricCard
          icon={<Star className="h-4 w-4 text-primary" />}
          label="Reviews"
          value={data.publishedReviews}
          to="/dashboard/reviews"
        />
      </div>

      {/* Main content: Completion + Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Portfolio completion */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              Portfolio Completion
              <span className="font-display text-xl font-semibold text-primary">
                {score.total}
                <span className="text-xs font-normal text-muted-foreground">/100</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar */}
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${score.total}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{milestone.message}</p>
            </div>

            {topActions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Next best actions
                </p>
                <ul className="space-y-2">
                  {topActions.map((action) => (
                    <li key={action.criterionId} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 shrink-0 font-semibold text-primary">
                        +{action.delta}
                      </span>
                      <span className="text-muted-foreground">{action.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link to="/dashboard/profile">
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                Edit Profile
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Quick navigation */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Quick Access</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {QUICK_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="flex items-center gap-2.5">
                      <link.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {link.label}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Leads pipeline summary */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-semibold">
            Lead Pipeline
            <Link
              to="/dashboard/leads"
              className="text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              View all leads →
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PipelineStat label="New" value={data.newLeadsCount} accent />
            <PipelineStat label="Total" value={data.totalLeads} />
            <PipelineStat label="Booked" value={data.bookedLeads} />
            <PipelineStat label="Completed" value={data.completedLeads} />
          </div>
          {data.totalLeads === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              No leads yet. Share your portfolio link to start getting enquiries.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- sub-components ----

function MetricCard({
  icon,
  label,
  value,
  sub,
  to,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  to: string;
  highlight?: boolean;
}) {
  return (
    <Link to={to}>
      <Card
        className={`border-border/70 shadow-sm transition-colors hover:border-primary/40 ${highlight ? "border-primary/30 bg-primary/5" : ""}`}
      >
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2">
            {icon}
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          <p className={`font-display text-2xl font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

function PipelineStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-3 text-center">
      <p className={`font-display text-xl font-semibold ${accent && value > 0 ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

const QUICK_LINKS = [
  { label: "Edit Profile", icon: User, to: "/dashboard/profile" as const },
  { label: "Manage Gallery", icon: Image, to: "/dashboard/gallery" as const },
  { label: "View Leads", icon: Inbox, to: "/dashboard/leads" as const },
  { label: "Manage Services", icon: Layers, to: "/dashboard/services" as const },
  { label: "Availability", icon: Clock, to: "/dashboard/availability" as const },
  { label: "SEO Settings", icon: Search, to: "/dashboard/seo" as const },
];
