/**
 * /dashboard/invoice — Billing Invoice page
 *
 * Shows the user's latest activated plan, payment details, and
 * a full usage-vs-limit breakdown for every plan-gated module.
 * Includes a Print / Download button.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Printer, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLAN_LABELS, getPlanLimit, type PortfolioPlan, type PlanLimitedModule } from "@/lib/plan-limits";
import { paiseToRupeeDisplay } from "@/lib/billing-prices";

export const Route = createFileRoute("/dashboard/invoice")({
  component: InvoicePage,
});

// ─── Server fn ────────────────────────────────────────────────────────────────

const getInvoiceDataFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnBeauticianProfileId } = await import("@/data/dashboard/shared.server");
    const bpId = await getOwnBeauticianProfileId(context.supabase, context.userId);

    // Profile + plan
    const { data: bp } = await context.supabase
      .from("beautician_profiles")
      .select("plan, display_name, phone, whatsapp_number, email, slug")
      .eq("id", bpId)
      .single();

    // Latest activated order
    const { data: orders } = await context.supabase
      .from("billing_orders")
      .select(
        "id, plan, billing_cycle, amount_paise, currency, gateway_order_id, activated_at, access_starts_at, access_expires_at",
      )
      .eq("beautician_profile_id", bpId)
      .eq("status", "activated")
      .order("activated_at", { ascending: false });

    // Usage counts — all in parallel
    const [
      { listOwnServices },
      { listOwnPortfolioItems },
      { listOwnReviews },
      { listOwnPackages },
      { listOwnFaqs },
      { listOwnVideos },
      { listOwnBeforeAfterItems },
      { listOwnServiceAreas },
    ] = await Promise.all([
      import("@/data/dashboard/services.server"),
      import("@/data/dashboard/gallery.server"),
      import("@/data/dashboard/reviews.server"),
      import("@/data/dashboard/packages.server"),
      import("@/data/dashboard/faqs.server"),
      import("@/data/dashboard/videos.server"),
      import("@/data/dashboard/before-after.server"),
      import("@/data/dashboard/service-areas.server"),
    ]);

    const [services, galleryItems, reviews, packages, faqs, videos, beforeAfter, serviceAreas] =
      await Promise.all([
        listOwnServices(context.supabase, context.userId),
        listOwnPortfolioItems(context.supabase, context.userId),
        listOwnReviews(context.supabase, context.userId),
        listOwnPackages(context.supabase, context.userId),
        listOwnFaqs(context.supabase, context.userId),
        listOwnVideos(context.supabase, context.userId),
        listOwnBeforeAfterItems(context.supabase, context.userId),
        listOwnServiceAreas(context.supabase, context.userId),
      ]);

    const photoCount = galleryItems.reduce(
      (sum: number, item: { images: unknown[] }) => sum + item.images.length,
      0,
    );

    return {
      profile: {
        display_name: bp?.display_name ?? "—",
        phone: bp?.phone ?? bp?.whatsapp_number ?? "—",
        email: bp?.email ?? "—",
        slug: bp?.slug ?? "",
      },
      plan: (bp?.plan ?? "free") as PortfolioPlan,
      orders: (orders ?? []) as Array<{
        id: string;
        plan: string;
        billing_cycle: string;
        amount_paise: number;
        currency: string;
        gateway_order_id: string | null;
        activated_at: string | null;
        access_starts_at: string | null;
        access_expires_at: string | null;
      }>,
      usage: {
        services: services.length,
        gallery_photos: photoCount,
        reviews: reviews.length,
        packages: packages.length,
        faqs: faqs.length,
        portfolio_videos: videos.length,
        before_after_items: beforeAfter.length,
        service_areas: serviceAreas.length,
      },
    };
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCycle(cycle: string) {
  return cycle === "yearly" ? "Yearly" : "Monthly";
}

const MODULE_LABELS: Record<PlanLimitedModule, string> = {
  services: "Services",
  packages: "Packages",
  gallery_photos: "Gallery photos",
  before_after_items: "Before & After",
  portfolio_videos: "Videos",
  faqs: "FAQs",
  service_areas: "Service areas",
  reviews: "Reviews",
};

const USAGE_MODULES: PlanLimitedModule[] = [
  "services",
  "packages",
  "gallery_photos",
  "reviews",
  "before_after_items",
  "faqs",
  "portfolio_videos",
  "service_areas",
];

const USAGE_KEY_MAP: Record<PlanLimitedModule, keyof ReturnType<typeof buildUsage>> = {
  services: "services",
  packages: "packages",
  gallery_photos: "gallery_photos",
  reviews: "reviews",
  before_after_items: "before_after_items",
  faqs: "faqs",
  portfolio_videos: "portfolio_videos",
  service_areas: "service_areas",
};

function buildUsage(usage: {
  services: number;
  gallery_photos: number;
  reviews: number;
  packages: number;
  faqs: number;
  portfolio_videos: number;
  before_after_items: number;
  service_areas: number;
}) {
  return usage;
}

// ─── Component ────────────────────────────────────────────────────────────────

function InvoicePage() {
  const query = useQuery({
    queryKey: ["invoice-data"],
    queryFn: () => getInvoiceDataFn(),
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading invoice…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-destructive">
        Failed to load invoice data.
      </div>
    );
  }

  const { profile, plan, orders, usage } = query.data;
  const latestOrder = orders[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/dashboard/billing"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Billing
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" />
          Print / Download
        </Button>
      </div>

      {/* ── Invoice card ── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm print:shadow-none print:border-0">

        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <span className="text-sm font-bold text-primary">B</span>
              </div>
              <span className="text-lg font-bold tracking-tight">BeautyFolio</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Digital growth platform for beauticians</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-2xl font-bold tracking-tight text-foreground">INVOICE</p>
            {latestOrder && (
              <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                #{latestOrder.id.slice(0, 8).toUpperCase()}
              </p>
            )}
            {latestOrder?.activated_at && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Date: {formatDate(latestOrder.activated_at)}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {/* ── Bill to ── */}
          <div className="px-6 py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Bill To
            </p>
            <p className="font-semibold text-foreground">{profile.display_name}</p>
            {profile.phone !== "—" && (
              <p className="mt-0.5 text-sm text-muted-foreground">{profile.phone}</p>
            )}
            {profile.email !== "—" && (
              <p className="mt-0.5 text-sm text-muted-foreground">{profile.email}</p>
            )}
            {profile.slug && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                beuati.vercel.app/portfolio/{profile.slug}
              </p>
            )}
          </div>

          {/* ── Plan summary ── */}
          <div className="px-6 py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Current Plan
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-sm">
                {PLAN_LABELS[plan]}
              </Badge>
              {plan === "free" && (
                <span className="text-xs text-muted-foreground">Free forever</span>
              )}
            </div>
            {latestOrder && (
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                <p>
                  Billing cycle:{" "}
                  <span className="font-medium text-foreground">
                    {formatCycle(latestOrder.billing_cycle)}
                  </span>
                </p>
                {latestOrder.access_starts_at && (
                  <p>
                    Access from:{" "}
                    <span className="font-medium text-foreground">
                      {formatDate(latestOrder.access_starts_at)}
                    </span>
                  </p>
                )}
                {latestOrder.access_expires_at && (
                  <p>
                    Expires:{" "}
                    <span className="font-medium text-foreground">
                      {formatDate(latestOrder.access_expires_at)}
                    </span>
                  </p>
                )}
                {latestOrder.gateway_order_id && (
                  <p className="mt-1 font-mono text-[11px]">
                    Txn: {latestOrder.gateway_order_id}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Payment rows ── */}
        {orders.length > 0 && (
          <div className="border-t border-border">
            <div className="px-6 pt-4 pb-2">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Payment History
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left">
                      <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground">Plan</th>
                      <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground">Cycle</th>
                      <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground">Date</th>
                      <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order, i) => (
                      <tr
                        key={order.id}
                        className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                      >
                        <td className="px-4 py-2.5 font-medium">
                          {PLAN_LABELS[order.plan as PortfolioPlan] ?? order.plan}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {formatCycle(order.billing_cycle)}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {formatDate(order.activated_at)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold">
                          ₹{paiseToRupeeDisplay(order.amount_paise).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Total row */}
                  <tfoot>
                    <tr className="border-t border-border bg-muted/50">
                      <td colSpan={3} className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">
                        Total paid
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-base">
                        ₹{paiseToRupeeDisplay(
                          orders.reduce((s, o) => s + o.amount_paise, 0),
                        ).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Usage vs Plan Limits ── */}
        <div className="border-t border-border px-6 py-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Usage Summary — {PLAN_LABELS[plan]} Plan
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground">Feature</th>
                  <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground text-center">Plan limit</th>
                  <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground text-center">Used</th>
                  <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground text-center">Remaining</th>
                  <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {USAGE_MODULES.map((mod, i) => {
                  const limit = getPlanLimit(plan, mod);
                  const used = usage[USAGE_KEY_MAP[mod]] as number;
                  const remaining = Math.max(0, limit - used);
                  const atLimit = limit > 0 && used >= limit;
                  const locked = limit === 0;

                  return (
                    <tr
                      key={mod}
                      className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                    >
                      <td className="px-4 py-2.5 font-medium">{MODULE_LABELS[mod]}</td>
                      <td className="px-4 py-2.5 text-center text-muted-foreground">
                        {locked ? <span className="text-xs">Locked</span> : limit}
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold">
                        {locked ? "—" : used}
                      </td>
                      <td className="px-4 py-2.5 text-center text-muted-foreground">
                        {locked ? "—" : remaining}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {locked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Upgrade
                          </span>
                        ) : atLimit ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                            <AlertCircle className="h-2.5 w-2.5" />
                            At limit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-col items-center gap-1 border-t border-border px-6 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-foreground">BeautyFolio</span> · beuati.vercel.app
          </p>
          <p className="text-xs text-muted-foreground">
            Payments processed securely by Razorpay
          </p>
        </div>
      </div>

      {/* ── No plan / no orders state ── */}
      {plan === "free" && orders.length === 0 && (
        <div className="rounded-xl border border-border bg-muted/30 px-6 py-5 text-center text-sm text-muted-foreground">
          You are on the free plan. Upgrade to generate a payment invoice.{" "}
          <Link to="/dashboard/billing" className="font-semibold text-primary underline">
            View plans →
          </Link>
        </div>
      )}
    </div>
  );
}
