// Phase 3G.3B — read-only CRM attribution + channel-performance rollup.
// Phase 3G.3C — clickable rows drill into the CRM List view via onDrilldown;
// Insights itself still never mutates a CRM record (no status changes, no
// follow-ups, no attribution editing) — clicking only calls the callback the
// parent route uses to switch view + apply a filter.
import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { sourceLabel } from "@/lib/lead-config";
import { StatCard } from "./lead-views";
import type {
  CampaignRow,
  CtaRow,
  InsightFilter,
  InsightsDateRange,
  LeadInsights,
  PathRow,
  ServiceDemandRow,
  SourceBreakdownRow,
  UtmChannelRow,
} from "@/data/lead-insights.server";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGE_OPTIONS: { value: InsightsDateRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

// "Unknown / historical" never collapses into a real category (§3/§30) —
// sourceLabel(null) would otherwise return "Manual Entry", which is wrong
// here: an enquiry-level source of NULL means genuinely not recorded, not a
// manual entry.
function sourceRowLabel(source: string | null): string {
  return source == null ? "Unknown / historical" : sourceLabel(source);
}

function ctaRowLabel(cta: string | null): string {
  return cta == null ? "Unknown / historical" : cta;
}

function Bar({ share }: { share: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/40">
      <div
        className="h-full rounded-full bg-primary/70"
        style={{ width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share))}%` }}
      />
    </div>
  );
}

// Phase 3G.3C §20 — every clickable insight row is a real <button>, never a
// div with an onClick, so it's keyboard-reachable and gets a visible
// hover/focus state for free from these shared classes.
const ROW_BUTTON_CLASS =
  "block w-full rounded-lg px-1.5 py-1 text-left transition hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptySection({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function SourceBreakdownTable({
  rows,
  onDrilldown,
}: {
  rows: SourceBreakdownRow[];
  onDrilldown: (filter: InsightFilter) => void;
}) {
  if (rows.length === 0) return <EmptySection text="No enquiries in this period." />;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <button
          key={r.source ?? "unknown"}
          type="button"
          className={ROW_BUTTON_CLASS}
          onClick={() => onDrilldown({ type: "source", value: r.source })}
        >
          <div className="flex items-center justify-between text-sm">
            <span className={cn(r.source == null && "text-muted-foreground italic")}>
              {sourceRowLabel(r.source)}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {r.count} · {r.share}%
            </span>
          </div>
          <div className="mt-1">
            <Bar share={r.share} />
          </div>
        </button>
      ))}
    </div>
  );
}

function UtmChannelList({
  rows,
  onDrilldown,
}: {
  rows: UtmChannelRow[];
  onDrilldown: (filter: InsightFilter) => void;
}) {
  if (rows.length === 0) return <EmptySection text="No UTM channel data recorded yet." />;
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={`${r.utmSource}::${r.utmMedium ?? ""}`}>
          <button
            type="button"
            className={cn(ROW_BUTTON_CLASS, "flex items-center justify-between text-sm")}
            onClick={() =>
              onDrilldown({ type: "utmChannel", utmSource: r.utmSource, utmMedium: r.utmMedium })
            }
          >
            <span className="truncate break-words">
              {r.utmSource}
              {r.utmMedium ? ` / ${r.utmMedium}` : ""}
            </span>
            <span className="shrink-0 tabular-nums font-medium">{r.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CampaignTable({
  rows,
  onDrilldown,
}: {
  rows: CampaignRow[];
  onDrilldown: (filter: InsightFilter) => void;
}) {
  if (rows.length === 0) return <EmptySection text="No UTM campaign data recorded yet." />;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <button
          key={`${r.campaign}::${r.utmSource ?? ""}::${r.utmMedium ?? ""}`}
          type="button"
          className={cn(
            ROW_BUTTON_CLASS,
            "flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-secondary/40",
          )}
          onClick={() => onDrilldown({ type: "campaign", value: r.campaign })}
        >
          <div className="min-w-0">
            <p className="truncate font-medium break-words">{r.campaign}</p>
            {(r.utmSource || r.utmMedium) && (
              <p className="text-xs text-muted-foreground">
                {[r.utmSource, r.utmMedium].filter(Boolean).join(" / ")}
              </p>
            )}
          </div>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {r.count} · {r.share}%
          </span>
        </button>
      ))}
    </div>
  );
}

function ServiceDemandList({
  rows,
  onDrilldown,
}: {
  rows: ServiceDemandRow[];
  onDrilldown: (filter: InsightFilter) => void;
}) {
  if (rows.length === 0) return <EmptySection text="No service-linked enquiries in this period." />;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-2">
      {rows.slice(0, 10).map((r) => (
        <button
          key={r.service}
          type="button"
          className={ROW_BUTTON_CLASS}
          onClick={() => onDrilldown({ type: "service", value: r.service })}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="truncate break-words">{r.service}</span>
            <span className="tabular-nums text-muted-foreground">{r.count}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary/40">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

function CtaBreakdownList({
  rows,
  onDrilldown,
}: {
  rows: CtaRow[];
  onDrilldown: (filter: InsightFilter) => void;
}) {
  if (rows.length === 0) return <EmptySection text="No CTA attribution recorded yet." />;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <button
          key={r.ctaLocation ?? "unknown"}
          type="button"
          className={ROW_BUTTON_CLASS}
          onClick={() => onDrilldown({ type: "cta", value: r.ctaLocation })}
        >
          <div className="flex items-center justify-between text-sm">
            <span className={cn(r.ctaLocation == null && "text-muted-foreground italic")}>
              {ctaRowLabel(r.ctaLocation)}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {r.count} · {r.share}%
            </span>
          </div>
          <div className="mt-1">
            <Bar share={r.share} />
          </div>
        </button>
      ))}
    </div>
  );
}

// Landing/conversion pages and referrers stay display-only (§2 — "optional
// only if clean"; a path isn't a useful CRM filter the way source/campaign/
// service/CTA are, so this section deliberately isn't made clickable).
function PathList({ rows, emptyText }: { rows: PathRow[]; emptyText: string }) {
  if (rows.length === 0) return <EmptySection text={emptyText} />;
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.path} className="flex items-center justify-between gap-3">
          <code className="min-w-0 truncate rounded bg-secondary/40 px-1.5 py-0.5 text-xs break-all">
            {r.path}
          </code>
          <span className="shrink-0 tabular-nums font-medium">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function LeadInsightsView({
  insights,
  isLoading,
  isError,
  range,
  onRangeChange,
  onDrilldown,
}: {
  insights: LeadInsights | undefined;
  isLoading: boolean;
  isError: boolean;
  range: InsightsDateRange;
  onRangeChange: (range: InsightsDateRange) => void;
  onDrilldown: (filter: InsightFilter) => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="text-xs text-muted-foreground">
          Where your enquiries come from — based only on enquiries recorded in BeautyFolio. Click a
          row to see the matching customers.
        </p>
        <Select value={range} onValueChange={(v) => onRangeChange(v as InsightsDateRange)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading insights…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load insights.</p>
      ) : !insights || insights.totalEnquiries === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center shadow-soft">
          <BarChart3 className="mx-auto h-8 w-8 text-primary/60" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No enquiries in this period.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a wider date range, such as All time.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards — enquiries and customers are deliberately
              distinct metrics (§4): one customer can submit several
              enquiries, so "enquiries" is never labeled "leads" here. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard size="lg" label="Enquiries" value={insights.totalEnquiries} />
            <StatCard size="lg" label="Unique customers" value={insights.uniqueCustomers} />
            <StatCard size="lg" label="UTM-attributed" value={insights.utmAttributedCount} />
            <StatCard size="lg" label="Unattributed" value={insights.unattributedCount} />
          </div>

          {/* Data-quality indicator — explicitly not styled as a
              performance score (§15/§25). */}
          <p className="text-xs text-muted-foreground">
            Source recorded: {insights.coverage.sourceRecordedPct}% · UTM campaign recorded:{" "}
            {insights.coverage.utmRecordedPct}% · CTA recorded: {insights.coverage.ctaRecordedPct}%
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Source breakdown" subtitle="Share of enquiries in this period">
              <SourceBreakdownTable rows={insights.sourceBreakdown} onDrilldown={onDrilldown} />
            </SectionCard>

            <SectionCard
              title="UTM channel breakdown"
              subtitle="Source / medium, raw recorded values"
            >
              <UtmChannelList rows={insights.utmChannelBreakdown} onDrilldown={onDrilldown} />
            </SectionCard>

            <SectionCard title="Campaign performance" subtitle="Enquiries by campaign">
              <CampaignTable rows={insights.campaignBreakdown} onDrilldown={onDrilldown} />
            </SectionCard>

            <SectionCard
              title="Service demand"
              subtitle="Enquiries per linked service — an enquiry with several services counts once toward each"
            >
              <ServiceDemandList rows={insights.serviceBreakdown} onDrilldown={onDrilldown} />
            </SectionCard>

            <SectionCard title="CTA performance" subtitle="Which CTA drove the enquiry">
              <CtaBreakdownList rows={insights.ctaBreakdown} onDrilldown={onDrilldown} />
            </SectionCard>

            <SectionCard title="Top landing pages" subtitle="Where visitors first arrived">
              <PathList
                rows={insights.landingPageBreakdown}
                emptyText="No landing-page data recorded yet."
              />
            </SectionCard>

            <SectionCard
              title="Top conversion pages"
              subtitle="Where the enquiry was actually submitted"
            >
              <PathList
                rows={insights.conversionPageBreakdown}
                emptyText="No conversion-page data recorded yet."
              />
            </SectionCard>

            {insights.referrerBreakdown && (
              <SectionCard title="Top referring sites" subtitle="External sites that linked here">
                <PathList
                  rows={insights.referrerBreakdown.map((r) => ({ path: r.host, count: r.count }))}
                  emptyText="No referrer data recorded yet."
                />
              </SectionCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}
