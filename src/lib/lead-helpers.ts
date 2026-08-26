// Shared display helpers for the Leads CRM UI — pure functions only, safe to
// import from both the route file and the leads/* components. Every "today"
// / "overdue" / "upcoming" comparison here runs against `new Date()`, i.e.
// the viewer's browser-local clock and timezone — the same strategy already
// used throughout this module (see followupUrgency). There is no per-user
// timezone setting stored anywhere in BeautyFolio yet, so this is the
// consistent, honest default rather than a guessed/hard-coded timezone.
// Documented in docs/BEAUTYFOLIO-PHASE3E-CRM-ACTION-CENTER.md.

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatShortDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** Compact "30 minutes ago" / "2 hours ago" / "3 days ago" — used only for
 * the Action Center's "new enquiry received…" line. */
export function formatRelativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function telLink(phone: string | null): string | null {
  if (!phone) return null;
  return `tel:${phone.replace(/\s/g, "")}`;
}

export function waLink(phone: string | null, name: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  const text = encodeURIComponent(`Hi ${name ?? "there"}, following up on your enquiry.`);
  return `https://wa.me/${digits.replace(/^\+/, "")}?text=${text}`;
}

export function mailLink(email: string | null): string | null {
  if (!email) return null;
  return `mailto:${email}`;
}

export type FollowupUrgency = {
  kind: "overdue" | "today" | "upcoming";
  label: string;
  compactLabel: string;
};

/** Attention state for a lead's next follow-up — drives the visual priority
 * called for across the list/card/pipeline views and the detail workspace.
 * Overdue is reported in hours when under a day old, then in whole days —
 * "Overdue by 3 hours" vs "Overdue by 1 day" — so severity isn't conveyed by
 * color alone. */
export function followupUrgency(nextFollowupAt: string | null): FollowupUrgency | null {
  if (!nextFollowupAt) return null;
  const target = new Date(nextFollowupAt);
  const now = new Date();
  const diffDays = Math.round(
    (startOfDay(target).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000),
  );
  const time = target.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dateLabel = target.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  if (target.getTime() < now.getTime()) {
    const overdueMs = now.getTime() - target.getTime();
    const overdueHours = Math.floor(overdueMs / (60 * 60 * 1000));
    const overdueLabel =
      overdueHours < 24
        ? `Overdue by ${Math.max(1, overdueHours)} hour${overdueHours === 1 ? "" : "s"}`
        : `Overdue by ${Math.floor(overdueHours / 24)} day${Math.floor(overdueHours / 24) === 1 ? "" : "s"}`;
    return { kind: "overdue", label: overdueLabel, compactLabel: overdueLabel };
  }
  if (diffDays === 0) {
    return { kind: "today", label: `Today · ${time}`, compactLabel: `Today · ${time}` };
  }
  return {
    kind: "upcoming",
    label: `${dateLabel} · ${time}`,
    compactLabel: `${dateLabel} · ${time}`,
  };
}

export const URGENCY_TEXT_CLASS: Record<FollowupUrgency["kind"], string> = {
  overdue: "text-destructive font-medium",
  today: "text-amber-600 font-medium",
  upcoming: "text-foreground",
};

export const URGENCY_DOT_CLASS: Record<FollowupUrgency["kind"], string> = {
  overdue: "bg-destructive",
  today: "bg-amber-500",
  upcoming: "bg-primary/50",
};

/** True when a follow-up is scheduled strictly after today and within the
 * next 7 days — excludes both overdue and today's follow-ups. */
export function isUpcomingFollowup(nextFollowupAt: string | null): boolean {
  const urgency = followupUrgency(nextFollowupAt);
  if (!urgency || urgency.kind !== "upcoming") return false;
  const target = startOfDay(new Date(nextFollowupAt as string));
  const now = startOfDay(new Date());
  const diffDays = Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= 1 && diffDays <= 7;
}

/** "Today's Leads" — created_at falls on the viewer's current local
 * calendar date. Never event date, never follow-up date, never status. */
export function isCreatedToday(createdAt: string): boolean {
  return isSameLocalDay(new Date(createdAt), new Date());
}

export type EventApproaching = { daysAway: number; label: string };

/** Event-approaching attention label — event is today or within the next 7
 * days. Returns null for a past event or one further out. Display only:
 * never changes lead status, never scores the lead. */
export function eventApproaching(eventDate: string | null): EventApproaching | null {
  if (!eventDate) return null;
  const target = startOfDay(new Date(eventDate));
  const now = startOfDay(new Date());
  const diffDays = Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0 || diffDays > 7) return null;
  if (diffDays === 0) return { daysAway: 0, label: "Event today" };
  if (diffDays === 1) return { daysAway: 1, label: "Event tomorrow" };
  return { daysAway: diffDays, label: `Event in ${diffDays} days` };
}

/** Short, human-friendly label for any date "days away" — Today / Tomorrow /
 * In N days / a short formatted date once it's far enough out that relative
 * phrasing stops being useful (matches the Upcoming Events section's rule). */
export function relativeDayLabel(dateStr: string, formattedFallback: string): string {
  const target = startOfDay(new Date(dateStr));
  const now = startOfDay(new Date());
  const diffDays = Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  return formattedFallback;
}

/** "Events Today" — event_date falls on the viewer's current local calendar
 * date (distinct from a follow-up date or created_at). */
export function isEventToday(eventDate: string | null): boolean {
  return eventApproaching(eventDate)?.daysAway === 0;
}

/** Event is tomorrow — its own attention tier, one step below "today". */
export function isEventTomorrow(eventDate: string | null): boolean {
  return eventApproaching(eventDate)?.daysAway === 1;
}

