# BeautyFolio — Phase 3E: CRM Attention & Action Center

## STATUS: COMPLETE

Adds "what needs me right now" to the Leads Mini-CRM: Today's Leads, Today's Follow-ups, Overdue, Upcoming, Event Approaching, New/Not-Contacted, and a compact "Needs your attention" digest. No redesign, no schema changes, no automation. Covers three sub-phases: 3E (foundation), 3E.1 (visual hierarchy refinement), 3E.2 (priority logic refinement + closure) — see bottom of this document for the full completed-capabilities list and closure sign-off.

## 1. Definitions

**Today's Leads** — `created_at` falls on the viewer's current local calendar date. Never event date, never follow-up date, never `status = new`.

**Today's Follow-ups** — `next_followup_at` falls on the viewer's current local calendar date (uses the existing `followupUrgency()` helper's `"today"` classification).

**Overdue** — `next_followup_at` is in the past relative to now. Only leads with a *currently scheduled* follow-up can be overdue — completing a follow-up (Phase 3D) clears `next_followup_at`, so completed/cleared follow-ups never appear here; there's no separate "still pending" flag to check because a cleared follow-up simply has no `next_followup_at` to compare.

**Upcoming** — `next_followup_at` is strictly after today and within the next 7 days (days 1–7 inclusive). Excludes both overdue and today's follow-ups.

**Event approaching** — `event_date` (via the lead's inquiry) is today or within the next 7 days. Labels: "Event today", "Event tomorrow", "Event in N days". A past event date is never labeled "approaching". Display-only — never changes `status`, never written anywhere.

**New, not contacted** — `status = 'new'` AND `last_contacted_at IS NULL`. More operationally useful than `status = New` alone, since a "new" lead the beautician already called isn't actually waiting on them.

**Overdue granularity** — "Overdue by 3 hours" when under 24h overdue, "Overdue by N days" beyond that — so severity isn't conveyed by color alone (existing accessibility rule, extended here).

## 2. Priority ordering (Action Center only)

Deterministic, not AI, not stored:

1. Overdue follow-up
2. Follow-up due today
3. Event today
4. Event within 3 days
5. New lead, not contacted
6. Upcoming follow-up
7. Event within 7 days

Implemented as `attentionPriority()` in `src/lib/lead-helpers.ts` — used only to decide what the Action Center shows and in what order. It is never written to the database and never used to alter `status`.

## 3. UI added

- **Today action bar** — 4 large (`StatCard size="lg"`) primary metrics: Today's Leads, Today's Follow-ups, Overdue, Upcoming. Visually larger than the secondary pipeline-status row and tertiary business-metrics row beneath it, per the requested visual hierarchy (Today/Overdue should be immediately noticed; not all 10+ cards carry equal weight).
- **Secondary pipeline row** — New, Contacted, Follow-up, Quoted, Confirmed, plus a "New, not contacted" card.
- **Business metrics row** — Completed, Lost, Total Leads.
- **Active filter chip(s)** — when a status and/or attention filter is active, a small removable chip row appears ("Active filter: Today's Follow-ups ×"), addressing the explicit instruction not to let quick filters silently combine into confusing empty results.
- **"Needs your attention" Action Center** (`LeadActionCenter` in `src/components/leads/lead-views.tsx`) — compact, deduplicated (a lead never appears twice across categories) digest of up to 3 leads each from Overdue, Today, New-not-contacted, and Event-soon (≤3 days), each row showing category badge, name, a one-line reason, and Call / WhatsApp / (Complete, for follow-up rows) / Open. This serves both the "Today View" (section 5) and "Action Center" (section 11) requests as one component — the spec explicitly allowed collapsing these if a combined view added unnecessary complexity.
- **Event badges** on List/Card/Pipeline rows — small "Event today" / "Event in N days" pill next to the event date wherever it's shown.
- **One-click "Complete" from the Action Center** opens the lead detail dialog with the "Complete Follow-up" form already expanded (`autoOpenComplete` prop on `LeadDetailDialog`), so acting on an overdue/today follow-up from the digest is genuinely one click plus the completion form, not two full navigations.

## 4. Filter integration

`Today's Leads`, `Today's Follow-ups`, `Overdue`, `Upcoming`, and `New, not contacted` are five values of one `attentionFilter` state (mutually exclusive — selecting one replaces any other, exactly like the Phase 3D fix for `statusFilter`). This is a distinct dimension from `statusFilter` (pipeline stage) and remains composable with it and with the secondary filters (Service/Source/Location/Event Type), matching the instruction that "Today's Leads + Service = Bridal Makeup" should work logically as an AND across *different* dimensions, while two values of the *same* dimension can never silently AND into zero results.

## 5. Timezone / date behavior

BeautyFolio has no per-user timezone setting stored anywhere yet. Every "today" / "overdue" / "upcoming" comparison in this phase (and inherited from Phase 3D's `followupUrgency`) runs against `new Date()` on the machine rendering the page — the viewer's browser-local clock for the dashboard UI. This is documented as the deliberate, consistent strategy per the instruction not to hard-code a specific timezone: all date math uses local calendar-day boundaries (`new Date(y, m, d)` per the viewer's local clock), not raw UTC slicing, so "today" means the viewer's actual calendar day rather than a UTC day that could be off by several hours depending on locale.

**Known limitation**: since this is browser-local, a beautician who views their dashboard from a different timezone than their business operates in would see "today" shift accordingly. There is no server-side or account-level timezone field to anchor this differently yet — introducing one would be a schema change, explicitly out of scope for this phase.

## 6. Files changed

- `src/lib/lead-helpers.ts` — added `isCreatedToday`, `isUpcomingFollowup`, `eventApproaching` (replaces the previously-unwired, now-removed `isEventApproaching` stub), `isNewNotContacted`, `attentionPriority`, `formatRelativeTime`, `formatTime`; upgraded `followupUrgency`'s overdue label to hour/day granularity.
- `src/components/leads/lead-views.tsx` — `StatCard` gained a `size` prop; new `EventBadge` and `LeadActionCenter` components; event badges wired into List/Card/Pipeline views.
- `src/components/leads/lead-detail-dialog.tsx` — `LeadDetailDialog` gained `autoOpenComplete`.
- `src/routes/dashboard.leads.tsx` — Today action bar, restructured summary hierarchy (primary/secondary/business), unified `attentionFilter` extended to 5 values, active-filter chips, Action Center wired in, `openInCompleteMode` state for the one-click Complete path.

## 7. Database changes

**None.** Every rule reads fields that already exist on the already-loaded `leads`/`lead_inquiries` data (`created_at`, `next_followup_at`, `next_followup_reason`, `last_contacted_at`, `status`, `event_date`). All counts and the Action Center are computed in a single client-side pass over the leads array already fetched for the page (`useMemo`), with no additional queries and no per-lead activity fetch — stays responsive at 1,000+ leads since it's O(n) over data already in memory.

## 8. Activity timeline

Unchanged. Appearing in Today's Leads, Today's Follow-ups, Overdue, Upcoming, or the Action Center never creates an activity entry — these are all read-only derived views. Only real actions (status change, follow-up logged/completed, lead edited, note saved) still create activity rows, per the Phase 3D behavior.

## 9. Tests performed

- `tsc --noEmit` — clean.
- ESLint — clean (Prettier-only auto-fixes applied).
- Production build — succeeds.
- Dev-server smoke test — 200 OK on Leads, Profile, Services, Packages, Availability, Service Areas, and the public portfolio route.

## 10. Test results

Build/type/lint verification passed. The functional tests (A–I) — creating a lead today vs. an older one, setting today vs. tomorrow follow-ups, overdue creation, follow-up completion clearing the attention list while preserving history, the 7-day upcoming window, event-approaching labels at 0/2/6/10 days and a past date, new/not-contacted before and after being contacted, filter composability, and mobile access — need your live click-through, since browser automation isn't available in this environment.

## 11. Known limitations

- Timezone strategy is browser-local only (see §5) — documented, not fixed, per instruction not to introduce timezone architecture this phase.
- The Action Center caps each category at 3 leads and de-duplicates across categories — a lead that's both overdue and has an approaching event only shows once, under Overdue (its highest-priority category), not twice.
- "Reschedule" as a distinct quick action (mentioned in the original CRM spec) is still not a separate button — Overdue/Today rows offer Call/WhatsApp/Complete/Open; rescheduling happens via "Add Follow-up" inside the detail workspace, consistent with the simplification already documented in Phase 3D.

## 12. Deferred (not started, per instruction)

Hot/Warm/Cold lead scoring, AI recommendations/summaries, WhatsApp API, SMS API, automated follow-up messages, automated reminders, calendar sync, lead assignment, revenue analytics, booking/payment pipeline, drag-and-drop Kanban.

---

# Phase 3E.1 — Daily Command Center UX Refinement

Phase 3E's functionality was confirmed working; this pass is a UI/UX-only refinement of the same feature set — fixing a flat visual hierarchy where 13 stat cards and a mixed-relevance attention list competed equally for attention. No business logic changed, no schema changed.

## 13. Today hierarchy (before → after)

**Before**: one row of 4 large "Today" cards (including *Upcoming*, a non-actionable metric) sitting at the same visual weight as 8 more pipeline/business stat cards directly beneath it, plus a separate "New, not contacted" card competing for the same attention.

**After**:
1. `Today · {formatted date}` label, then
2. exactly 4 large primary cards: **Today's Leads, Follow-ups Today, Overdue, Events Today** (Upcoming removed from this row — it's not an "act now" metric, see §14),
3. a one-line deterministic **attention summary** immediately below the 4 cards (§ below),
4. a visually light **`PipelineStrip`** — small pill-style status counts (New/Contacted/Follow-up/Quoted/Confirmed, then Completed/Lost on their own row) — replacing the old full-size `StatCard` grid for these,
5. `"{N} total leads"` as plain supporting text, not a card,
6. active-filter chips,
7. the **Today's Priorities** / **Upcoming Events** command center,
8. then the existing, unchanged Search/Filters/View-switcher/List-Cards-Pipeline workspace.

**Attention summary** — deterministic, joins only the non-zero parts:
`"{overdue} follow-up(s) overdue · {followupsToday} follow-up(s) due today · {eventsToday} event(s) today · {newTodayNotContacted} new lead(s) today"`, or `"You're caught up for today."` when every count is zero. No AI, computed the same way as the rest of this feature — a `useMemo` over already-loaded leads.

## 14. Today's Priority rules

Rebuilt to include **only genuinely actionable-today items** — "Event in 3 days" and a merely-upcoming follow-up were removed from this list entirely (they now live in Upcoming Events, §15). New priority order, implemented in `attentionPriority()` (`src/lib/lead-helpers.ts`):

1. Overdue follow-up
2. Follow-up due today
3. Event today
4. Event tomorrow *(new tier — previously events only appeared here at ≤3 days, with no distinction for "tomorrow" specifically)*
5. New lead **today**, not contacted
6. Older new lead, still not contacted

Each lead is assigned exactly one tier (its best/highest match) via `attentionPriority()`, filtered to tier < 99, sorted ascending, and capped at 8 total items (not per-category, since every remaining item here is a real action, not a "maybe interesting" one). Rendering derives the category badge (Overdue / Follow-up today / Event today / Event tomorrow / New lead) and a one-line detail from that same tier.

**Action buttons are now context-aware per category**, matching the brief exactly:
- New lead → Call · WhatsApp · Open
- Follow-up today → Call · WhatsApp · Complete · Open
- Overdue → Call · WhatsApp · Complete · **Reschedule** (opens the lead straight into "Add Follow-up" via a new `autoOpenFollowup` prop on `LeadDetailDialog` — previously Overdue and Today shared identical buttons with no Reschedule)
- Event today/tomorrow → Call · WhatsApp · Open

**Empty state**: when Today's Priorities has nothing, it collapses to a single compact card reading "You're caught up for today." plus, if any events are coming up this week, a supporting line — never a large empty container.

## 15. Upcoming Events rules

New, separate section, populated by `isUpcomingEvent()` — event is tomorrow through 7 days out (today's events are excluded here; they're already an action item in Today's Priorities). Grouped by `relativeDayLabel()`: "Tomorrow", "In N days" (2–7), falling back to a short formatted date beyond that window (defensive; the 7-day cap means this branch shouldn't normally trigger from this call site).

**De-duplication**: any lead already surfaced in Today's Priorities (e.g. an event-tomorrow lead promoted to tier 4) is excluded from Upcoming Events by id — a lead is never shown in both sections. Each row is deliberately lighter-weight than a priority row: name, service, venue, and a single Open action (no Call/WhatsApp/Complete) — visually distinguishing "action required today" from "coming up soon," per the brief.

## 16. Pipeline metric treatment

Converted from 7+ full `StatCard`s to `PipelineStrip` — small rounded pill buttons showing `label` + `count`, still clickable/toggle-able against the same unified `statusFilter`, still showing the active one highlighted, just visually much lighter than the Today row. "New, not contacted" no longer has a permanent large card; it's now a toggle chip inside the existing "More filters" panel (still updates `attentionFilter`) and otherwise only surfaces contextually inside Today's Priorities.

## 17. Files changed

- `src/lib/lead-helpers.ts` — added `isEventToday`, `isEventTomorrow`, `isUpcomingEvent`, `relativeDayLabel`; rewrote `attentionPriority()` for the new 6-tier rule set (drops the old "event within 3/7 days" and "upcoming follow-up" tiers).
- `src/components/leads/lead-views.tsx` — replaced `LeadActionCenter` with `LeadDailyCommandCenter` (Today's Priorities + Upcoming Events, shared dedup); added `PipelineStrip`; `ContactActions` helper for the context-aware button sets (adds Reschedule).
- `src/components/leads/lead-detail-dialog.tsx` — `LeadDetailDialog` gained `autoOpenFollowup` (mirrors the existing `autoOpenComplete`) for the Reschedule quick action.
- `src/routes/dashboard.leads.tsx` — restructured the summary region per §13, removed the Upcoming card/filter value (replaced by `events_today`), added the `TODAY · {date}` header and attention-summary line, wired `PipelineStrip`, added the "New, not contacted" toggle under More filters, added `openInFollowupMode` state for Reschedule.

## 18. Filter behavior

Unchanged discipline from Phase 3E: `attentionFilter` remains a single mutually-exclusive state (now `leads_today | followups_today | overdue | events_today | new_not_contacted`, `upcoming` removed since Upcoming is a browsable section, not a filter) — composable with `statusFilter` and the secondary Service/Source/Location filters, never two values of the same dimension ANDed together. Active-filter chips ("Active filter: Follow-ups Today ×") unchanged. Clear Filters resets both dimensions.

## 19. Database changes

**None.**

## 20. Tests performed

- `tsc --noEmit` — clean.
- ESLint — clean (Prettier-only auto-fixes applied).
- Production build — succeeds.
- Dev-server smoke test — 200 OK on Leads, Profile, Services, Packages, Availability, Service Areas, and the public portfolio route.

## 21. Known limitations

- Same browser-local timezone strategy as Phase 3E (§5) — unchanged, still documented rather than fixed.
- Today's Priorities caps at 8 total items across all tiers; a very high-volume day (e.g. 15 overdue follow-ups) will only surface the 8 highest-priority ones inline — the full set remains reachable via the Overdue quick filter.
- The "prepare UI for a future daily schedule" instruction (§11 of the original brief) was treated as a structural note rather than new UI: Today's Priorities is already an ordered, one-item-per-row list that a future time-of-day column could extend without restructuring, but no timeline/schedule visualization was built, and no new database architecture was added for it, per instruction.

---

# Phase 3E.2 — Priority Logic Refinement + Phase 3E Closure

Manual review approved the Phase 3E.1 UI/UX direction. This pass fixes a real logic bug (the daily summary could contradict the priorities list) and sharpens stale-lead visibility, then formally closes Phase 3E. No visual redesign, no schema change.

## 22. Bug fixed: "caught up" contradicting Today's Priorities

**Root cause**: the daily summary line and `LeadDailyCommandCenter` each independently recomputed "what's actionable," using different criteria — the summary only counted *today's* new leads (`newTodayNotContacted`), while the priorities list already included *older* uncontacted New leads and an "event tomorrow" tier the summary never counted at all. A lead created yesterday and still uncontacted could show up in Today's Priorities while the summary above it said "You're caught up for today."

**Fix**: introduced one shared function, `getTodayPriorities(leads)` (`src/lib/lead-helpers.ts`), that both `dashboard.leads.tsx` (for the summary line) and `LeadDailyCommandCenter` (for the rendered list) now call. There is exactly one computation of "what's actionable today" in the codebase; the summary and the list can no longer disagree because they're reading the same array.

## 23. Priority logic (7 tiers, replaces the 3E.1 6-tier set)

Implemented in `attentionPriority()`, still deterministic, still never written to the database, never a lead score:

1. Overdue follow-up
2. Follow-up due today
3. Event today
4. New lead, uncontacted **> 48h** → labeled **Contact Overdue**
5. New lead, uncontacted **> 24h** → labeled **Needs Contact**
6. New lead, uncontacted, received today → labeled **New Lead**
7. Event tomorrow

Within a tier, leads are ordered by `tierSortKey()`: overdue/due-today by `next_followup_at` ascending (most overdue / earliest time first), event tiers by `event_date` ascending (earliest event first), stale-lead tiers by `created_at` ascending (longest-waiting lead first) — "oldest unresolved item first," per the brief.

## 24. Stale New-lead rules

New `staleLeadUrgency(createdAt)` (`src/lib/lead-helpers.ts`) — a presentation-only label computed from `created_at`, never written anywhere and never changing the `status` column, which always stays `"new"`:

| Age | Label | Detail text |
|---|---|---|
| 0–24h | New Lead | "Received {relative time} ago" |
| >24–48h | Needs Contact | "Waiting {N} day(s)" |
| >48h | Contact Overdue | "Waiting {N} day(s)" |

Only applies to leads matching the existing `isNewNotContacted()` condition (`status = 'new'` AND `last_contacted_at IS NULL`) — a lead the beautician has already contacted, regardless of how old it is, never gets a stale-lead label.

## 25. Daily summary rules

Deterministic (no AI), built by counting `getTodayPriorities()` tiers and joining whichever categories are non-zero:

- Tier 1 → "{n} overdue follow-up(s)"
- Tier 2 → "{n} follow-up(s) due today"
- Tier 3 → "{n} event(s) today"
- Tiers 4+5+6 combined → "{n} new lead(s) need contact" (all three stale-urgency labels are still "an uncontacted New lead" at the summary-sentence level, even though they render as differently-labeled rows in the list)
- Tier 7 → "{n} event(s) tomorrow"

Joined with " · " when multiple are present (e.g. "1 overdue follow-up · 2 new leads need contact · 1 event tomorrow"); `"You're caught up for today."` only when `getTodayPriorities()` returns an empty array — now guaranteed consistent with the list underneath it. One simplification from the brief's examples: a single consistent phrasing is used regardless of whether one or several categories are active (rather than switching between prose forms like "1 follow-up is overdue." vs. the compact "1 overdue follow-up" depending on context) — deterministic and easier to keep correct than two message grammars.

## 26. Duplicate-prevention logic

Unchanged mechanism from 3E.1, now proven against the new tiers: `getTodayPriorities()` assigns each lead exactly **one** tier — its highest-priority match — via a single `if/else` chain in `attentionPriority()`, so a lead with both an overdue follow-up and an event tomorrow is only ever tier 1, never tier 1 *and* tier 7. It renders once, under "Overdue Follow-up," with the event-tomorrow fact surfaced as a small secondary note on the same row (`secondaryNote()` in `lead-views.tsx`) rather than a second row. The same lead is also excluded from Upcoming Events by id (`shownIds`, built from the *full* uncapped priority set, not just the top-8 slice shown on screen).

## 27. Row content & visual urgency

Rows stayed compact per the brief's examples — category badge + name, one detail line (+ optional secondary note), contextual actions. Semantic color hierarchy applied restrainedly (never color-alone, always paired with the label text):
- **Critical** (destructive/red tone): Overdue Follow-up, Contact Overdue
- **Attention** (amber): Follow-up Today, Needs Contact, Event Today
- **Informational** (primary/violet): New Lead, Event Tomorrow

## 28. Pipeline status chips

Unchanged structurally (`PipelineStrip`, still all 7 statuses, still clickable filters). Only addition: a status with `value === 0` now renders at reduced opacity (border/text muted) instead of full-strength — still fully visible and clickable, just visually deprioritized versus a non-zero count, per the brief's "may be visually muted, do not remove."

## 29. Files changed

- `src/lib/lead-helpers.ts` — added `staleLeadUrgency()`, `getTodayPriorities()`, `PriorityLead<T>`, `tierSortKey()`; `attentionPriority()` rewritten for the 7-tier set.
- `src/components/leads/lead-views.tsx` — `LeadDailyCommandCenter` now calls `getTodayPriorities()` instead of computing its own list; `CATEGORY_META`/`priorityCategory`/`priorityDetail` extended for the 3 new stale-lead tiers; new `secondaryNote()` for same-row secondary context; `PipelineStrip` mutes zero-value chips.
- `src/routes/dashboard.leads.tsx` — `attentionLine` rewritten to derive from the same `getTodayPriorities()` result used by the command center (was previously a separately-computed, narrower set of counts).

## 30. Database changes

**None.**

## 31. Tests performed

- `tsc --noEmit` — clean.
- ESLint — clean (Prettier-only auto-fixes applied).
- Production build — succeeds.

## 32. Test results / regression results

Build/type/lint verification passed. Full regression smoke test (200 OK on every route): `/dashboard/leads`, `/dashboard/areas`, `/dashboard/availability`, `/dashboard/services`, `/dashboard/packages`, `/dashboard/faqs`, `/dashboard/reviews`, `/dashboard/videos`, `/dashboard/profile`, and the public portfolio route. No code path in Add Lead, Edit Lead, Lead Detail, follow-up logging/completion, internal notes, activity timeline, List/Card/Pipeline views, search, Call/WhatsApp, RLS, or public submission was touched this phase — all logic changes are confined to `attentionPriority()`, `getTodayPriorities()`, `staleLeadUrgency()`, and their two call sites.

The scenario tests (A–J: no actionable items, fresh/needs-contact/overdue stale leads, follow-up-today, overdue-follow-up-outranking-new-leads, event-tomorrow, event-in-3-days routing to Upcoming, the overdue+event-tomorrow dedup case, and full tier ordering) need your live click-through, since browser automation isn't available in this environment.

## 33. Manual verification checklist

- **A**: Empty CRM state or a day with nothing due → "You're caught up for today."
- **B**: New lead received 3 hours ago → "New Lead" badge, "Received 3 hours ago."
- **C**: New lead waiting 30 hours → "Needs Contact" badge, "Waiting 1 day."
- **D**: New lead waiting 5 days → "Contact Overdue" badge, "Waiting 5 days."
- **E**: Follow-up due today → "Follow-up Today" badge.
- **F**: Overdue follow-up → "Overdue Follow-up" badge, ranked above New Lead rows.
- **G**: Event tomorrow → "Event Tomorrow" badge, in Today's Priorities.
- **H**: Event in 3 days → appears in Upcoming Events, not Today's Priorities (unless another condition applies).
- **I**: Same lead with overdue follow-up + event tomorrow → one row only, "Overdue Follow-up" primary, "Event tomorrow" as secondary text.
- **J**: Mixed priority types → confirm the 7-tier order from §23.
- Regression: Add/Edit/Open Lead, Add Follow-up, Complete Follow-up, Reschedule, status change, notes, Call, WhatsApp, search, all quick filters (Today's Leads/Follow-ups/Overdue/Events Today), List/Cards/Pipeline switch, and the 9 other dashboard routes + public portfolio.

## 34. Known limitations

- Same browser-local timezone strategy as Phase 3E/3E.1 — unchanged.
- The daily summary's phrasing is deliberately uniform (not switching sentence structure by category count) — see §25.
- Today's Priorities still caps rendered rows at 8 (dedup against Upcoming Events now correctly uses the full uncapped set, so this cap only affects what's visible, not correctness).

## 35. Phase 3E closure

**PHASE 3E — MINI CRM FOUNDATION**
**STATUS: COMPLETE**

### Completed capabilities

- Lead capture (public portfolio → lead, with source tracking)
- Manual lead creation (Quick Add + Full Details wizard)
- Lead editing
- Multi-service requirements (relational, not comma-separated text)
- Event details (date, type, persons, venue)
- Service location (studio / client location / both)
- Number of persons
- Source tracking (Portfolio, WhatsApp, Phone, Instagram, Facebook, Google, Referral, Manual Entry, Other)
- Lead status pipeline (9 stages: New → Contacted → Follow-up → Quoted → Negotiation → Confirmed → Completed → Lost → Closed)
- Internal notes (pinned field + activity-logged)
- Follow-up scheduling
- Follow-up history (append-only, never overwritten)
- Chronological activity timeline (status changes, follow-ups, edits, notes)
- Call / WhatsApp quick actions (contextual, throughout the CRM)
- List / Card / Pipeline views (List default, persisted per-viewer)
- Search / filtering (unified, composable, non-contradictory)
- Today's Leads
- Today's Follow-ups
- Overdue detection (with hour/day-granular labeling)
- Upcoming Events (tomorrow through 7 days, deduplicated against priorities)
- Daily Priority Center (Today's Priorities, 7-tier deterministic ordering)
- Stale-lead detection (New Lead → Needs Contact → Contact Overdue, presentation-only)
- Contextual daily summary (deterministic, no AI)

### Explicitly deferred (NOT part of Phase 3E)

- WhatsApp API integration
- SMS integration
- Automated reminders
- Message templates
- Communication delivery logs
- Calendar integration
- AI lead scoring
- Hot/Warm/Cold intelligence
- Quotation/payment workflow
- Revenue analytics
- Advanced CRM automation

### Future architecture note

The current CRM (`leads` / `lead_inquiries` / `lead_inquiry_services` / `lead_activities`, with `activity_type`/`channel`/`direction` columns already shaped for external-message logging) is intended to remain extensible for the deferred capabilities above — WhatsApp, SMS, calendar, automation, and AI-assisted CRM — without requiring a schema rewrite when that work begins. None of it is implemented now; this is a design intent note, not a commitment of new code.

