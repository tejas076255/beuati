import { cn } from "@/lib/utils";
import { STATUS_ORDER, STATUS_META, sourceLabel, locationTypeLabel } from "@/lib/lead-config";
import {
  formatShortDate,
  telLink,
  waLink,
  followupUrgency,
  eventApproaching,
  isEventTomorrow,
  isUpcomingEvent,
  relativeDayLabel,
  staleLeadUrgency,
  getTodayPriorities,
  URGENCY_TEXT_CLASS,
  URGENCY_DOT_CLASS,
} from "@/lib/lead-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, CheckCircle2, MessageCircle, Phone, RotateCcw, Users } from "lucide-react";
import type { LeadWithInquiry } from "@/data/leads-query.server";

// ---------- shared bits ----------

export function StatCard({
  label,
  value,
  active,
  onClick,
  size = "sm",
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
  /** "lg" is reserved for the primary Today/Overdue action metrics so they
   * visibly outweigh the secondary pipeline/business stat cards. */
  size?: "sm" | "lg";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-xl border border-border bg-card text-left transition",
        size === "lg" ? "px-4 py-3.5" : "px-3 py-2.5",
        onClick && "hover:border-primary/40",
        active && "border-primary bg-primary/5 ring-1 ring-primary/20",
      )}
    >
      <p
        className={cn(
          "leading-none text-muted-foreground",
          size === "lg" ? "text-xs" : "text-[11px]",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 leading-none font-semibold",
          size === "lg" ? "text-2xl text-primary" : "text-lg",
        )}
      >
        {value}
      </p>
    </button>
  );
}

function EventBadge({ eventDate }: { eventDate: string | null }) {
  const approaching = eventApproaching(eventDate);
  if (!approaching) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        approaching.daysAway <= 1
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-border bg-secondary/40 text-muted-foreground",
      )}
    >
      {approaching.label}
    </span>
  );
}

function FollowupIndicator({ nextFollowupAt }: { nextFollowupAt: string | null }) {
  const urgency = followupUrgency(nextFollowupAt);
  if (!urgency) {
    return <span className="text-sm text-muted-foreground">No follow-up</span>;
  }
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-sm", URGENCY_TEXT_CLASS[urgency.kind])}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", URGENCY_DOT_CLASS[urgency.kind])} />
      {urgency.label}
    </span>
  );
}

function QuickActions({
  lead,
  onOpen,
  compact,
}: {
  lead: LeadWithInquiry;
  onOpen: () => void;
  compact?: boolean;
}) {
  const call = telLink(lead.phone);
  const whatsapp = waLink(lead.phone, lead.name);
  const size = compact ? "sm" : "sm";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button variant="softline" size={size} disabled={!call} asChild={!!call} aria-label="Call">
        {call ? (
          <a href={call}>
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {!compact && "Call"}
          </a>
        ) : (
          <>
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {!compact && "Call"}
          </>
        )}
      </Button>
      <Button
        variant="softline"
        size={size}
        disabled={!whatsapp}
        asChild={!!whatsapp}
        aria-label="WhatsApp"
      >
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noreferrer">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {!compact && "WhatsApp"}
          </a>
        ) : (
          <>
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {!compact && "WhatsApp"}
          </>
        )}
      </Button>
      <Button type="button" variant="outline" size={size} onClick={onOpen}>
        Open
      </Button>
    </div>
  );
}

// ---------- list view ----------

