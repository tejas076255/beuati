import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Mail, MessageCircle, Phone, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  STATUS_ORDER,
  STATUS_META,
  CLOSED_STATUSES,
  FOLLOWUP_TYPES,
  COMPLETION_OUTCOMES,
  followupTypeLabel,
  activityTypeLabel,
  sourceLabel,
  locationTypeLabel,
  type LeadStatus,
} from "@/lib/lead-config";
import {
  formatDate,
  formatDateTime,
  telLink,
  waLink,
  mailLink,
  followupUrgency,
  URGENCY_TEXT_CLASS,
} from "@/lib/lead-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LeadActivity, LeadInquiry, LeadWithInquiry } from "@/data/leads-query.server";
import type { DrilldownMatch } from "@/data/lead-insights.server";

export interface FollowupSubmission {
  type: string;
  date: string;
  time: string;
  note: string;
  outcome: string;
  nextDate: string;
  nextTime: string;
  nextReason: string;
}

/** Quick one-click Call/WhatsApp/Email row, used both in the header and
 * inline in the Follow-up section so acting on a follow-up (or sending an
 * appointment reminder) never requires scrolling back up. */
function QuickCommunicateRow({
  call,
  whatsapp,
  email,
}: {
  call: string | null;
  whatsapp: string | null;
  email: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button variant="softline" size="sm" disabled={!call} asChild={!!call}>
        {call ? (
          <a href={call}>
            <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
          </a>
        ) : (
          <>
            <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
          </>
        )}
      </Button>
      <Button variant="softline" size="sm" disabled={!whatsapp} asChild={!!whatsapp}>
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noreferrer">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
          </a>
        ) : (
          <>
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
          </>
        )}
      </Button>
      <Button variant="softline" size="sm" disabled={!email} asChild={!!email}>
        {email ? (
          <a href={email}>
            <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email
          </a>
        ) : (
          <>
            <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email
          </>
        )}
      </Button>
    </div>
  );
}

/**
 * Logs a follow-up. The creation timestamp (occurred_at) is always "now" —
 * not a field the user edits — since letting it be edited was what caused
 * people to fill in "today's date" there and leave the actual next-follow-up
 * date blank, producing a lead that looked like it had no scheduled
 * follow-up even though one had just been logged. "Follow-up date" below is
 * the one date field in this form, and it's what actually drives
 * next_followup_at.
 */
function LogFollowupForm({
  quickActions,
  onSubmit,
  onCancel,
  submitting,
}: {
  quickActions: { call: string | null; whatsapp: string | null; email: string | null };
  onSubmit: (v: FollowupSubmission) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [type, setType] = useState(FOLLOWUP_TYPES[0]?.value ?? "call");
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [nextReason, setNextReason] = useState("");
  const now = useMemo(
    () =>
      new Date().toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    [],
  );
  const canSubmit = nextDate.trim().length > 0;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3">
      <p className="text-xs text-muted-foreground">Logging this follow-up now — {now}.</p>

      <QuickCommunicateRow {...quickActions} />

      <div>
        <label className="text-xs text-muted-foreground">Next follow-up action</label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOLLOWUP_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Follow-up note</label>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened, why, and what's the next action?"
        />
      </div>
      <div className="rounded-lg border border-dashed border-border p-2.5">
        <p className="text-xs font-medium">Follow-up date *</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            className="h-9"
          />
          <Input
            type="time"
            value={nextTime}
            onChange={(e) => setNextTime(e.target.value)}
            className="h-9"
          />
        </div>
        <Input
          value={nextReason}
          onChange={(e) => setNextReason(e.target.value)}
          placeholder="Short reason (shown on lead cards)"
          className="mt-2 h-9"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="hero"
          disabled={submitting || !canSubmit}
          onClick={() =>
            onSubmit({
              type,
              date: new Date().toISOString().slice(0, 10),
              time: new Date().toTimeString().slice(0, 5),
              note,
              outcome: "",
              nextDate,
              nextTime,
              nextReason,
            })
          }
        >
          {submitting ? "Saving…" : "Save follow-up"}
        </Button>
      </div>
    </div>
  );
}

