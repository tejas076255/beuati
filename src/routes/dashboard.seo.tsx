import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ExternalLink, Search } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cn } from "@/lib/utils";
import {
  portfolioReadinessMessage,
  portfolioReadinessStateLabel,
  serviceReadinessStateLabel,
  type PortfolioReadinessCheck,
  type PortfolioReadinessState,
  type ServiceContentReadinessState,
} from "@/lib/seo-helpers";
import { absoluteUrl } from "@/lib/site-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { SeoInput, SeoOverview } from "@/data/dashboard/seo.server";

export const Route = createFileRoute("/dashboard/seo")({
  component: SeoPage,
});

const getSeoOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getSeoOverview } = await import("@/data/dashboard/seo.server");
    return getSeoOverview(context.supabase, context.userId);
  });

const saveSeoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: SeoInput) => data)
  .handler(async ({ context, data }) => {
    const { saveOwnSeo } = await import("@/data/dashboard/seo.server");
    await saveOwnSeo(context.supabase, context.userId, data);
  });

const SERVICE_STATE_META: Record<ServiceContentReadinessState, { className: string }> = {
  ready: { className: "text-emerald-600" },
  needs_improvement: { className: "text-amber-600" },
  not_eligible: { className: "text-muted-foreground" },
};

const PORTFOLIO_STATE_META: Record<PortfolioReadinessState, { className: string }> = {
  ready: { className: "text-emerald-600" },
  needs_improvement: { className: "text-amber-600" },
  not_eligible: { className: "text-muted-foreground" },
};

// Phase 3F.9 §26 — deep links to the existing manager that actually
// satisfies a given failing check. "reviews" and "verified" deliberately
// have no action: both must stay pressure-free, never nudging the
// beautician toward something optional (§12).
const CHECK_ACTIONS: Partial<Record<string, { label: string; to: string }[]>> = {
  professional_name: [{ label: "Edit Profile", to: "/dashboard/profile" }],
  professional_title: [{ label: "Edit Profile", to: "/dashboard/profile" }],
  about_bio: [{ label: "Edit Profile", to: "/dashboard/profile" }],
  profile_image: [{ label: "Edit Profile", to: "/dashboard/profile" }],
  primary_city: [{ label: "Edit Profile", to: "/dashboard/profile" }],
  locality: [{ label: "Edit Profile", to: "/dashboard/profile" }],
  active_services: [{ label: "Services", to: "/dashboard/services" }],
  service_areas: [{ label: "Service Areas", to: "/dashboard/areas" }],
  years_experience: [{ label: "Edit Profile", to: "/dashboard/profile" }],
  gallery_work: [{ label: "Gallery", to: "/dashboard/gallery" }],
  gallery_alt_text: [{ label: "Gallery", to: "/dashboard/gallery" }],
  before_after: [{ label: "Before & After", to: "/dashboard/before-after" }],
  availability: [{ label: "Availability", to: "/dashboard/availability" }],
  contact: [{ label: "Edit Profile", to: "/dashboard/profile" }],
  social_link: [{ label: "Edit Profile", to: "/dashboard/profile" }],
};

