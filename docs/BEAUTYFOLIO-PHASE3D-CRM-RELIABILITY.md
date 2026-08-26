# BeautyFolio — Phase 3D: Leads Mini-CRM Reliability & UX Refinement

Controlled refinement phase. No redesign, no new integrations, no schema changes. Fixes only the 8 approved issues from the Phase 3C QA audit.

## 1. Issues discovered

From the Phase 3C static code audit:

1. `previousStatus` for the status-change activity was supplied by the client (derived from React Query cache), which could be stale on rapid consecutive status changes.
2. Summary-card filtering (`quickFilter`) and the toolbar Status dropdown (`statusFilter`) were two independent state variables, ANDed together — could produce a confusing zero-result dead end.
3. The "Follow-up Due" summary card label implied urgency it didn't have (it reflected the manual "qualified" pipeline stage, not an actually-due follow-up date).
4. "Mark completed" opened the same full logging form as "Add Follow-up" — unnecessary friction for a completion action.
5. Timeline audit found two supported actions that never created an activity record: editing a lead, and saving internal notes.
6. Zero-result filter states showed a generic one-line message with no distinction between "no search matches" and "no filter matches," and no reset action.
7. Pipeline (Kanban) view scrolls horizontally on mobile — flagged for a decision, not a fix.
8. Media-upload UI standard — reconfirmed as a standing rule; nothing in this phase touches a media upload component.

## 2. Root causes

- **Status history**: the client was trusted as the source of truth for "what was the previous status," instead of the server reading it from the database at the moment of the write.
- **Filter conflict**: two UI surfaces (cards, dropdown) each got their own state variable instead of sharing one.
- **Timeline gaps**: `updateLead()` and `updateLeadNotes()` performed their database writes but never inserted a corresponding `lead_activities` row — an omission, not a design choice.

## 3. Files changed

- `src/data/leads-query.server.ts` — `updateLeadStatus()` rewritten to be server-authoritative; `updateLead()` and `updateLeadNotes()` now each log a `note` activity.
- `src/routes/dashboard.leads.tsx` — unified status filter state, removed `quickFilter`, added `attentionFilter` for Overdue/Today, wired per-lead status-mutation pending state, improved empty-filter-state UI, wired the new "Complete Follow-up" flow.
- `src/components/leads/lead-detail-dialog.tsx` — added `CompleteFollowupForm` (focused completion UI), disabled pipeline buttons while a status mutation is pending, updated the activity timeline to recognize and label completion entries.
- `src/lib/lead-config.ts` — added `COMPLETION_OUTCOMES` (the dedicated outcome list for the completion form); the misleading "Follow-up Due" label was actually only a summary-card override in `dashboard.leads.tsx` (removed) — `STATUS_META.qualified.label` was already the correct "Follow-up".

## 4. Status-history solution

`updateLeadStatus(supabase, leadId, status)` (client no longer passes `previousStatus`):

1. Reads the lead's current `status` directly from the database.
2. If the requested status equals the current one, returns `{ changed: false }` and does **nothing else** — no update, no activity row.
3. Otherwise updates the row with an optimistic-concurrency guard (`.eq("status", currentStatus)`) and checks the returned row count.
4. If another request already changed the status in between (0 rows affected), it also returns `{ changed: false }` rather than logging an activity against a value that's no longer accurate.
5. Only on a genuine, uncontested change does it insert the `status_change` activity, using the value it just read — never a client-supplied one.

On the client, the pipeline buttons in the lead detail workspace are disabled (`disabled={statusChangePending}`) for the currently-open lead while a status mutation is in flight — this doesn't freeze the rest of the Leads interface (search, filters, other leads in List/Card/Pipeline view all stay interactive), only the one lead whose status is actively being changed.

## 5. Filter-state solution

Replaced `quickFilter` + separate `statusFilter` with:

- `statusFilter: LeadStatus | "all"` — the single source of truth for pipeline status, set identically by a summary-card click or the toolbar dropdown. Selecting a new value always **replaces** the previous one (never ANDs).
- `attentionFilter: "none" | "today" | "overdue"` — a separate, composable dimension for the two time-based cards. A lead can be "Overdue" regardless of its pipeline status, so this is intentionally not folded into `statusFilter`, per the explicit instruction not to convert Overdue/Today into pipeline-status filters.

Both a status filter and an attention filter can be active together (e.g. Status = Follow-up **and** Overdue) — that's expected, composable filtering across two different dimensions, not the same bug as before (which was two states describing the *same* dimension).

`Clear Filters` resets both, plus every other filter and the search box.

## 6. Follow-up completion workflow