export interface CompletionSubmission {
  outcome: string;
  note: string;
  scheduleAnother: boolean;
  nextDate: string;
  nextTime: string;
  nextReason: string;
}

/** Focused "Complete Follow-up" interaction — deliberately smaller than
 * LogFollowupForm above: just the outcome, a completion note, and an
 * optional next follow-up, instead of re-asking for date/time/type of an
 * interaction that (by definition) already happened. */
function CompleteFollowupForm({
  leadName,
  quickActions,
  onSubmit,
  onCancel,
  submitting,
}: {
  leadName: string;
  quickActions: { call: string | null; whatsapp: string | null; email: string | null };
  onSubmit: (v: CompletionSubmission) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [scheduleAnother, setScheduleAnother] = useState(false);
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [nextReason, setNextReason] = useState("");

  const canSubmit = outcome.trim().length > 0 && (!scheduleAnother || nextDate.trim().length > 0);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3">
      <p className="text-sm font-medium">Complete Follow-up</p>
      <div>
        <label className="text-xs text-muted-foreground">Customer</label>
        <p className="text-sm">{leadName}</p>
      </div>
      <QuickCommunicateRow {...quickActions} />
      <div>
        <label className="text-xs text-muted-foreground">Follow-up outcome *</label>
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Select outcome" />
          </SelectTrigger>
          <SelectContent>
            {COMPLETION_OUTCOMES.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Completion note</label>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened during this follow-up?"
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
        <label htmlFor="schedule-another" className="text-sm">
          Schedule another follow-up
        </label>
        <Switch
          id="schedule-another"
          checked={scheduleAnother}
          onCheckedChange={setScheduleAnother}
        />
      </div>
      {scheduleAnother && (
        <div className="rounded-lg border border-dashed border-border p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Next follow-up date *</label>
              <Input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Time (optional)</label>
              <Input
                type="time"
                value={nextTime}
                onChange={(e) => setNextTime(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <Input
            value={nextReason}
            onChange={(e) => setNextReason(e.target.value)}
            placeholder="Reason (e.g. confirm bridal package)"
            className="mt-2 h-9"
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="hero"
          disabled={submitting || !canSubmit}
          onClick={() =>
            onSubmit({ outcome, note, scheduleAnother, nextDate, nextTime, nextReason })
          }
        >
          {submitting ? "Saving…" : "Complete Follow-up"}
        </Button>
      </div>
    </div>
  );
}

function ActivityTimeline({
  leadId,
  fetchActivities,
}: {
  leadId: string;
  fetchActivities: (leadId: string) => Promise<LeadActivity[]>;
}) {
  const activitiesQuery = useQuery({
    queryKey: ["lead-activities", leadId],
    queryFn: () => fetchActivities(leadId),
  });
  const activities: LeadActivity[] = activitiesQuery.data ?? [];

  if (activitiesQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading timeline…</p>;
  }
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity logged yet.</p>;
  }

  return (
    <ol className="space-y-0">
      {activities.map((a, i) => (
        <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
            {i < activities.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                {formatDateTime(a.occurred_at)}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {a.activity_type === "follow_up" &&
                a.metadata &&
                typeof a.metadata === "object" &&
                "completed" in a.metadata
                  ? "Follow-up completed"
                  : a.activity_type === "follow_up" &&
                      a.metadata &&
                      typeof a.metadata === "object" &&
                      "followup_type" in a.metadata
                    ? followupTypeLabel(
                        String((a.metadata as { followup_type?: string }).followup_type),
                      )
                    : activityTypeLabel(a.activity_type)}
              </Badge>
            </div>
            {a.activity_type === "status_change" &&
              a.metadata &&
              typeof a.metadata === "object" &&
              "to" in a.metadata &&
              (() => {
                const meta = a.metadata as { from?: LeadStatus; to: LeadStatus };
                return (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Status changed
                    {meta.from ? ` from ${STATUS_META[meta.from]?.label ?? meta.from}` : ""} to{" "}
                    {STATUS_META[meta.to]?.label ?? String(meta.to)}.
                  </p>
                );
              })()}
            {a.body && <p className="mt-1 text-sm">{a.body}</p>}
            {a.outcome && (
              <p className="mt-1 text-xs text-muted-foreground">Outcome: {a.outcome}</p>
            )}
            {a.next_followup_at && (
              <p className="mt-1 text-xs text-primary">
                Next follow-up: {formatDateTime(a.next_followup_at)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// Phase 3G.3D §12 — an enquiry-level source of NULL means genuinely
// unrecorded (pre-3G.3A history), never "Manual Entry" — mirrors the exact
// "Unknown / historical" semantic already established for lead_inquiries.
// source in the Insights view (Phase 3G.3B/3G.3C), so the same NULL bucket
// never means two different things in two different parts of the app.
function enquirySourceLabel(source: string | null): string {
  return source == null ? "Unknown / historical" : sourceLabel(source);
}

function hasAttribution(inquiry: LeadInquiry): boolean {
  return !!(
    inquiry.utm_source ||
    inquiry.utm_medium ||
    inquiry.utm_campaign ||
    inquiry.landing_path ||
    inquiry.conversion_path ||
    inquiry.referrer_host ||
    inquiry.cta_location
  );
}

/**
 * One enquiry, independently identifiable (§4/§5). Collapsed by default
 * except the newest, which starts expanded — showing every enquiry fully
 * expanded at once would make a customer with several enquiries excessively
 * long (§5/§29).
 */
function EnquiryCard({ inquiry, isLatest }: { inquiry: LeadInquiry; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest);
  const services = inquiry.services;
  const panelId = `enquiry-${inquiry.id}`;

  return (
    <div className="rounded-xl border border-border bg-background">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-3.5 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {formatDate(inquiry.created_at)}
            </span>
            {isLatest && (
              <Badge variant="outline" className="border-primary/30 text-[10px] text-primary">
                Latest enquiry
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {services.length > 0 ? (
              services.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">
                  {s}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No service specified</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {inquiry.event_date ? `Event: ${formatDate(inquiry.event_date)} · ` : ""}
            Source: {enquirySourceLabel(inquiry.source)}
            {hasAttribution(inquiry) ? " · has attribution data" : ""}
          </p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div id={panelId} className="space-y-3 border-t border-border px-3.5 pb-3.5 pt-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Event type</p>
              <p className="mt-0.5">{inquiry.event_type ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Persons</p>
              <p className="mt-0.5">{inquiry.num_persons ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="mt-0.5">{locationTypeLabel(inquiry.location_type)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Venue / area</p>
              <p className="mt-0.5">{inquiry.venue_area ?? "—"}</p>
            </div>
            {inquiry.budget != null && (
              <div>
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="mt-0.5">₹{inquiry.budget}</p>
              </div>
            )}
          </div>

          {inquiry.requirement && (
            <div>
              <p className="text-xs text-muted-foreground">Customer message</p>
              <p className="mt-0.5 rounded-lg bg-secondary/30 p-2.5">{inquiry.requirement}</p>
            </div>
          )}

          {inquiry.special_requirements && (
            <div>
              <p className="text-xs text-muted-foreground">Special requirements</p>
              <p className="mt-0.5 rounded-lg bg-secondary/30 p-2.5">
                {inquiry.special_requirements}
              </p>
            </div>
          )}

          {/* §8 — only rendered when at least one field genuinely has a
              value; historical NULL attribution simply omits this
              subsection entirely rather than claiming "Direct". */}
          {hasAttribution(inquiry) && (
            <div>
              <p className="text-xs text-muted-foreground">Attribution</p>
              <div className="mt-0.5 space-y-0.5 rounded-lg bg-secondary/30 p-2.5 text-muted-foreground">
                {(inquiry.utm_source || inquiry.utm_medium) && (
                  <p>{[inquiry.utm_source, inquiry.utm_medium].filter(Boolean).join(" / ")}</p>
                )}
                {inquiry.utm_campaign && <p>Campaign: {inquiry.utm_campaign}</p>}
                {inquiry.landing_path && <p>Landing: {inquiry.landing_path}</p>}
                {inquiry.conversion_path && <p>Conversion page: {inquiry.conversion_path}</p>}
                {inquiry.referrer_host && <p>Referrer: {inquiry.referrer_host}</p>}
                {inquiry.cta_location && <p>CTA: {inquiry.cta_location}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnquiriesSection({ inquiries }: { inquiries: LeadInquiry[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Enquiries · {inquiries.length}
      </p>
      {inquiries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No enquiry history recorded.
        </p>
      ) : (
        <div className="space-y-2.5">
          {inquiries.map((inquiry, i) => (
            <EnquiryCard key={inquiry.id} inquiry={inquiry} isLatest={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LeadDetailDialog({
  lead,
  onClose,
  onEdit,
  onStatusChange,
  statusChangePending,
  onSaveNotes,
  savingNotes,
  onLogFollowup,
  loggingFollowup,
  onCompleteFollowup,
  completingFollowup,
  fetchActivities,
  autoOpenComplete,
  autoOpenFollowup,
  matchContext,
}: {
  lead: LeadWithInquiry;
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (status: LeadStatus) => void;
  statusChangePending: boolean;
  onSaveNotes: (notes: string) => void;
  savingNotes: boolean;
  onLogFollowup: (v: FollowupSubmission) => Promise<void>;
  loggingFollowup: boolean;
  onCompleteFollowup: (v: CompletionSubmission) => Promise<void>;
  completingFollowup: boolean;
  fetchActivities: (leadId: string) => Promise<LeadActivity[]>;
  /** Opens straight into the "Complete Follow-up" form — used by the Today's
   * Priorities Complete quick action so it's one click, not two. */
  autoOpenComplete?: boolean;
  /** Opens straight into "Add Follow-up" — used by the Overdue row's
   * Reschedule quick action. */
  autoOpenFollowup?: boolean;
  /** Phase 3G.3C §6 — present only when this lead was opened from an active
   * Insights drill-down result and genuinely matched it. Surfaces which
   * enquiry matched without restructuring this dialog into a full
   * multi-enquiry history view (deferred as a larger change). */
  matchContext?: DrilldownMatch | null;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [showFollowupForm, setShowFollowupForm] = useState(!!autoOpenFollowup);
  const [showCompleteForm, setShowCompleteForm] = useState(!!autoOpenComplete);
  const notesDirty = notes !== (lead.notes ?? "");
  const call = telLink(lead.phone);
  const whatsapp = waLink(lead.phone, lead.name);
  const email = mailLink(lead.email);
  const urgency = followupUrgency(lead.next_followup_at);

  const refreshAfterFollowup = () => {
    queryClient.invalidateQueries({ queryKey: ["lead-activities", lead.id] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const submitFollowup = async (v: FollowupSubmission) => {
    await onLogFollowup(v);
    setShowFollowupForm(false);
    refreshAfterFollowup();
  };

  const submitCompletion = async (v: CompletionSubmission) => {
    await onCompleteFollowup(v);
    setShowCompleteForm(false);
    refreshAfterFollowup();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="text-xl">{lead.name ?? "Enquiry"}</DialogTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">{lead.phone ?? "—"}</p>
              {/* Phase 3G.3D §3/§20 — compact, genuinely customer-level
                  identity facts only (never an enquiry-specific field like
                  event date or campaign masquerading as a permanent
                  customer attribute). "N enquiries" reinforces the correct
                  one-customer-many-enquiries model instead of "N leads". */}
              <p className="mt-1 text-xs text-muted-foreground">
                {lead.inquiries.length} {lead.inquiries.length === 1 ? "enquiry" : "enquiries"}
                {lead.email ? ` · ${lead.email}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <QuickCommunicateRow call={call} whatsapp={whatsapp} email={email} />
              <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Phase 3G.3C §6 — surfaces which enquiry(ies) matched the
              Insights drill-down that led here. Phase 3G.3D §18 — the
              enquiries section below shows every enquiry's own details, but
              per-card "Matches insight" tagging was deliberately not added:
              getInsightDrilldownMatches() (3G.3C) returns which CUSTOMER
              matched, not which specific inquiry ids did, so tagging
              individual cards would require guessing via a fragile
              timestamp/service heuristic. This banner remains the
              authoritative "why you're here" summary instead (§18's own
              documented fallback for excessive complexity). */}
          {matchContext && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Matched via Insights ·{" "}
              {matchContext.matchCount === 1
                ? "1 matching enquiry"
                : `${matchContext.matchCount} matching enquiries`}{" "}
              · most recent
              {matchContext.latestMatchedService ? `: ${matchContext.latestMatchedService}` : ""},
              received {formatDate(matchContext.latestMatchedAt)}
            </div>
          )}

          {/* Status + next follow-up strip */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/20 p-3">
            <Badge variant="outline" className={cn("text-sm", STATUS_META[lead.status].className)}>
              {STATUS_META[lead.status].label}
            </Badge>
            <span className="text-muted-foreground">·</span>
            <span className={cn("text-sm", urgency && URGENCY_TEXT_CLASS[urgency.kind])}>
              {lead.next_followup_at
                ? `Next follow-up: ${formatDateTime(lead.next_followup_at)}${lead.next_followup_reason ? ` — ${lead.next_followup_reason}` : ""}`
                : "No follow-up scheduled"}
            </span>
          </div>

          {/* Pipeline */}
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Pipeline
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {STATUS_ORDER.filter((s) => !CLOSED_STATUSES.includes(s) || s === lead.status).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={statusChangePending}
                    onClick={() => onStatusChange(s)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                      s === lead.status
                        ? STATUS_META[s].className
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {STATUS_META[s].label}
                  </button>
                ),
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["lost", "archived"] as LeadStatus[])
                .filter((s) => s !== lead.status)
                .map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={statusChangePending}
                    onClick={() => onStatusChange(s)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Mark {STATUS_META[s].label}
                  </button>
                ))}
            </div>
          </div>

          {/* Phase 3G.3D — Enquiries. Replaces the old single-inquiry
              "Customer & inquiry summary"/"Attribution" blocks, which only
              ever showed the LATEST enquiry and risked implying it was a
              permanent customer attribute. Every enquiry this customer has
              ever submitted is shown here, newest first, each with its own
              service(s)/event/attribution — never merged into one another. */}
          <EnquiriesSection inquiries={lead.inquiries} />

          {/* Follow-up */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Follow-up
              </p>
              <div className="flex gap-2">
                {lead.next_followup_at && !showFollowupForm && !showCompleteForm && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCompleteForm(true)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Mark completed
                  </Button>
                )}
                {!showFollowupForm && !showCompleteForm && (
                  <Button
                    type="button"
                    variant="softline"
                    size="sm"
                    onClick={() => setShowFollowupForm(true)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Follow-up
                  </Button>
                )}
              </div>
            </div>
            {showFollowupForm && (
              <LogFollowupForm
                quickActions={{ call, whatsapp, email }}
                onSubmit={submitFollowup}
                onCancel={() => setShowFollowupForm(false)}
                submitting={loggingFollowup}
              />
            )}
            {showCompleteForm && (
              <CompleteFollowupForm
                leadName={lead.name ?? "this lead"}
                quickActions={{ call, whatsapp, email }}
                onSubmit={submitCompletion}
                onCancel={() => setShowCompleteForm(false)}
                submitting={completingFollowup}
              />
            )}
          </div>

          {/* Activity timeline */}
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Activity timeline
            </p>
            <ActivityTimeline leadId={lead.id} fetchActivities={fetchActivities} />
          </div>

          {/* Internal notes */}
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Internal notes
            </p>
            <p className="mt-0.5 mb-1.5 text-xs text-muted-foreground">
              Only visible to you — never shown on your public portfolio.
            </p>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                variant="hero"
                disabled={!notesDirty || savingNotes}
                onClick={() => onSaveNotes(notes)}
              >
                {savingNotes ? "Saving…" : "Save notes"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