function ReadinessCheckGroup({
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
        {checks.map((check) => {
          const actions = check.status === "fail" ? CHECK_ACTIONS[check.id] : undefined;
          return (
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
                <span className={check.status === "pass" ? "text-foreground" : "text-foreground"}>
                  {check.label}
                </span>
                {check.status === "fail" && (
                  <span className="block text-xs text-muted-foreground">
                    {check.recommendation}
                    {actions && (
                      <span className="ml-1.5 space-x-1.5">
                        {actions.map((action) => (
                          <Link
                            key={action.to}
                            to={action.to}
                            className="text-primary underline underline-offset-2"
                          >
                            {action.label}
                          </Link>
                        ))}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SeoPage() {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({ queryKey: ["seo-overview"], queryFn: () => getSeoOverviewFn() });

  const [useAutoTitle, setUseAutoTitle] = useState(true);
  const [useAutoDescription, setUseAutoDescription] = useState(true);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [indexingEnabled, setIndexingEnabled] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!overviewQuery.isSuccess) return;
    const o = overviewQuery.data;
    setUseAutoTitle(!o.seo?.seo_title);
    setUseAutoDescription(!o.seo?.meta_description);
    setTitleValue(o.seo?.seo_title ?? o.defaultSeoTitle);
    setDescriptionValue(o.seo?.meta_description ?? o.defaultMetaDescription);
    setIndexingEnabled(o.seo?.robots_index ?? true);
    setCanonicalUrl(o.seo?.canonical_url ?? "");
    setOgImageUrl(o.seo?.og_image_url ?? "");
    setReady(true);
  }, [overviewQuery.isSuccess, overviewQuery.data]);

  const save = useMutation({
    mutationFn: (input: SeoInput) => saveSeoFn({ data: input }),
    onSuccess: () => {
      toast.success("SEO settings saved");
      queryClient.invalidateQueries({ queryKey: ["seo-overview"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save SEO settings"),
  });

  const persist = (overrides: Partial<SeoInput> = {}) => {
    const o = overviewQuery.data as SeoOverview;
    save.mutate({
      seo_title: useAutoTitle ? null : titleValue || null,
      meta_description: useAutoDescription ? null : descriptionValue || null,
      canonical_url: canonicalUrl || null,
      og_title: o.seo?.og_title ?? null,
      og_description: o.seo?.og_description ?? null,
      og_image_url: ogImageUrl || null,
      primary_keyword: o.seo?.primary_keyword ?? null,
      robots_index: indexingEnabled,
      robots_follow: o.seo?.robots_follow ?? true,
      ...overrides,
    });
  };

  if (overviewQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <p className="text-sm text-destructive">
          {(overviewQuery.error as Error).message || "Failed to load SEO data."}
        </p>
      </div>
    );
  }

  if (!ready || !overviewQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="font-display text-2xl font-semibold">SEO</h1>
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const o = overviewQuery.data;
  const { readiness } = o;
  const effectiveTitle = useAutoTitle ? o.defaultSeoTitle : titleValue || o.defaultSeoTitle;
  const effectiveDescription = useAutoDescription
    ? o.defaultMetaDescription
    : descriptionValue || o.defaultMetaDescription;
  const publicUrl = absoluteUrl(o.publicPath).replace(/^https?:\/\//, "");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <h1 className="font-display text-2xl font-semibold">SEO</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Help more people discover your portfolio through Google.
      </p>

      <div className="mt-6 space-y-5">
        {/* Search visibility — Phase 3F.9 §21: one deterministic state, no
            percentage score. Reuses the exact same evaluatePortfolioContentReadiness()
            result the public route's robots directive and the sitemap consume,
            so this can never disagree with what's actually served (§14/§23). */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Search Visibility</CardTitle>
            <CardDescription>
              A deterministic status of what helps your portfolio get found — not a Google ranking
              score.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Portfolio status</span>
              <Badge variant={o.isPublished ? "default" : "secondary"}>
                {o.isPublished ? "Published" : "Not published"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Google indexing</span>
              <Badge
                variant="outline"
                className={indexingEnabled ? "text-emerald-600" : "text-muted-foreground"}
              >
                {indexingEnabled ? "ON" : "OFF"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-muted-foreground">{publicUrl}</span>
              <Button variant="softline" size="sm" asChild>
                <a href={o.publicPath} target="_blank" rel="noreferrer">
                  View portfolio <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
              <div>
                <p className="font-medium">
                  Portfolio: {portfolioReadinessStateLabel(readiness.state)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {portfolioReadinessMessage(readiness.state)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-xs font-semibold",
                  PORTFOLIO_STATE_META[readiness.state].className,
                )}
              >
                {readiness.state !== "ready" &&
                  readiness.state !== "not_eligible" &&
                  `${readiness.requiredFailedCount} required`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Required / Recommended / Technical — Phase 3F.9 §21/§22, grouped
            by category, required vs recommended always visually distinct. */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Portfolio Readiness Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ReadinessCheckGroup
              title="Required for search"
              checks={readiness.checks.filter(
                (c) => c.required && (c.category === "content" || c.category === "local"),
              )}
            />
            <ReadinessCheckGroup
              title="Recommended (optional — improves customer value, not required for search)"
              checks={readiness.checks.filter((c) => !c.required && c.category !== "technical")}
            />
            <ReadinessCheckGroup
              title="Technical SEO"
              checks={readiness.checks.filter((c) => c.category === "technical")}
            />
          </CardContent>
        </Card>

        {/* Search appearance */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-primary" aria-hidden="true" /> Search Preview
            </CardTitle>
            <CardDescription>
              Google may rewrite titles and descriptions depending on the search.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="truncate text-xs text-muted-foreground">{publicUrl}</p>
              <p className="mt-0.5 truncate text-lg text-[#1a0dab]">{effectiveTitle}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {effectiveDescription}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Primary search target */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Primary Search Target</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {o.primarySearchTarget ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Service</p>
                    <p className="font-medium">{o.primaryServiceName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-medium">{o.primaryCity}</p>
                  </div>
                </div>
                <p className="rounded-lg bg-secondary/30 px-3 py-2 text-sm font-medium">
                  {o.primarySearchTarget}
                </p>
                <p className="text-xs text-muted-foreground">
                  BeautyFolio uses your services and location information to help search engines
                  understand what your portfolio is about. This is not a ranking guarantee.
                </p>
                {(o.secondaryServiceNames.length > 0 || o.serviceAreaNames.length > 0) && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Related portfolio context
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {o.secondaryServiceNames.map((name) => (
                        <Badge key={`svc-${name}`} variant="outline" className="font-normal">
                          {name}
                        </Badge>
                      ))}
                      {o.serviceAreaNames.map((name) => (
                        <Badge key={`area-${name}`} variant="outline" className="font-normal">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add your city and at least one active service to set a primary search target.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Service search pages */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Service Search Pages</CardTitle>
            <CardDescription>
              BeautyFolio can create search-friendly service pages from your published services.
              Pages with insufficient information are kept out of search engines until they're
              ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {o.servicePages.length > 0 && (
              <p className="mb-3 text-sm text-muted-foreground">
                {o.servicePagesSummary.ready} Ready
                {o.servicePagesSummary.needsImprovement > 0 &&
                  ` · ${o.servicePagesSummary.needsImprovement} Needs details`}
                {o.servicePagesSummary.notEligible > 0 &&
                  ` · ${o.servicePagesSummary.notEligible} Hidden`}
              </p>
            )}
            {o.servicePages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add an active service to create a search page for it.
              </p>
            ) : (
              <ul className="space-y-2">
                {o.servicePages.map((sp) => (
                  <li key={sp.path} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{sp.name}</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium",
                          SERVICE_STATE_META[sp.state].className,
                        )}
                      >
                        {sp.state === "ready" && (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {serviceReadinessStateLabel(sp.state)}
                      </span>
                    </div>
                    {sp.state !== "ready" && (
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {sp.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* SEO title */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">SEO Title</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
              <span className="text-sm">Use automatic title</span>
              <Switch checked={useAutoTitle} onCheckedChange={setUseAutoTitle} />
            </div>
            {useAutoTitle ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                {o.defaultSeoTitle}
              </p>
            ) : (
              <Input
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                maxLength={70}
              />
            )}
          </CardContent>
        </Card>

        {/* Meta description */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Meta Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
              <span className="text-sm">Use automatic description</span>
              <Switch checked={useAutoDescription} onCheckedChange={setUseAutoDescription} />
            </div>
            {useAutoDescription ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                {o.defaultMetaDescription}
              </p>
            ) : (
              <Textarea
                rows={3}
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                maxLength={200}
              />
            )}
          </CardContent>
        </Card>

        {/* Indexing control */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Indexing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
              <span className="text-sm">Allow search engines to show my portfolio</span>
              <Switch checked={indexingEnabled} onCheckedChange={setIndexingEnabled} />
            </div>
            <p className="text-xs text-muted-foreground">
              {indexingEnabled
                ? "ON: Search engines are allowed to index your portfolio."
                : "OFF: Your portfolio stays accessible by direct link but should not appear in search-engine results."}
            </p>
          </CardContent>
        </Card>

        {/* Advanced (canonical / social image) */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")}
              aria-hidden="true"
            />
            Advanced (canonical URL, social share image)
          </button>
          {showAdvanced && (
            <Card className="mt-2 border-border/70 shadow-sm">
              <CardContent className="space-y-4 pt-5">
                <div>
                  <label className="text-sm font-medium">Canonical URL (optional)</label>
                  <Input
                    className="mt-1.5"
                    placeholder="https://…"
                    value={canonicalUrl}
                    onChange={(e) => setCanonicalUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Social share image link (optional)</label>
                  <Input
                    className="mt-1.5"
                    placeholder="https://…"
                    value={ogImageUrl}
                    onChange={(e) => setOgImageUrl(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Shown when your portfolio link is shared on WhatsApp, Facebook, etc. Falls back
                    to your profile photo when left blank.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Button type="button" variant="hero" disabled={save.isPending} onClick={() => persist()}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
