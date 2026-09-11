import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Database } from "@/integrations/supabase/types";
import { PLAN_LABELS, PORTFOLIO_PLANS, type PortfolioPlan } from "@/lib/plan-limits";
import { getMilestone, MILESTONE_BANDS } from "@/lib/completion-score";

export const Route = createFileRoute("/admin/profiles")({
  component: ProfilesPage,
});

// ---------- known signup sources ----------
export const SIGNUP_SOURCES = [
  "Direct",
  "Expo",
  "Ads",
  "Seminar",
  "Reference",
] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

const STATUSES: Database["public"]["Enums"]["portfolio_status"][] = [
  "draft",
  "published",
  "unpublished",
  "suspended",
];

// "Signed up" quick-filter options matching the screenshot dropdown
type SignedUpRange = "any" | "today" | "week" | "month" | "custom";
const SIGNED_UP_OPTIONS: { value: SignedUpRange; label: string }[] = [
  { value: "any", label: "Signed up: at any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom range…" },
];

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

// ---------- server functions ----------
const listProfilesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAllProfiles } = await import("@/data/admin/profiles.server");
    return listAllProfiles(context.supabase, context.userId);
  });

const updateStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { profileId: string; status: Database["public"]["Enums"]["portfolio_status"] }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updateProfileStatus } = await import("@/data/admin/profiles.server");
    await updateProfileStatus(context.supabase, context.userId, data.profileId, data.status);
  });

const updateFlagsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { profileId: string; is_verified?: boolean; is_featured?: boolean }) => data)
  .handler(async ({ context, data }) => {
    const { updateProfileFlags } = await import("@/data/admin/profiles.server");
    const { profileId, ...updates } = data;
    await updateProfileFlags(context.supabase, context.userId, profileId, updates);
  });

const updatePlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { profileId: string; plan: PortfolioPlan }) => data)
  .handler(async ({ context, data }) => {
    const { updateProfilePlan } = await import("@/data/admin/profiles.server");
    await updateProfilePlan(context.supabase, context.userId, data.profileId, data.plan);
  });

const updateSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { profileId: string; signup_source: string | null }) => data)
  .handler(async ({ context, data }) => {
    const { updateProfileSource } = await import("@/data/admin/profiles.server");
    await updateProfileSource(
      context.supabase,
      context.userId,
      data.profileId,
      data.signup_source,
    );
  });

// ---------- helpers ----------
function statusBadgeVariant(status: Database["public"]["Enums"]["portfolio_status"]) {
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

/** Short UID — first 8 chars of the UUID */
function shortId(id: string) {
  return id.slice(0, 8);
}

/** ISO date range from a SignedUpRange value */
function signedUpBounds(range: SignedUpRange): { from: string; to: string } | null {
  if (range === "any") return null;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (range === "today") return { from: today, to: today };
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { from, to: today };
  }
  if (range === "month") {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { from, to: today };
  }
  return null; // "custom" handled separately
}

const ALL = "__all__";
const YES = "__yes__";
const NO = "__no__";
const NONE = "__none__";

