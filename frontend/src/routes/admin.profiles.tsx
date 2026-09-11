import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
import { MILESTONE_BANDS, getMilestone } from "@/lib/completion-score";

export const Route = createFileRoute("/admin/profiles")({
  component: ProfilesPage,
});

// ---------- known signup sources ----------
// New sources can be added here without touching the DB enum — the field is
// free-text in the DB, this list only drives the admin dropdown.
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

const ALL = "__all__";
const YES = "__yes__";
const NO = "__no__";
const NONE = "__none__";

function ProfilesPage() {
  const queryClient = useQueryClient();
  const profilesQuery = useQuery({ queryKey: ["admin-profiles"], queryFn: () => listProfilesFn() });

  // ── filters ────────────────────────────────────────────────────────────────
  const [verifiedFilter, setVerifiedFilter] = useState<string>(ALL);
  const [featuredFilter, setFeaturedFilter] = useState<string>(ALL);
  const [planFilter, setPlanFilter] = useState<string>(ALL);
  const [scoreBandFilter, setScoreBandFilter] = useState<string>(ALL);
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);
  // "Signed up" date filter — matches on created_at date
  const [signedUpFrom, setSignedUpFrom] = useState("");
  const [signedUpTo, setSignedUpTo] = useState("");

  // ── mutations ──────────────────────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: (vars: {
      profileId: string;
      status: Database["public"]["Enums"]["portfolio_status"];
    }) => updateStatusFn({ data: vars }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update status"),
  });

  const updateFlags = useMutation({
    mutationFn: (vars: { profileId: string; is_verified?: boolean; is_featured?: boolean }) =>
      updateFlagsFn({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update profile"),
  });

  const updatePlan = useMutation({
    mutationFn: (vars: { profileId: string; plan: PortfolioPlan }) => updatePlanFn({ data: vars }),
    onSuccess: () => {
      toast.success("Plan updated");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update plan"),
  });

  const updateSource = useMutation({
    mutationFn: (vars: { profileId: string; signup_source: string | null }) =>
      updateSourceFn({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update source"),
  });

  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);

  const filtered = useMemo(
    () =>
      profiles.filter((p) => {
        if (verifiedFilter === YES && !p.is_verified) return false;
        if (verifiedFilter === NO && p.is_verified) return false;
        if (featuredFilter === YES && !p.is_featured) return false;
        if (featuredFilter === NO && p.is_featured) return false;
        if (planFilter !== ALL && p.plan !== planFilter) return false;
        if (scoreBandFilter !== ALL && getMilestone(p.completion_score).label !== scoreBandFilter) {
          return false;
        }
        // source filter — NONE matches profiles with no source set
        if (sourceFilter === NONE && p.signup_source != null) return false;
        if (sourceFilter !== ALL && sourceFilter !== NONE && p.signup_source !== sourceFilter)
          return false;
        // signed-up date range
        if (signedUpFrom && p.created_at < signedUpFrom) return false;
        if (signedUpTo && p.created_at > `${signedUpTo}T23:59:59`) return false;
        return true;
      }),
    [profiles, verifiedFilter, featuredFilter, planFilter, scoreBandFilter, sourceFilter, signedUpFrom, signedUpTo],
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Professionals</h1>
      <p className="mt-1 text-sm text-muted-foreground">Platform-wide beautician moderation.</p>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Verified" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Verified: any</SelectItem>
            <SelectItem value={YES}>Verified only</SelectItem>
            <SelectItem value={NO}>Not verified</SelectItem>
          </SelectContent>
        </Select>
        <Select value={featuredFilter} onValueChange={setFeaturedFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Featured" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Featured: any</SelectItem>
            <SelectItem value={YES}>Featured only</SelectItem>
            <SelectItem value={NO}>Not featured</SelectItem>
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Plan: any</SelectItem>
            {PORTFOLIO_PLANS.map((plan) => (
              <SelectItem key={plan} value={plan}>
                {PLAN_LABELS[plan]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scoreBandFilter} onValueChange={setScoreBandFilter}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Completion score" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Completion score: any</SelectItem>
            {MILESTONE_BANDS.map((band) => (
              <SelectItem key={band.label} value={band.label}>
                {band.min}
                {band.min === band.max ? "" : `-${band.max}`} · {band.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Source: any</SelectItem>
            {SIGNUP_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
            <SelectItem value={NONE}>Not set</SelectItem>
          </SelectContent>
        </Select>

        {/* Signed up date range */}
        <Input
          type="date"
          value={signedUpFrom}
          onChange={(e) => setSignedUpFrom(e.target.value)}
          className="w-[150px]"
          aria-label="Signed up from"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={signedUpTo}
          onChange={(e) => setSignedUpTo(e.target.value)}
          className="w-[150px]"
          aria-label="Signed up to"
        />
        {(signedUpFrom || signedUpTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSignedUpFrom(""); setSignedUpTo(""); }}
            className="text-xs text-muted-foreground"
          >
            Clear dates
          </Button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {profilesQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : profilesQuery.isError ? (
          <p className="p-6 text-sm text-destructive">
            {(profilesQuery.error as Error).message || "Admin access required."}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No profiles match these filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Demo</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.display_name}</TableCell>
                  <TableCell>
                    <code className="text-xs">{profile.slug}</code>
                  </TableCell>
                  {/* Task 3: renamed "Reviews / Clients" → "Leads"
                      (review_count + client_count remain the underlying data) */}
                  <TableCell>
                    {profile.review_count} / {profile.client_count}
                  </TableCell>
                  <TableCell>{profile.is_demo ? "Yes" : ""}</TableCell>
                  {/* Task 5: "Signed up" column (was "Created") */}
                  <TableCell>{new Date(profile.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={updateFlags.isPending}
                      onClick={() =>
                        updateFlags.mutate({
                          profileId: profile.id,
                          is_verified: !profile.is_verified,
                        })
                      }
                    >
                      <Badge variant={profile.is_verified ? "default" : "outline"}>
                        {profile.is_verified ? "Verified" : "Unverified"}
                      </Badge>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={updateFlags.isPending}
                      onClick={() =>
                        updateFlags.mutate({
                          profileId: profile.id,
                          is_featured: !profile.is_featured,
                        })
                      }
                    >
                      <Badge variant={profile.is_featured ? "default" : "outline"}>
                        {profile.is_featured ? "Featured" : "Not featured"}
                      </Badge>
                    </Button>
                  </TableCell>
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
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue>
                          <Badge variant={statusBadgeVariant(profile.status)}>
                            {profile.status}
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={profile.plan}
                      onValueChange={(value) =>
                        updatePlan.mutate({ profileId: profile.id, plan: value as PortfolioPlan })
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue>
                          <Badge variant="outline">{PLAN_LABELS[profile.plan]}</Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PORTFOLIO_PLANS.map((plan) => (
                          <SelectItem key={plan} value={plan}>
                            {PLAN_LABELS[plan]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {/* Task 4: score shows number only, no "/100 · milestone" suffix */}
                  <TableCell>
                    <span className="font-medium">{profile.completion_score}</span>
                  </TableCell>
                  {/* Task 1+2: Source — editable inline dropdown */}
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
                      <SelectTrigger className="h-8 w-[120px]">
                        <SelectValue>
                          <span className="text-sm">
                            {profile.signup_source ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>
                          <span className="text-muted-foreground">Not set</span>
                        </SelectItem>
                        {SIGNUP_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button variant="softline" size="sm" asChild>
                      <Link to="/admin/beauticians/$slug" params={{ slug: profile.slug }}>
                        Manage
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
