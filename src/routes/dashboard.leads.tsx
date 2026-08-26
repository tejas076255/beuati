import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3,
  Inbox,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Search,
  SlidersHorizontal,
  Trello,
  X,
} from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cn } from "@/lib/utils";
import {
  STATUS_META,
  LEAD_SOURCES,
  EVENT_TYPES,
  LOCATION_TYPES,
  DEFAULT_SERVICE_TAGS,
  sourceLabel,
  type LeadStatus,
} from "@/lib/lead-config";
import {
  followupUrgency,
  isCreatedToday,
  isEventToday,
  isNewNotContacted,
  getTodayPriorities,
} from "@/lib/lead-helpers";
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
  LeadListView,
  LeadCardView,
  LeadPipelineView,
  LeadDailyCommandCenter,
  PipelineStrip,
  StatCard,
} from "@/components/leads/lead-views";
import { LeadAddDialog, type LeadFormValues } from "@/components/leads/lead-add-dialog";
import {
  LeadDetailDialog,
  type FollowupSubmission,
  type CompletionSubmission,
} from "@/components/leads/lead-detail-dialog";
import { LeadInsightsView } from "@/components/leads/lead-insights-view";
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import type { LeadWithInquiry } from "@/data/leads-query.server";
import { RANGE_LABELS } from "@/data/lead-insights.server";
import type { DrilldownMatch, InsightFilter, InsightsDateRange } from "@/data/lead-insights.server";

export const Route = createFileRoute("/dashboard/leads")({
  component: LeadsDashboard,
});

// ---------- server functions ----------

const listLeadsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnLeadsWithInquiry } = await import("@/data/leads-query.server");
    return listOwnLeadsWithInquiry(context.supabase);
  });

const getLeadInsightsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { range: InsightsDateRange }) => data)
  .handler(async ({ context, data }) => {
    const { getOwnLeadInsights } = await import("@/data/lead-insights.server");
    return getOwnLeadInsights(context.supabase, context.userId, data.range);
  });

const getInsightDrilldownFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { range: InsightsDateRange; filter: InsightFilter }) => data)
  .handler(async ({ context, data }) => {
    const { getInsightDrilldownMatches } = await import("@/data/lead-insights.server");
    return getInsightDrilldownMatches(context.supabase, context.userId, data.range, data.filter);
  });

const listMyServiceNamesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnServices } = await import("@/data/dashboard/services.server");
    const services = await listOwnServices(context.supabase, context.userId);
    return services.map((s) => s.name);
  });

const listActivitiesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { leadId: string }) => data)
  .handler(async ({ context, data }) => {
    const { getLeadActivities } = await import("@/data/leads-query.server");
    return getLeadActivities(context.supabase, data.leadId);
  });

interface LeadFormPayload {
  name: string;
  phone: string;
  email: string;
  source: string;
  eventDate: string;
  eventType: string;
  numPersons: string;
  locationType: string;
  venueArea: string;
  requirement: string;
  budget: string;
  specialRequirements: string;
  services: string[];
  initialNotes: string;
}

const createLeadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: LeadFormPayload) => data)
  .handler(async ({ context, data }) => {
    const { createLead, updateLeadNotes } = await import("@/data/leads-query.server");
    const result = await createLead(
      context.supabase,
      context.userId,
      { name: data.name, phone: data.phone, email: data.email || null, source: data.source },
      {
        event_date: data.eventDate || null,
        event_type: data.eventType || null,
        num_persons: data.numPersons ? Number(data.numPersons) : null,
        location_type: data.locationType || null,
        venue_area: data.venueArea || null,
        requirement: data.requirement || null,
        budget: data.budget ? Number(data.budget) : null,
        special_requirements: data.specialRequirements || null,
        services: data.services,
      },
    );
    if (data.initialNotes.trim()) {
      await updateLeadNotes(context.supabase, result.id, data.initialNotes);
    }
    return result;
  });

const updateLeadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: LeadFormPayload & { leadId: string; inquiryId: string | null }) => data)
  .handler(async ({ context, data }) => {
    const { updateLead } = await import("@/data/leads-query.server");
    await updateLead(
      context.supabase,
      data.leadId,
      { name: data.name, phone: data.phone, email: data.email || null, source: data.source },
      {
        event_date: data.eventDate || null,
        event_type: data.eventType || null,
        num_persons: data.numPersons ? Number(data.numPersons) : null,
        location_type: data.locationType || null,
        venue_area: data.venueArea || null,
        requirement: data.requirement || null,
        budget: data.budget ? Number(data.budget) : null,
        special_requirements: data.specialRequirements || null,
        services: data.services,
      },
      data.inquiryId,
    );
  });

const updateLeadStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { leadId: string; status: LeadStatus }) => data)
  .handler(async ({ context, data }) => {
    const { updateLeadStatus } = await import("@/data/leads-query.server");
    // previousStatus is intentionally not accepted from the client — the
    // server reads the lead's current status itself so a stale/racing client
    // value can never produce an inaccurate activity record.
    return updateLeadStatus(context.supabase, data.leadId, data.status);
  });

const updateLeadNotesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { leadId: string; notes: string }) => data)
  .handler(async ({ context, data }) => {
    const { updateLeadNotes } = await import("@/data/leads-query.server");
    await updateLeadNotes(context.supabase, data.leadId, data.notes);
  });

interface AddActivityPayload {
  leadId: string;
  activityType: "call" | "whatsapp" | "sms" | "email" | "note" | "follow_up";
  channel: "phone" | "whatsapp" | "sms" | "email" | "manual" | null;
  body: string;
  outcome: string;
  occurredAt: string | null;
  nextFollowupAt: string | null;
  nextFollowupReason: string;
  followupType: string | null;
  /** Marks this as a "Mark completed" activity so the timeline renders it as
   * "Follow-up completed" instead of by follow-up type. */
  completed?: boolean;
}

const addActivityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: AddActivityPayload) => data)
  .handler(async ({ context, data }) => {
    const { addLeadActivity } = await import("@/data/leads-query.server");
    await addLeadActivity(context.supabase, data.leadId, {
      activityType: data.activityType,
      channel: data.channel,
      body: data.body || null,
      outcome: data.outcome || null,
      occurredAt: data.occurredAt,
      nextFollowupAt: data.nextFollowupAt,
      nextFollowupReason: data.nextFollowupReason || null,
      metadata:
        data.followupType || data.completed
          ? {
              ...(data.followupType ? { followup_type: data.followupType } : {}),
              ...(data.completed ? { completed: true } : {}),
            }
          : undefined,
    });
  });

// ---------- view switcher (persisted) ----------

type ViewMode = "list" | "cards" | "pipeline" | "insights";
const VIEW_STORAGE_KEY = "beautyfolio.leads.view";

function readStoredView(): ViewMode {
  if (typeof window === "undefined") return "list";
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return v === "list" || v === "cards" || v === "pipeline" || v === "insights" ? v : "list";
}

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: typeof ListIcon }[] = [
  { value: "list", label: "List", icon: ListIcon },
  { value: "cards", label: "Cards", icon: LayoutGrid },
  { value: "pipeline", label: "Pipeline", icon: Trello },
  { value: "insights", label: "Insights", icon: BarChart3 },
];

// ---------- dashboard ----------

const EMPTY_LEADS: LeadWithInquiry[] = [];
const EMPTY_SERVICES: string[] = [];

const STATUS_CARD_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "quoted",
  "booked",
  "completed",
  "lost",
];

const ATTENTION_FILTER_LABELS: Record<string, string> = {
  leads_today: "Today's Leads",
  followups_today: "Follow-ups Today",
  overdue: "Overdue",
  events_today: "Events Today",
  new_not_contacted: "New, not contacted",
};

const TODAY_HEADER_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
};

// Phase 3G.3C §10 — one compact, truthful label per filter type. "Unknown /
// historical" mirrors the exact Insights wording (§9) — a clicked NULL
// bucket is never rendered as a real channel name.
function insightFilterLabel(filter: InsightFilter): string {
  switch (filter.type) {
    case "source":
      return `Source · ${filter.value == null ? "Unknown / historical" : sourceLabel(filter.value)}`;
    case "utmChannel":
      return `Channel · ${filter.utmSource}${filter.utmMedium ? ` / ${filter.utmMedium}` : ""}`;
    case "campaign":
      return `Campaign · ${filter.value}`;
    case "service":
      return `Service · ${filter.value}`;
    case "cta":
      return `CTA · ${filter.value == null ? "Unknown / historical" : filter.value}`;
  }
}