// ---------- page component ----------
function ProfilesPage() {
  const queryClient = useQueryClient();
  const profilesQuery = useQuery({ queryKey: ["admin-profiles"], queryFn: () => listProfilesFn() });

  // filters
  const [search, setSearch] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState<string>(ALL);
  const [featuredFilter, setFeaturedFilter] = useState<string>(ALL);
  const [planFilter, setPlanFilter] = useState<string>(ALL);
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);
  const [scoreBandFilter, setScoreBandFilter] = useState<string>(ALL);
  const [signedUpRange, setSignedUpRange] = useState<SignedUpRange>("any");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // mutations
  const updateStatus = useMutation({
    mutationFn: (vars: {
      profileId: string;
      status: Database["public"]["Enums"]["portfolio_status"];
    }) => updateStatusFn({ data: vars }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update status"),
  });

  const updateFlags = useMutation({
    mutationFn: (vars: { profileId: string; is_verified?: boolean; is_featured?: boolean }) =>
      updateFlagsFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-profiles"] }),
    onError: (e: Error) => toast.error(e.message || "Failed to update profile"),
  });

  const updatePlan = useMutation({
    mutationFn: (vars: { profileId: string; plan: PortfolioPlan }) => updatePlanFn({ data: vars }),
    onSuccess: () => {
      toast.success("Plan updated");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update plan"),
  });

  const updateSource = useMutation({
    mutationFn: (vars: { profileId: string; signup_source: string | null }) =>
      updateSourceFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-profiles"] }),
    onError: (e: Error) => toast.error(e.message || "Failed to update source"),
  });

  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);

  // stat card counts per plan
  const planCounts = useMemo(() => {
    const counts: Record<PortfolioPlan, number> = {
      free: 0, starter: 0, silver: 0, gold: 0, platinum: 0,
    };
    for (const p of profiles) counts[p.plan]++;
    return counts;
  }, [profiles]);

  // date bounds for signed-up filter
  const dateBounds = useMemo(() => {
    if (signedUpRange === "custom") {
      return customFrom || customTo ? { from: customFrom, to: customTo } : null;
    }
    return signedUpBounds(signedUpRange);
  }, [signedUpRange, customFrom, customTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (verifiedFilter === YES && !p.is_verified) return false;
      if (verifiedFilter === NO && p.is_verified) return false;
      if (featuredFilter === YES && !p.is_featured) return false;
      if (featuredFilter === NO && p.is_featured) return false;
      if (planFilter !== ALL && p.plan !== planFilter) return false;
      if (sourceFilter === NONE && p.signup_source != null) return false;
      if (sourceFilter !== ALL && sourceFilter !== NONE && p.signup_source !== sourceFilter)
        return false;
      if (scoreBandFilter !== ALL && getMilestone(p.completion_score).label !== scoreBandFilter)
        return false;
      if (dateBounds) {
        if (dateBounds.from && p.created_at < dateBounds.from) return false;
        if (dateBounds.to && p.created_at > `${dateBounds.to}T23:59:59`) return false;
      }
      if (q) {
        const hay = [p.display_name, p.slug, shortId(p.id)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [profiles, search, verifiedFilter, featuredFilter, planFilter, sourceFilter, scoreBandFilter, dateBounds]);

  // pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  // reset to page 1 when filters change
  const resetPage = () => setPage(1);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Professionals</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every sign-up becomes a professional's portfolio here — plan, status, and lead volume in one place.
      </p>

      {/* ── Plan stat cards ────────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(["free", "starter", "silver", "gold", "platinum"] as PortfolioPlan[]).map((plan) => (
          <button
            key={plan}
            type="button"
            onClick={() => { setPlanFilter(planFilter === plan ? ALL : plan); resetPage(); }}
            className={`rounded-2xl border p-4 text-left shadow-soft transition-all hover:border-primary/40 ${
              planFilter === plan
                ? "border-primary/60 bg-primary/5"
                : "border-border bg-card"
            }`}
          >
            <p className="text-xs text-muted-foreground">{PLAN_LABELS[plan]}</p>
            <p className="mt-1 text-2xl font-semibold">{planCounts[plan]}</p>
          </button>
        ))}
      </div>

      {/* ── Search ────────────────────────────────────────────────────── */}
      <div className="mt-5 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="Search by name, phone number, or UID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          className="pl-9"
        />
      </div>

      {/* ── Filters row ───────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={verifiedFilter} onValueChange={(v) => { setVerifiedFilter(v); resetPage(); }}>
          <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
            <SelectValue placeholder="Verified" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Verified: any</SelectItem>
            <SelectItem value={YES}>Verified only</SelectItem>
            <SelectItem value={NO}>Not verified</SelectItem>
          </SelectContent>
        </Select>

        <Select value={featuredFilter} onValueChange={(v) => { setFeaturedFilter(v); resetPage(); }}>
          <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
            <SelectValue placeholder="Featured" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Featured: any</SelectItem>
            <SelectItem value={YES}>Featured only</SelectItem>
            <SelectItem value={NO}>Not featured</SelectItem>
          </SelectContent>
        </Select>

        <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); resetPage(); }}>
          <SelectTrigger className="h-8 w-full sm:w-[130px] text-xs">
            <SelectValue placeholder="Plan: any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Plan: any</SelectItem>
            {PORTFOLIO_PLANS.map((plan) => (
              <SelectItem key={plan} value={plan}>{PLAN_LABELS[plan]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); resetPage(); }}>
          <SelectTrigger className="h-8 w-full sm:w-[130px] text-xs">
            <SelectValue placeholder="Source: any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Source: any</SelectItem>
            {SIGNUP_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
            <SelectItem value={NONE}>Not set</SelectItem>
          </SelectContent>
        </Select>

        <Select value={scoreBandFilter} onValueChange={(v) => { setScoreBandFilter(v); resetPage(); }}>
          <SelectTrigger className="h-8 w-full sm:w-[175px] text-xs">
            <SelectValue placeholder="Completion score: any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Completion score: any</SelectItem>
            {MILESTONE_BANDS.map((band) => (
              <SelectItem key={band.label} value={band.label}>
                {band.min}{band.min === band.max ? "" : `-${band.max}`} · {band.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={signedUpRange} onValueChange={(v) => { setSignedUpRange(v as SignedUpRange); resetPage(); }}>
          <SelectTrigger className="h-8 w-full sm:w-[180px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIGNED_UP_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Custom date inputs */}
        {signedUpRange === "custom" && (
          <>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => { setCustomFrom(e.target.value); resetPage(); }}
              className="h-8 w-full sm:w-[140px] text-xs"
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => { setCustomTo(e.target.value); resetPage(); }}
              className="h-8 w-full sm:w-[140px] text-xs"
              aria-label="To date"
            />
          </>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {filtered.length === 0 ? 0 : (safePage - 1) * rowsPerPage + 1}–
          {Math.min(safePage * rowsPerPage, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select
            value={String(rowsPerPage)}
            onValueChange={(v) => { setRowsPerPage(Number(v)); setPage(1); }}
          >
            <SelectTrigger className="h-7 w-[65px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROWS_PER_PAGE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {profilesQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : profilesQuery.isError ? (
          <p className="p-6 text-sm text-destructive">
            {(profilesQuery.error as Error).message || "Admin access required."}
          </p>
        ) : paginated.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No profiles match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">UID</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Signed up</TableHead>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Leads</TableHead>
                  <TableHead className="text-xs">Score</TableHead>
                  <TableHead className="text-xs">Verified</TableHead>
                  <TableHead className="text-xs">Featured</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Billing</TableHead>
                  <TableHead className="text-xs">Due</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((profile) => (
                  <TableRow key={profile.id}>
                    {/* UID */}
                    <TableCell>
                      <code className="text-xs text-muted-foreground">{shortId(profile.id)}</code>
                    </TableCell>

                    {/* Name + slug */}
                    <TableCell>
                      <p className="font-medium text-sm leading-tight">{profile.display_name}</p>
                      <code className="text-xs text-muted-foreground">{profile.slug}</code>
                    </TableCell>

                    {/* Signed up */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(profile.created_at).toLocaleDateString()}
                    </TableCell>

                    {/* Plan — inline dropdown */}
                    <TableCell>
                      <Select
                        value={profile.plan}
                        onValueChange={(value) =>
                          updatePlan.mutate({ profileId: profile.id, plan: value as PortfolioPlan })
                        }
                      >
                        <SelectTrigger className="h-7 w-[120px] text-xs border-0 bg-transparent px-0 shadow-none hover:bg-secondary focus:ring-0">
                          <SelectValue>
                            <Badge variant="outline" className="text-xs font-normal">
                              {PLAN_LABELS[profile.plan]}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {PORTFOLIO_PLANS.map((plan) => (
                            <SelectItem key={plan} value={plan} className="text-xs">
                              {PLAN_LABELS[plan]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Source — inline dropdown */}
                    <TableCell>
                      <Select
                        value={profile.signup_source ?? NONE}
                        onValueChange={(value) =>
                          updateSource.mutate({
                            profileId: profile.id,
                            signup_source: value === NONE ? null : value,
                          })
                        }
                      >
                        <SelectTrigger className="h-7 w-[100px] text-xs border-0 bg-transparent px-0 shadow-none hover:bg-secondary focus:ring-0">
                          <SelectValue>
                            <span className="text-xs">
                              {profile.signup_source ?? (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE} className="text-xs">
                            <span className="text-muted-foreground">Not set</span>
                          </SelectItem>
                          {SIGNUP_SOURCES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Leads (review_count used as proxy — same data source) */}
                    <TableCell className="text-sm text-center">{profile.review_count}</TableCell>

                    {/* Score */}
                    <TableCell className="text-sm font-medium text-center">
                      {profile.completion_score}
                    </TableCell>

                    {/* Verified toggle */}
                    <TableCell>
                      <button
                        type="button"
                        disabled={updateFlags.isPending}
                        onClick={() =>
                          updateFlags.mutate({ profileId: profile.id, is_verified: !profile.is_verified })
                        }
                        className="text-xs hover:underline"
                      >
                        <Badge variant={profile.is_verified ? "default" : "outline"} className="text-xs font-normal">
                          {profile.is_verified ? "Verified" : "Unverified"}
                        </Badge>
                      </button>
                    </TableCell>

                    {/* Featured toggle */}
                    <TableCell>
                      <button
                        type="button"
                        disabled={updateFlags.isPending}
                        onClick={() =>
                          updateFlags.mutate({ profileId: profile.id, is_featured: !profile.is_featured })
                        }
                        className="text-xs hover:underline"
                      >
                        <Badge variant={profile.is_featured ? "default" : "outline"} className="text-xs font-normal">
                          {profile.is_featured ? "Featured" : "Not featured"}
                        </Badge>
                      </button>
                    </TableCell>

                    {/* Status dropdown */}
                    <TableCell>
                      <Select
                        value={profile.status}
                        onValueChange={(value) =>
                          updateStatus.mutate({
                            profileId: profile.id,
                            status: value as Database["public"]["Enums"]["portfolio_status"],
                          })
                        }
                      >
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue>
                            <Badge variant={statusBadgeVariant(profile.status)} className="text-xs font-normal">
                              {profile.status}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((status) => (
                            <SelectItem key={status} value={status} className="text-xs">{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Billing hold indicator */}
                    <TableCell className="text-center">
                      {profile.billing_hold ? (
                        <Badge variant="destructive" className="text-xs font-normal">Hold</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Due — plan_expires_at */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {profile.plan_expires_at
                        ? new Date(profile.plan_expires_at).toLocaleDateString()
                        : "—"}
                    </TableCell>

                    {/* Manage link */}
                    <TableCell>
                      <Button variant="softline" size="sm" asChild className="text-xs">
                        <Link to="/admin/beauticians/$slug" params={{ slug: profile.slug }}>
                          Manage
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            disabled={safePage === 1}
            onClick={() => setPage((p) => p - 1)}
            className="h-7 gap-1 px-2 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <span>
            {safePage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={safePage === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="h-7 gap-1 px-2 text-xs"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