New `CompleteFollowupForm`, opened only from "Mark completed" (shown only when a follow-up is currently scheduled):

- Customer name (read-only context)
- Follow-up outcome * — dedicated `COMPLETION_OUTCOMES` list (Interested / Needs More Time / Quote Requested / Booking Confirmed / Not Interested / No Response / Other)
- Completion note (optional, free text)
- "Schedule another follow-up" switch — OFF by default
  - OFF: no additional fields; submitting clears the lead's current `next_followup_at`/`next_followup_reason`
  - ON: reveals Next follow-up date* / time / reason; submitting sets those as the new current follow-up

Behind the scenes this logs one `lead_activities` row (`activity_type = "follow_up"`, `metadata.completed = true`) — reusing the existing `addLeadActivity()` logic already in place from the prior phase, which unconditionally replaces `next_followup_at`/`reason` for any `follow_up`-type activity (including clearing it to `null` when no new date is given). The activity itself, and every prior activity, is never overwritten or deleted — the timeline is append-only.

"Add Follow-up" (the general logging form, used to record a call/WhatsApp/etc. and optionally schedule the next one) is unchanged and remains available separately.

## 7. Activity-history behaviour

Audited against the requested event list:

| Event | Status | Notes |
|---|---|---|
| Lead created | ✅ Retained | `note` activity on manual creation ("Lead added manually."); public submissions log "Enquiry received via public portfolio." via `submit_lead()` — unchanged from Phase 3B. |
| Status changed | ✅ Retained (now more reliable) | `status_change` activity, server-authoritative `from`/`to`, no-op when unchanged. |
| Lead edited | ✅ Fixed this phase | `updateLead()` previously wrote to `leads`/`lead_inquiries` with no activity trace. Now logs a `note` activity ("Lead details updated.") — reuses the existing `note` type, no new type introduced. |
| Follow-up scheduled | ✅ Retained | Logged via `addLeadActivity` (`follow_up` type), used by both the Add Lead wizard's optional follow-up and the detail workspace's "Add Follow-up." |
| Follow-up completed | ✅ New this phase | `follow_up` activity with `metadata.completed = true`, rendered distinctly in the timeline as "Follow-up completed." |
| Internal note added | ✅ Fixed this phase | `updateLeadNotes()` previously only updated the pinned `leads.notes` field silently. Now also logs a `note` activity with the note content, so saving internal notes is visible in the chronological trail. |

No new `lead_activity_type` enum values were introduced — every fix above reuses `note` or `follow_up`, which already existed.

## 8. Database changes

**None.** No migrations were created or applied. All fixes are application-code changes (server function logic + UI), operating entirely within the existing `leads` / `lead_inquiries` / `lead_inquiry_services` / `lead_activities` schema and RLS policies from Phase 3B/3C.

## 9. Tests performed

- `tsc --noEmit` — clean.
- ESLint — clean (two rounds of Prettier-only auto-fixes applied).
- Production build — succeeds.
- Dev-server smoke test (200 OK on all): `/dashboard/leads`, `/dashboard/profile`, `/dashboard/services`, `/dashboard/packages`, `/dashboard/availability`, `/dashboard/areas`, and the public portfolio route.

## 10. Test results

Static/build-level verification above all passed. The functional tests (A–H) from your brief — status-history correctness under rapid changes, filter replace-not-AND behaviour, completion-clears-vs-schedules-next, empty states, refresh persistence — require your live click-through, since I don't have browser automation in this environment. Recommended manual checks are listed below.

## 11. Known limitations

- The server-side optimistic-concurrency guard on status updates (`.eq("status", currentStatus)`) closes the read-then-write race for genuinely concurrent requests, but true atomicity would require a database function (e.g. `UPDATE ... RETURNING` in a single round trip) — deliberately not introduced, since it would require a migration and the brief asked to avoid schema changes unless required. The current fix (server reads fresh state per request + UI disables the in-flight lead's buttons) is the "safest minimal solution" as requested.
- Mobile Pipeline view **intentionally** uses horizontal scrolling — not redesigned this phase, per instruction. List View remains the recommended default for mobile use.
- "Lead edited" and "Internal note added" activities log a fixed summary message / the note text, not a field-by-field diff — sufficient to establish that the action happened and when, without building a full audit-diff system out of scope for this phase.

## 12. Deferred features

Explicitly not started, per instruction: Event Approaching indicator, lead scoring / Hot-Warm-Cold classification, WhatsApp API/templates, SMS API, automated follow-ups/reminders, AI summaries/reply generation/recommendations, lead assignment, multi-user CRM, calendar integration, payment tracking, revenue dashboard, drag-and-drop Kanban.