export function LeadListView({
  leads,
  onOpen,
}: {
  leads: LeadWithInquiry[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      {/* Desktop header */}
      <div className="hidden grid-cols-[1.3fr_1fr_1fr_0.9fr_0.9fr_1fr_0.8fr_auto] gap-3 border-b border-border bg-secondary/30 px-4 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase lg:grid">
        <span>Lead</span>
        <span>Event</span>
        <span>Services</span>
        <span>Location</span>
        <span>Status</span>
        <span>Next follow-up</span>
        <span>Source</span>
        <span className="text-right">Actions</span>
      </div>

      <ul className="divide-y divide-border">
        {leads.map((lead) => {
          const services = lead.inquiry?.services ?? [];
          return (
            <li key={lead.id}>
              {/* Desktop row */}
              <div className="hidden grid-cols-[1.3fr_1fr_1fr_0.9fr_0.9fr_1fr_0.8fr_auto] items-center gap-3 px-4 py-3 transition hover:bg-secondary/20 lg:grid">
                <div className="min-w-0">
                  <p className="truncate font-medium">{lead.name ?? "Enquiry"}</p>
                  <p className="truncate text-xs text-muted-foreground">{lead.phone ?? "—"}</p>
                </div>
                <div className="text-sm">
                  <p>{formatShortDate(lead.inquiry?.event_date ?? null)}</p>
                  {lead.inquiry?.num_persons && (
                    <p className="text-xs text-muted-foreground">
                      {lead.inquiry.num_persons} persons
                    </p>
                  )}
                  <EventBadge eventDate={lead.inquiry?.event_date ?? null} />
                </div>
                <div className="min-w-0 text-sm">
                  {services.length > 0 ? (
                    <p className="truncate">{services.slice(0, 2).join(" · ")}</p>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {services.length > 2 && (
                    <p className="text-xs text-muted-foreground">+{services.length - 2} more</p>
                  )}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {locationTypeLabel(lead.inquiry?.location_type ?? null)}
                </div>
                <div>
                  <Badge
                    variant="outline"
                    className={cn("text-xs", STATUS_META[lead.status].className)}
                  >
                    {STATUS_META[lead.status].label}
                  </Badge>
                </div>
                <div>
                  <FollowupIndicator nextFollowupAt={lead.next_followup_at} />
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {sourceLabel(lead.source)}
                </div>
                <div className="flex justify-end">
                  <QuickActions lead={lead} onOpen={() => onOpen(lead.id)} compact />
                </div>
              </div>

              {/* Mobile stacked row */}
              <div className="p-4 lg:hidden">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{lead.name ?? "Enquiry"}</p>
                    <p className="text-sm text-muted-foreground">{lead.phone ?? "—"}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-xs", STATUS_META[lead.status].className)}
                  >
                    {STATUS_META[lead.status].label}
                  </Badge>
                </div>
                {services.length > 0 && (
                  <p className="mt-1.5 truncate text-sm">{services.join(" · ")}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatShortDate(lead.inquiry?.event_date ?? null)}</span>
                  <EventBadge eventDate={lead.inquiry?.event_date ?? null} />
                  {lead.inquiry?.num_persons && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" aria-hidden="true" />
                      {lead.inquiry.num_persons}
                    </span>
                  )}
                  <span>{locationTypeLabel(lead.inquiry?.location_type ?? null)}</span>
                  <span>{sourceLabel(lead.source)}</span>
                </div>
                <div className="mt-2">
                  <FollowupIndicator nextFollowupAt={lead.next_followup_at} />
                </div>
                <div className="mt-3">
                  <QuickActions lead={lead} onOpen={() => onOpen(lead.id)} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- card view ----------

export function LeadCardView({
  leads,
  onOpen,
}: {
  leads: LeadWithInquiry[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {leads.map((lead) => {
        const services = lead.inquiry?.services ?? [];
        return (
          <li key={lead.id} className="rounded-xl border border-border bg-card p-3.5 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{lead.name ?? "Enquiry"}</p>
                <p className="truncate text-xs text-muted-foreground">{lead.phone ?? "—"}</p>
              </div>
              <Badge
                variant="outline"
                className={cn("shrink-0 text-xs", STATUS_META[lead.status].className)}
              >
                {STATUS_META[lead.status].label}
              </Badge>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">{sourceLabel(lead.source)}</p>

            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
              <span>
                {formatShortDate(lead.inquiry?.event_date ?? null)}
                {lead.inquiry?.event_type ? ` · ${lead.inquiry.event_type}` : ""}
                {lead.inquiry?.num_persons ? ` · ${lead.inquiry.num_persons} persons` : ""}
              </span>
              <EventBadge eventDate={lead.inquiry?.event_date ?? null} />
            </p>

            {services.length > 0 && (
              <p className="mt-1 truncate text-sm text-muted-foreground">{services.join(" · ")}</p>
            )}

            {lead.inquiry?.location_type && (
              <p className="mt-1 text-xs text-muted-foreground">
                {locationTypeLabel(lead.inquiry.location_type)}
              </p>
            )}

            <div className="mt-2.5">
              <FollowupIndicator nextFollowupAt={lead.next_followup_at} />
            </div>

            <div className="mt-3">
              <QuickActions lead={lead} onOpen={() => onOpen(lead.id)} compact />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- pipeline strip (compact secondary metrics) ----------

/** Small pill-style row for pipeline-stage counts — deliberately much lower
 * visual weight than the Today action bar, per the "not a colorful analytics
 * dashboard" instruction: text + count, no large numerals. */
export function PipelineStrip({
  statuses,
  activeStatus,
  onToggle,
}: {
  statuses: { status: string; label: string; value: number }[];
  activeStatus: string | null;
  onToggle: (status: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {statuses.map((s) => (
        <button
          key={s.status}
          type="button"
          onClick={() => onToggle(s.status)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
            activeStatus === s.status
              ? "border-primary bg-primary/10 text-primary"
              : s.value === 0
                ? "border-border/60 bg-card text-muted-foreground/60 hover:border-primary/40"
                : "border-border bg-card text-muted-foreground hover:border-primary/40",
          )}
        >
          {s.label}
          <span
            className={cn(
              "font-semibold",
              s.value === 0 ? "text-muted-foreground/60" : "text-foreground",
            )}
          >
            {s.value}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- daily command center ----------

type PriorityCategory =
  | "overdue"
  | "today"
  | "event_today"
  | "contact_overdue"
  | "needs_contact"
  | "new"
  | "event_tomorrow";

// Semantic hierarchy, restrained per the brief: Critical (overdue / contact
// overdue) uses the destructive tone; Attention (due today / needs contact)
// uses amber; Informational (fresh new lead / event tomorrow) uses the
// existing primary/violet tones — never relying on color alone since every
// row also carries a text label and supporting detail.
const CATEGORY_META: Record<PriorityCategory, { label: string; className: string }> = {
  overdue: {
    label: "Overdue Follow-up",
    className: "border-destructive/30 bg-destructive/5 text-destructive",
  },
  today: { label: "Follow-up Today", className: "border-amber-200 bg-amber-50 text-amber-700" },
  event_today: {
    label: "Event Today",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  contact_overdue: {
    label: "Contact Overdue",
    className: "border-destructive/30 bg-destructive/5 text-destructive",
  },
  needs_contact: {
    label: "Needs Contact",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  new: { label: "New Lead", className: "border-primary/30 bg-primary/5 text-primary" },
  event_tomorrow: {
    label: "Event Tomorrow",
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
};

function priorityCategory(tier: number): PriorityCategory | null {
  switch (tier) {
    case 1:
      return "overdue";
    case 2:
      return "today";
    case 3:
      return "event_today";
    case 4:
      return "contact_overdue";
    case 5:
      return "needs_contact";
    case 6:
      return "new";
    case 7:
      return "event_tomorrow";
    default:
      return null;
  }
}

function priorityDetail(category: PriorityCategory, lead: LeadWithInquiry): string {
  const services = lead.inquiry?.services ?? [];
  const primaryService = services[0] ?? null;
  switch (category) {
    case "overdue":
    case "today": {
      const urgency = followupUrgency(lead.next_followup_at);
      return [urgency?.label, lead.next_followup_reason].filter(Boolean).join(" — ");
    }
    case "event_today":
    case "event_tomorrow":
      return [primaryService, lead.inquiry?.venue_area].filter(Boolean).join(" · ");
    case "contact_overdue":
    case "needs_contact":
    case "new": {
      const stale = staleLeadUrgency(lead.created_at);
      return [stale.waitingLabel, primaryService].filter(Boolean).join(" · ");
    }
    default:
      return "";
  }
}

/** A lead can qualify for more than one condition (e.g. overdue follow-up
 * AND an event tomorrow) — it's rendered once under its highest-priority
 * category, with any secondary condition surfaced as a small note rather
 * than a second row. */
function secondaryNote(category: PriorityCategory, lead: LeadWithInquiry): string | null {
  if (category === "event_tomorrow" || category === "event_today") return null;
  if (isEventTomorrow(lead.inquiry?.event_date ?? null)) return "Event tomorrow";
  return null;
}

/** Quick actions differ by why a lead is showing up — a fresh enquiry only
 * needs Open, a follow-up can be completed inline, and Overdue additionally
 * offers Reschedule instead of a plain Open. */
function priorityActions(category: PriorityCategory): "new" | "followup" | "overdue" {
  if (category === "overdue") return "overdue";
  if (category === "today") return "followup";
  return "new";
}

function ContactActions({
  lead,
  actionSet,
  onOpen,
  onOpenToComplete,
  onOpenToReschedule,
}: {
  lead: LeadWithInquiry;
  actionSet: "new" | "followup" | "overdue";
  onOpen: (id: string) => void;
  onOpenToComplete: (id: string) => void;
  onOpenToReschedule: (id: string) => void;
}) {
  const call = telLink(lead.phone);
  const whatsapp = waLink(lead.phone, lead.name);
  return (
    <div className="flex shrink-0 gap-1.5">
      <Button variant="softline" size="sm" disabled={!call} asChild={!!call} aria-label="Call">
        {call ? (
          <a href={call}>
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : (
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </Button>
      <Button
        variant="softline"
        size="sm"
        disabled={!whatsapp}
        asChild={!!whatsapp}
        aria-label="WhatsApp"
      >
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noreferrer">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : (
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </Button>
      {(actionSet === "followup" || actionSet === "overdue") && (
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenToComplete(lead.id)}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Complete
        </Button>
      )}
      {actionSet === "overdue" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenToReschedule(lead.id)}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reschedule
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => onOpen(lead.id)}>
          Open
        </Button>
      )}
    </div>
  );
}

/**
 * The daily command center: "Today's Priorities" (only genuinely
 * actionable-today items, ordered by attentionPriority) followed by a
 * separate, visually lighter "Upcoming Events" section (tomorrow through 7
 * days out). A lead already shown in Today's Priorities never repeats in
 * Upcoming Events.
 */
export function LeadDailyCommandCenter({
  leads,
  onOpen,
  onOpenToComplete,
  onOpenToReschedule,
}: {
  leads: LeadWithInquiry[];
  onOpen: (id: string) => void;
  onOpenToComplete: (id: string) => void;
  onOpenToReschedule: (id: string) => void;
}) {
  const allPriorities = getTodayPriorities(leads);
  const priorityLeads = allPriorities.slice(0, 8);

  const shownIds = new Set(allPriorities.map((x) => x.lead.id));

  const upcoming = leads
    .filter((l) => !shownIds.has(l.id) && isUpcomingEvent(l.inquiry?.event_date ?? null))
    .sort(
      (a, b) =>
        new Date(a.inquiry?.event_date ?? 0).getTime() -
        new Date(b.inquiry?.event_date ?? 0).getTime(),
    );

  const upcomingGroups = new Map<string, LeadWithInquiry[]>();
  for (const lead of upcoming) {
    const label = relativeDayLabel(
      lead.inquiry?.event_date as string,
      formatShortDate(lead.inquiry?.event_date ?? null),
    );
    upcomingGroups.set(label, [...(upcomingGroups.get(label) ?? []), lead]);
  }

  if (priorityLeads.length === 0 && upcoming.length === 0) return null;

  return (
    <div className="mt-5 space-y-4">
      {priorityLeads.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-sm font-medium">You&apos;re caught up for today.</p>
          {upcoming.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {upcoming.length} event{upcoming.length === 1 ? "" : "s"} coming up this week.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Today&apos;s Priorities
          </p>
          <ul className="mt-3 space-y-2">
            {priorityLeads.map(({ lead, tier }) => {
              const category = priorityCategory(tier);
              if (!category) return null;
              const detail = priorityDetail(category, lead);
              const secondary = secondaryNote(category, lead);
              return (
                <li
                  key={lead.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", CATEGORY_META[category].className)}
                      >
                        {CATEGORY_META[category].label}
                      </Badge>
                      <span className="truncate text-sm font-medium">{lead.name ?? "Enquiry"}</span>
                    </div>
                    {detail && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {detail}
                        {secondary && ` · ${secondary}`}
                      </p>
                    )}
                  </div>
                  <ContactActions
                    lead={lead}
                    actionSet={priorityActions(category)}
                    onOpen={onOpen}
                    onOpenToComplete={onOpenToComplete}
                    onOpenToReschedule={onOpenToReschedule}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Upcoming Events
          </p>
          <div className="mt-3 space-y-3">
            {Array.from(upcomingGroups.entries()).map(([label, groupLeads]) => (
              <div key={label}>
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {label}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {groupLeads.map((lead) => (
                    <li
                      key={lead.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background p-2"
                    >
                      <div className="min-w-0 text-sm">
                        <span className="font-medium">{lead.name ?? "Enquiry"}</span>
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {[lead.inquiry?.services[0], lead.inquiry?.venue_area]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpen(lead.id)}
                      >
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- pipeline (kanban) view ----------

export function LeadPipelineView({
  leads,
  onOpen,
}: {
  leads: LeadWithInquiry[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mt-4 -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex gap-3" style={{ minWidth: "max-content" }}>
        {STATUS_ORDER.map((status) => {
          const columnLeads = leads.filter((l) => l.status === status);
          return (
            <div
              key={status}
              className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-secondary/10"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {STATUS_META[status].label}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {columnLeads.length}
                </Badge>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {columnLeads.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-muted-foreground">No leads</p>
                ) : (
                  columnLeads.map((lead) => {
                    const services = lead.inquiry?.services ?? [];
                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => onOpen(lead.id)}
                        className="w-full rounded-lg border border-border bg-card p-2.5 text-left text-sm shadow-soft transition hover:border-primary/40"
                      >
                        <p className="truncate font-medium">{lead.name ?? "Enquiry"}</p>
                        {services.length > 0 && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {services.slice(0, 2).join(" · ")}
                          </p>
                        )}
                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          <span>
                            {formatShortDate(lead.inquiry?.event_date ?? null)}
                            {lead.inquiry?.num_persons
                              ? ` · ${lead.inquiry.num_persons} persons`
                              : ""}
                          </span>
                          <EventBadge eventDate={lead.inquiry?.event_date ?? null} />
                        </p>
                        <div className="mt-1.5">
                          <FollowupIndicator nextFollowupAt={lead.next_followup_at} />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