/** Events from tomorrow through 7 days out — the Upcoming Events section's
 * population, deliberately excluding today's events (those are an
 * action-required item, not a "coming up" one). */
export function isUpcomingEvent(eventDate: string | null): boolean {
  const a = eventApproaching(eventDate);
  return !!a && a.daysAway >= 1;
}

/** "New, not contacted" — status is still "new" and the lead has never been
 * marked as contacted (last_contacted_at is null). More operationally
 * meaningful than status = New alone, since a "new" lead the beautician
 * already called is not actually waiting on them. */
export function isNewNotContacted(status: string, lastContactedAt: string | null): boolean {
  return status === "new" && !lastContactedAt;
}

export type StaleLeadKind = "new" | "needs_contact" | "contact_overdue";
export type StaleLeadUrgency = {
  kind: StaleLeadKind;
  label: string;
  /** "Received 4 hours ago" (fresh) or "Waiting 1 day" (stale) */
  waitingLabel: string;
};

/**
 * A lead sitting in status = New should become more visible the longer it
 * goes untouched — this is purely an operational urgency LABEL, never
 * written to the database and never a new status. The underlying
 * `status` column always stays "new"; only the presentation changes.
 */
export function staleLeadUrgency(createdAt: string): StaleLeadUrgency {
  const hours = (Date.now() - new Date(createdAt).getTime()) / (60 * 60 * 1000);
  if (hours > 48) {
    const days = Math.max(1, Math.round(hours / 24));
    return {
      kind: "contact_overdue",
      label: "Contact Overdue",
      waitingLabel: `Waiting ${days} day${days === 1 ? "" : "s"}`,
    };
  }
  if (hours > 24) {
    const days = Math.max(1, Math.round(hours / 24));
    return {
      kind: "needs_contact",
      label: "Needs Contact",
      waitingLabel: `Waiting ${days} day${days === 1 ? "" : "s"}`,
    };
  }
  return {
    kind: "new",
    label: "New Lead",
    waitingLabel: `Received ${formatRelativeTime(createdAt)}`,
  };
}

/**
 * Deterministic attention priority for Today's Priorities — lower number
 * sorts first. Only genuinely actionable-today items get a real tier;
 * everything else (event in 3+ days, a merely-upcoming follow-up) belongs
 * in the separate Upcoming Events section instead, not here. This is ONLY
 * used to order/group the UI; it is never written back to the database and
 * is not a lead score.
 *
 * Tiers (1 = highest):
 *  1 Overdue follow-up
 *  2 Follow-up due today
 *  3 Event today
 *  4 New lead, uncontacted > 48h ("Contact Overdue")
 *  5 New lead, uncontacted > 24h ("Needs Contact")
 *  6 New lead, uncontacted, received today ("New Lead")
 *  7 Event tomorrow
 */
export function attentionPriority(input: {
  status: string;
  createdAt: string;
  nextFollowupAt: string | null;
  lastContactedAt: string | null;
  eventDate: string | null;
}): number {
  const followup = followupUrgency(input.nextFollowupAt);
  if (followup?.kind === "overdue") return 1;
  if (followup?.kind === "today") return 2;
  if (isEventToday(input.eventDate)) return 3;
  if (isNewNotContacted(input.status, input.lastContactedAt)) {
    const stale = staleLeadUrgency(input.createdAt);
    if (stale.kind === "contact_overdue") return 4;
    if (stale.kind === "needs_contact") return 5;
    return 6;
  }
  if (isEventTomorrow(input.eventDate)) return 7;
  return 99;
}

/** Ascending sort key used to order leads WITHIN the same priority tier —
 * "oldest unresolved item first" for follow-ups/stale leads, "earliest
 * event first" for event tiers. */
function tierSortKey(
  tier: number,
  lead: {
    next_followup_at: string | null;
    created_at: string;
    inquiry?: { event_date: string | null } | null;
  },
): number {
  switch (tier) {
    case 1: // overdue — most overdue (oldest due date) first
    case 2: // due today — earliest time first
      return new Date(lead.next_followup_at ?? 0).getTime();
    case 3: // event today — stable by event date
    case 7: // event tomorrow — stable by event date
      return new Date(lead.inquiry?.event_date ?? 0).getTime();
    case 4: // stale new leads — longest-waiting (oldest created_at) first
    case 5:
    case 6:
      return new Date(lead.created_at).getTime();
    default:
      return 0;
  }
}

export interface PriorityLead<T> {
  lead: T;
  tier: number;
}

/**
 * Single source of truth for "what belongs in Today's Priorities, and in
 * what order" — computed once and shared by both the daily-summary line and
 * the Today's Priorities list itself, so the two can never contradict each
 * other (e.g. summary saying "caught up" while the list still shows a stale
 * lead). Returns the FULL matching set, uncapped — callers slice for
 * display as needed.
 */
export function getTodayPriorities<
  T extends {
    status: string;
    created_at: string;
    next_followup_at: string | null;
    last_contacted_at: string | null;
    inquiry?: { event_date: string | null } | null;
  },
>(leads: T[]): PriorityLead<T>[] {
  return leads
    .map((lead) => ({
      lead,
      tier: attentionPriority({
        status: lead.status,
        createdAt: lead.created_at,
        nextFollowupAt: lead.next_followup_at,
        lastContactedAt: lead.last_contacted_at,
        eventDate: lead.inquiry?.event_date ?? null,
      }),
    }))
    .filter((x) => x.tier < 99)
    .sort((a, b) => a.tier - b.tier || tierSortKey(a.tier, a.lead) - tierSortKey(b.tier, b.lead));
}