function LeadsDashboard() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  // Single source of truth for the pipeline-status filter — driven by both
  // the summary cards and the toolbar dropdown, so picking one never leaves
  // the other stuck on a stale value that ANDs into an empty result set.
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  // Time-based attention filter is a separate dimension from pipeline status
  // (a lead can be "Overdue" regardless of its status), so it's composable
  // with statusFilter rather than sharing its state. Only one of these is
  // ever active at a time (clicking a second one replaces the first) — same
  // unified-filter discipline as statusFilter, applied to this dimension.
  const [attentionFilter, setAttentionFilter] = useState<
    "none" | "leads_today" | "followups_today" | "overdue" | "events_today" | "new_not_contacted"
  >("none");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [eventMonth, setEventMonth] = useState("");
  const [createdDate, setCreatedDate] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [openInCompleteMode, setOpenInCompleteMode] = useState(false);
  const [openInFollowupMode, setOpenInFollowupMode] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadWithInquiry | null>(null);
  const [insightsRange, setInsightsRange] = useState<InsightsDateRange>("30d");
  // Phase 3G.3C — the active Insights drill-down, if any. Independent of
  // `view`: switching back to Insights (or Cards/Pipeline) does NOT clear
  // it, only the explicit "Clear" action does (§13 — back-and-forth without
  // losing context).
  const [insightFilter, setInsightFilter] = useState<InsightFilter | null>(null);

  useEffect(() => setView(readStoredView()), []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const leadsQuery = useQuery({ queryKey: ["leads"], queryFn: () => listLeadsFn() });
  const servicesQuery = useQuery({
    queryKey: ["my-service-names"],
    queryFn: () => listMyServiceNamesFn(),
  });
  // Only fetched while the Insights view is actually open — no need to
  // aggregate on every Leads page load.
  const insightsQuery = useQuery({
    queryKey: ["lead-insights", insightsRange],
    queryFn: () => getLeadInsightsFn({ data: { range: insightsRange } }),
    enabled: view === "insights",
  });
  // Phase 3G.3C §8 — always uses the SAME insightsRange that produced the
  // clicked row, never silently expanding to all-time.
  const drilldownQuery = useQuery({
    queryKey: ["insight-drilldown", insightsRange, insightFilter],
    queryFn: () =>
      getInsightDrilldownFn({ data: { range: insightsRange, filter: insightFilter! } }),
    enabled: insightFilter != null,
  });
  const drilldownData = drilldownQuery.data;
  const drilldownMatches: DrilldownMatch[] = useMemo(() => drilldownData ?? [], [drilldownData]);
  const matchMap = useMemo(
    () => new Map(drilldownMatches.map((m) => [m.leadId, m])),
    [drilldownMatches],
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["new-leads-count"] });
  };

  const createMutation = useMutation({
    mutationFn: (data: LeadFormPayload) => createLeadFn({ data }),
  });
  const updateMutation = useMutation({
    mutationFn: (data: LeadFormPayload & { leadId: string; inquiryId: string | null }) =>
      updateLeadFn({ data }),
  });
  const followupMutation = useMutation({
    mutationFn: (data: AddActivityPayload) => addActivityFn({ data }),
  });

  const updateStatus = useMutation({
    mutationFn: (vars: { leadId: string; status: LeadStatus }) =>
      updateLeadStatusFn({ data: vars }),
    onSuccess: (result) => {
      if (result.changed) {
        toast.success("Lead status updated");
        queryClient.invalidateQueries({ queryKey: ["lead-activities"] });
      }
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update lead"),
  });

  const saveNotes = useMutation({
    mutationFn: (vars: { leadId: string; notes: string }) => updateLeadNotesFn({ data: vars }),
    onSuccess: () => {
      toast.success("Notes saved");
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save notes"),
  });

  const leads = leadsQuery.data ?? EMPTY_LEADS;
  const serviceCatalog = servicesQuery.data ?? EMPTY_SERVICES;
  const serviceOptions = useMemo(
    () => Array.from(new Set([...DEFAULT_SERVICE_TAGS, ...serviceCatalog])),
    [serviceCatalog],
  );

  const counts = useMemo(() => {
    const c: Record<LeadStatus, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      quoted: 0,
      negotiation: 0,
      booked: 0,
      completed: 0,
      lost: 0,
      archived: 0,
    };
    let leadsToday = 0;
    let followupsToday = 0;
    let overdue = 0;
    let eventsToday = 0;
    let newNotContacted = 0;
    let newTodayNotContacted = 0;
    for (const l of leads) {
      c[l.status]++;
      const urgency = followupUrgency(l.next_followup_at);
      if (urgency?.kind === "today") followupsToday++;
      if (urgency?.kind === "overdue") overdue++;
      if (isEventToday(l.inquiry?.event_date ?? null)) eventsToday++;
      if (isCreatedToday(l.created_at)) leadsToday++;
      if (isNewNotContacted(l.status, l.last_contacted_at)) {
        newNotContacted++;
        if (isCreatedToday(l.created_at)) newTodayNotContacted++;
      }
    }
    return {
      byStatus: c,
      leadsToday,
      followupsToday,
      overdue,
      eventsToday,
      newNotContacted,
      newTodayNotContacted,
    };
  }, [leads]);

  // Single source of truth shared with LeadDailyCommandCenter — computing
  // this once here (rather than each independently re-deriving "what's
  // actionable") is what guarantees the summary line and the priorities
  // list can never contradict each other (e.g. summary saying "caught up"
  // while the list still shows a stale uncontacted lead).
  const todayPriorities = useMemo(() => getTodayPriorities(leads), [leads]);

  // Deterministic, human-readable summary of today's actionable items — no
  // AI, just a join of whichever tier counts are non-zero. Tiers 4/5/6
  // (contact-overdue / needs-contact / fresh new lead) are all uncontacted
  // New leads, so they're combined into one "need contact" figure here even
  // though they render as differently-labeled rows in Today's Priorities.
  const attentionLine = useMemo(() => {
    let overdueCount = 0;
    let followupTodayCount = 0;
    let eventsTodayCount = 0;
    let newNeedsContactCount = 0;
    let eventTomorrowCount = 0;
    for (const { tier } of todayPriorities) {
      if (tier === 1) overdueCount++;
      else if (tier === 2) followupTodayCount++;
      else if (tier === 3) eventsTodayCount++;
      else if (tier === 4 || tier === 5 || tier === 6) newNeedsContactCount++;
      else if (tier === 7) eventTomorrowCount++;
    }
    const parts: string[] = [];
    if (overdueCount > 0) {
      parts.push(`${overdueCount} overdue follow-up${overdueCount === 1 ? "" : "s"}`);
    }
    if (followupTodayCount > 0) {
      parts.push(`${followupTodayCount} follow-up${followupTodayCount === 1 ? "" : "s"} due today`);
    }
    if (eventsTodayCount > 0) {
      parts.push(`${eventsTodayCount} event${eventsTodayCount === 1 ? "" : "s"} today`);
    }
    if (newNeedsContactCount > 0) {
      parts.push(
        `${newNeedsContactCount} new lead${newNeedsContactCount === 1 ? "" : "s"} need contact`,
      );
    }
    if (eventTomorrowCount > 0) {
      parts.push(`${eventTomorrowCount} event${eventTomorrowCount === 1 ? "" : "s"} tomorrow`);
    }
    if (parts.length === 0) return "You're caught up for today.";
    return parts.join(" · ");
  }, [todayPriorities]);

  const allServiceTags = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) for (const s of l.inquiry?.services ?? []) set.add(s);
    return Array.from(set);
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (attentionFilter === "followups_today") {
        if (followupUrgency(l.next_followup_at)?.kind !== "today") return false;
      } else if (attentionFilter === "overdue") {
        if (followupUrgency(l.next_followup_at)?.kind !== "overdue") return false;
      } else if (attentionFilter === "events_today") {
        if (!isEventToday(l.inquiry?.event_date ?? null)) return false;
      } else if (attentionFilter === "leads_today") {
        if (!isCreatedToday(l.created_at)) return false;
      } else if (attentionFilter === "new_not_contacted") {
        if (!isNewNotContacted(l.status, l.last_contacted_at)) return false;
      }
      if (sourceFilter !== "all" && (l.source ?? "manual_entry") !== sourceFilter) return false;
      if (serviceFilter !== "all" && !(l.inquiry?.services ?? []).includes(serviceFilter))
        return false;
      if (eventTypeFilter !== "all" && l.inquiry?.event_type !== eventTypeFilter) return false;
      if (locationFilter !== "all" && l.inquiry?.location_type !== locationFilter) return false;
      if (eventMonth && l.inquiry?.event_date?.slice(0, 7) !== eventMonth) return false;
      if (createdDate && l.created_at.slice(0, 10) !== createdDate) return false;
      // Phase 3G.3C §11 — one additional active constraint alongside every
      // existing filter above, never a replacement for them.
      if (insightFilter && !matchMap.has(l.id)) return false;
      if (q) {
        const haystack = [l.name, l.phone, l.email, ...(l.inquiry?.services ?? [])]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    leads,
    search,
    statusFilter,
    attentionFilter,
    sourceFilter,
    serviceFilter,
    insightFilter,
    matchMap,
    eventTypeFilter,
    locationFilter,
    eventMonth,
    createdDate,
  ]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) ?? null;
  const hasFilters =
    search ||
    statusFilter !== "all" ||
    attentionFilter !== "none" ||
    sourceFilter !== "all" ||
    serviceFilter !== "all" ||
    eventTypeFilter !== "all" ||
    locationFilter !== "all" ||
    eventMonth ||
    createdDate;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setAttentionFilter("none");
    setSourceFilter("all");
    setServiceFilter("all");
    setEventTypeFilter("all");
    setLocationFilter("all");
    setEventMonth("");
    setCreatedDate("");
  };

  const openAddDialog = () => {
    setEditingLead(null);
    setAddDialogOpen(true);
  };

  // Phase 3G.3C §3 — switches Insights -> List and applies the enquiry-aware
  // filter; §18 optional internal event, no customer data.
  const handleDrilldown = (filter: InsightFilter) => {
    setInsightFilter(filter);
    setView("list");
    trackEvent(AnalyticsEvent.InsightDrilldown, {
      drilldown_type: filter.type,
      value:
        filter.type === "utmChannel"
          ? `${filter.utmSource}/${filter.utmMedium ?? ""}`
          : (filter.value ?? "unknown"),
      date_range: insightsRange,
    });
  };
  const clearInsightFilter = () => setInsightFilter(null);

  const buildPayload = (v: LeadFormValues): LeadFormPayload => ({ ...v });

  return (
    <div className="bg-background px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* A. Page header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Leads</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage enquiries, follow-ups and bookings from your BeautyFolio portfolio.
            </p>
          </div>
          <Button type="button" variant="hero" onClick={openAddDialog}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Lead
          </Button>
        </div>

        {leadsQuery.isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading leads…</p>
        ) : leadsQuery.isError ? (
          <p className="mt-6 text-sm text-destructive">
            {(leadsQuery.error as Error).message || "Failed to load leads."}
          </p>
        ) : leads.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center shadow-soft">
            <Inbox className="mx-auto h-8 w-8 text-primary/60" aria-hidden="true" />
            <p className="mt-3 text-base font-semibold">No leads yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your enquiries from BeautyFolio will appear here.
            </p>
            <Button type="button" variant="hero" className="mt-4" onClick={openAddDialog}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add your first lead
            </Button>
          </div>
        ) : (
          <>
            {/* B. Today command center — the primary "what needs me right now"
                metrics. Hidden in Insights, which is an aggregate rollup
                view, not a per-lead worklist (§26 — keep it lightweight,
                not bolted onto unrelated pipeline UI). */}
            {view !== "insights" && (
              <div>
                <p className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Today · {new Date().toLocaleDateString(undefined, TODAY_HEADER_FORMAT)}
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCard
                    size="lg"
                    label="Today's Leads"
                    value={counts.leadsToday}
                    active={attentionFilter === "leads_today"}
                    onClick={() =>
                      setAttentionFilter(attentionFilter === "leads_today" ? "none" : "leads_today")
                    }
                  />
                  <StatCard
                    size="lg"
                    label="Follow-ups Today"
                    value={counts.followupsToday}
                    active={attentionFilter === "followups_today"}
                    onClick={() =>
                      setAttentionFilter(
                        attentionFilter === "followups_today" ? "none" : "followups_today",
                      )
                    }
                  />
                  <StatCard
                    size="lg"
                    label="Overdue"
                    value={counts.overdue}
                    active={attentionFilter === "overdue"}
                    onClick={() =>
                      setAttentionFilter(attentionFilter === "overdue" ? "none" : "overdue")
                    }
                  />
                  <StatCard
                    size="lg"
                    label="Events Today"
                    value={counts.eventsToday}
                    active={attentionFilter === "events_today"}
                    onClick={() =>
                      setAttentionFilter(
                        attentionFilter === "events_today" ? "none" : "events_today",
                      )
                    }
                  />
                </div>
                <p
                  className={cn(
                    "mt-2 text-xs font-medium",
                    attentionLine === "You're caught up for today."
                      ? "text-muted-foreground"
                      : "text-foreground",
                  )}
                >
                  {attentionLine}
                </p>
              </div>
            )}

            {view !== "insights" && (
              <>
                {/* Secondary pipeline metrics — compact strip, deliberately
                    low visual weight next to the Today bar above. */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <PipelineStrip
                    statuses={STATUS_CARD_ORDER.slice(0, 5).map((status) => ({
                      status,
                      label: STATUS_META[status].label,
                      value: counts.byStatus[status],
                    }))}
                    activeStatus={statusFilter === "all" ? null : statusFilter}
                    onToggle={(status) =>
                      setStatusFilter(statusFilter === status ? "all" : (status as LeadStatus))
                    }
                  />
                  <span className="text-xs text-muted-foreground">{leads.length} total leads</span>
                </div>
                <div className="mt-2">
                  <PipelineStrip
                    statuses={(["completed", "lost"] as LeadStatus[]).map((status) => ({
                      status,
                      label: STATUS_META[status].label,
                      value: counts.byStatus[status],
                    }))}
                    activeStatus={statusFilter === "all" ? null : statusFilter}
                    onToggle={(status) =>
                      setStatusFilter(statusFilter === status ? "all" : (status as LeadStatus))
                    }
                  />
                </div>

                {(attentionFilter !== "none" || statusFilter !== "all") && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Active filter:</span>
                    {statusFilter !== "all" && (
                      <button
                        type="button"
                        onClick={() => setStatusFilter("all")}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary"
                      >
                        {STATUS_META[statusFilter].label}
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                    {attentionFilter !== "none" && (
                      <button
                        type="button"
                        onClick={() => setAttentionFilter("none")}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary"
                      >
                        {ATTENTION_FILTER_LABELS[attentionFilter]}
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}

                {/* Today's Priorities + Upcoming Events */}
                <LeadDailyCommandCenter
                  leads={leads}
                  onOpen={(id) => {
                    setOpenInCompleteMode(false);
                    setOpenInFollowupMode(false);
                    setSelectedLeadId(id);
                  }}
                  onOpenToComplete={(id) => {
                    setOpenInCompleteMode(true);
                    setOpenInFollowupMode(false);
                    setSelectedLeadId(id);
                  }}
                  onOpenToReschedule={(id) => {
                    setOpenInCompleteMode(false);
                    setOpenInFollowupMode(true);
                    setSelectedLeadId(id);
                  }}
                />
              </>
            )}

            {/* Phase 3G.3C §10 — visible, compact indicator for an active
                Insights drill-down, with a Clear action. Shown regardless of
                which of List/Cards/Pipeline is currently active, since the
                filter itself applies to all three (§11). */}
            {insightFilter && view !== "insights" && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
                <span className="font-medium text-muted-foreground">Insight filter:</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary">
                  {insightFilterLabel(insightFilter)}
                </span>
                <span className="text-muted-foreground">
                  {drilldownQuery.isLoading
                    ? "Loading matches…"
                    : `${drilldownMatches.length} matching customer${drilldownMatches.length === 1 ? "" : "s"} · range: ${RANGE_LABELS[insightsRange]}`}
                </span>
                <button
                  type="button"
                  onClick={clearInsightFilter}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  <X className="h-3 w-3" aria-hidden="true" /> Clear
                </button>
              </div>
            )}

            {/* C. Search + filters + view switcher */}
            <div className="mt-5 space-y-2.5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search leads by name, phone, email or service…"
                    className="pl-9"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/20 p-0.5">
                  {VIEW_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setView(opt.value)}
                      aria-pressed={view === opt.value}
                      aria-label={opt.label}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                        view === opt.value
                          ? "bg-card text-primary shadow-soft"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <opt.icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {view !== "insights" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => setStatusFilter(v as LeadStatus | "all")}
                  >
                    <SelectTrigger className="w-[132px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {Object.entries(STATUS_META).map(([value, meta]) => (
                        <SelectItem key={value} value={value}>
                          {meta.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-[132px]">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={serviceFilter} onValueChange={setServiceFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All services</SelectItem>
                      {allServiceTags.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMoreFilters((v) => !v)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    {showMoreFilters ? "Fewer filters" : "More filters"}
                  </Button>
                  {hasFilters && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
                    </Button>
                  )}
                </div>
              )}

              {view !== "insights" && showMoreFilters && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-2.5">
                  <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Event type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All event types</SelectItem>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={locationFilter} onValueChange={setLocationFilter}>
                    <SelectTrigger className="w-[170px]">
                      <SelectValue placeholder="Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All locations</SelectItem>
                      {LOCATION_TYPES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="month"
                    value={eventMonth}
                    onChange={(e) => setEventMonth(e.target.value)}
                    className="w-[150px]"
                    aria-label="Filter by event month"
                  />
                  <Input
                    type="date"
                    value={createdDate}
                    onChange={(e) => setCreatedDate(e.target.value)}
                    className="w-[150px]"
                    aria-label="Filter by created date"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAttentionFilter(
                        attentionFilter === "new_not_contacted" ? "none" : "new_not_contacted",
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
                      attentionFilter === "new_not_contacted"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    New, not contacted
                    <span className="font-semibold">{counts.newNotContacted}</span>
                  </button>
                </div>
              )}
            </div>

            {/* D. Lead workspace / Insights */}
            {view === "insights" ? (
              <LeadInsightsView
                insights={insightsQuery.data}
                isLoading={insightsQuery.isLoading}
                isError={insightsQuery.isError}
                range={insightsRange}
                onRangeChange={setInsightsRange}
                onDrilldown={handleDrilldown}
              />
            ) : insightFilter && drilldownQuery.isLoading ? (
              <p className="mt-8 text-center text-sm text-muted-foreground">Loading matches…</p>
            ) : filtered.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-border/70 bg-card p-8 text-center shadow-soft">
                <p className="text-sm font-medium">
                  {insightFilter
                    ? "No customers found for this insight in the selected period."
                    : search.trim()
                      ? `No leads found for "${search.trim()}".`
                      : "No leads match the selected filters."}
                </p>
                {!insightFilter && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try a different search term or adjust your filters.
                  </p>
                )}
                {insightFilter && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={clearInsightFilter}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filter
                  </Button>
                )}
                {!insightFilter && hasFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={clearFilters}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
                  </Button>
                )}
              </div>
            ) : view === "list" ? (
              <LeadListView leads={filtered} onOpen={setSelectedLeadId} />
            ) : view === "cards" ? (
              <LeadCardView leads={filtered} onOpen={setSelectedLeadId} />
            ) : (
              <LeadPipelineView leads={filtered} onOpen={setSelectedLeadId} />
            )}
          </>
        )}
      </div>

      {/* E. Lead detail workspace */}
      {selectedLead && (
        <LeadDetailDialog
          key={selectedLead.id}
          lead={selectedLead}
          // Phase 3G.3C §6 — "at minimum, Open Lead must show the matching
          // enquiry somewhere" without restructuring the dialog into a full
          // multi-enquiry history view (deferred, per §6, as a larger
          // change). Only present when this lead was opened while a
          // drill-down filter was active and it genuinely matched.
          matchContext={insightFilter ? (matchMap.get(selectedLead.id) ?? null) : null}
          autoOpenComplete={openInCompleteMode}
          autoOpenFollowup={openInFollowupMode}
          onClose={() => {
            setSelectedLeadId(null);
            setOpenInCompleteMode(false);
            setOpenInFollowupMode(false);
          }}
          onEdit={() => {
            setEditingLead(selectedLead);
            setAddDialogOpen(true);
            setSelectedLeadId(null);
            setOpenInCompleteMode(false);
            setOpenInFollowupMode(false);
          }}
          onStatusChange={(status) => updateStatus.mutate({ leadId: selectedLead.id, status })}
          statusChangePending={updateStatus.isPending}
          onSaveNotes={(notes) => saveNotes.mutate({ leadId: selectedLead.id, notes })}
          savingNotes={saveNotes.isPending}
          loggingFollowup={followupMutation.isPending}
          onLogFollowup={async (v: FollowupSubmission) => {
            const channel: "phone" | "whatsapp" | "sms" | "email" | "manual" =
              v.type === "call"
                ? "phone"
                : v.type === "whatsapp" || v.type === "sms" || v.type === "email"
                  ? v.type
                  : "manual";
            const occurredAt = new Date(`${v.date}T${v.time || "12:00"}`).toISOString();
            const nextFollowupAt = v.nextDate
              ? new Date(`${v.nextDate}T${v.nextTime || "12:00"}`).toISOString()
              : null;
            await followupMutation.mutateAsync({
              leadId: selectedLead.id,
              activityType: "follow_up",
              channel,
              body: v.note,
              outcome: v.outcome,
              occurredAt,
              nextFollowupAt,
              nextFollowupReason: v.nextReason,
              followupType: v.type,
            });
            toast.success("Follow-up logged.");
            invalidateAll();
          }}
          completingFollowup={followupMutation.isPending}
          onCompleteFollowup={async (v: CompletionSubmission) => {
            const nextFollowupAt =
              v.scheduleAnother && v.nextDate
                ? new Date(`${v.nextDate}T${v.nextTime || "12:00"}`).toISOString()
                : null;
            await followupMutation.mutateAsync({
              leadId: selectedLead.id,
              activityType: "follow_up",
              channel: "manual",
              body: v.note,
              outcome: v.outcome,
              occurredAt: new Date().toISOString(),
              nextFollowupAt,
              nextFollowupReason: v.scheduleAnother ? v.nextReason : "",
              followupType: null,
              completed: true,
            });
            toast.success("Follow-up completed.");
            invalidateAll();
          }}
          fetchActivities={(leadId) => listActivitiesFn({ data: { leadId } })}
        />
      )}

      {/* Add / Edit dialog */}
      <LeadAddDialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) setEditingLead(null);
        }}
        lead={editingLead}
        serviceOptions={serviceOptions}
        submitting={createMutation.isPending || updateMutation.isPending}
        onCreate={async (values) => {
          const result = await createMutation.mutateAsync(buildPayload(values));
          invalidateAll();
          return result;
        }}
        onUpdate={async (leadId, inquiryId, values) => {
          await updateMutation.mutateAsync({ ...buildPayload(values), leadId, inquiryId });
          invalidateAll();
        }}
        onScheduleFollowup={async (leadId, date, reason) => {
          await followupMutation.mutateAsync({
            leadId,
            activityType: "follow_up",
            channel: "manual",
            body: reason ? `Follow-up scheduled: ${reason}` : "Follow-up scheduled.",
            outcome: "",
            occurredAt: new Date().toISOString(),
            nextFollowupAt: new Date(`${date}T12:00`).toISOString(),
            nextFollowupReason: reason,
            followupType: "other",
          });
          invalidateAll();
        }}
        onOpenLead={(leadId) => setSelectedLeadId(leadId)}
        onAddFollowup={(leadId) => setSelectedLeadId(leadId)}
      />
    </div>
  );
}
