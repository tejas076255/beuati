# BeautyFolio Phase 2 — Step 3A: Beautician Portfolio Manager Sidebar Shell

_Status: COMPLETE (2026-08-21)_

Controlled UI/architecture step for the professional-facing `/dashboard/*` shell — no database,
RLS, Storage, auth, or individual-page changes. Companion to `BEAUTYFOLIO-ADMIN-PHASE-1.md`
(Step 6), which covers the separate, unaffected Platform Admin sidebar.

## Architecture discovered (inspection, before any change)

`src/routes/dashboard.tsx` is the single shared layout for all 12 beautician-facing pages —
every `dashboard.*.tsx` route renders as its `<Outlet/>` child, so there was already exactly one
place to change, not twelve. Before this step it rendered a horizontal top nav (`NAV_ITEMS`, a
flat array of 12 links) inside a `<header>`, with profile identity (name/avatar), an admin-only
"Admin console" link, and "Log out" — all fetched via 4 existing server functions
(`ensureOwnPortfolioFn`, `getOwnProfileSummaryFn`, `countNewLeadsFn`, plus the admin-role check).

**Existing routes (all 12, confirmed functional pre-change):** `/dashboard/profile`,
`/dashboard/gallery`, `/dashboard/before-after`, `/dashboard/videos`, `/dashboard/services`,
`/dashboard/packages`, `/dashboard/faqs`, `/dashboard/reviews`, `/dashboard/availability`,
`/dashboard/areas`, `/dashboard/leads`, `/dashboard/seo`. **No `/dashboard` index/overview page
and no `/dashboard/settings` page exist** — confirmed by directory listing, not assumed.

**Reused, not built:** `src/components/ui/sidebar.tsx` — the full shadcn Sidebar primitive set
(`SidebarProvider`/`Sidebar`/`SidebarGroup`/`SidebarMenuButton`/etc.) was already installed in
the project and fully theme-wired (`--sidebar-*` CSS tokens already defined in `src/styles.css`
for both light and dark mode, using the existing BeautyFolio pink/purple palette) but was unused
anywhere in the codebase. It natively provides: a fixed desktop sidebar, a collapsible icon rail,
and an automatic mobile Sheet-based drawer (via the existing `useIsMobile` hook) — exactly the
three responsive states required, with zero new dependencies and zero new design tokens invented.

## Proposed navigation mapping

| Group | Item | Route | Status |
|---|---|---|---|
| Overview | Dashboard | — | **PLANNED — NO IMPLEMENTATION YET** |
| My Portfolio | Profile | `/dashboard/profile` | Existing, linked |
| My Portfolio | Gallery | `/dashboard/gallery` | Existing, linked |
| My Portfolio | Before & After | `/dashboard/before-after` | Existing, linked |
| My Portfolio | Videos | `/dashboard/videos` | Existing, linked |
| Business | Services | `/dashboard/services` | Existing, linked |
| Business | Packages | `/dashboard/packages` | Existing, linked |
| Business | FAQs | `/dashboard/faqs` | Existing, linked |
| Business | Reviews | `/dashboard/reviews` | Existing, linked |
| Business | Availability | `/dashboard/availability` | Existing, linked |
| Business | Service Areas | `/dashboard/areas` | Existing, linked |
| Growth | Leads | `/dashboard/leads` | Existing, linked, unread-count badge preserved |
| Growth | SEO | `/dashboard/seo` | Existing, linked |
| Account | Settings | — | **PLANNED — NO IMPLEMENTATION YET** |
| Account | View Public Portfolio | `/portfolio/$slug` | Existing route, added as a **header** action (not a sidebar item — points at the beautician's own public page, not a Portfolio Manager page) |

Dashboard and Settings render in the sidebar as disabled menu buttons with a muted "Soon" badge
and a tooltip ("planned, not yet available") — visible in the approved information architecture,
but not clickable and not pointing at a fabricated page, per instruction.

## Files changed

- `src/routes/dashboard.tsx` — the only file modified. Restructured from a flat horizontal
  `NAV_ITEMS` array + `<header><nav>` into: `NAV_GROUPS` (5 grouped sections with icons) +
  `<SidebarProvider><Sidebar>…</Sidebar><SidebarInset>…</SidebarInset></SidebarProvider>`. One
  minimal supporting change: `getOwnProfileSummaryFn` now also returns `profile.slug` (already
  fetched by the existing `getOwnProfile` call, no new query) so the header's new "View Public
  Portfolio" link has a real target.

## Files NOT changed

- No `dashboard.*.tsx` sub-page (all 12 individual pages untouched — same components, same
  server functions, same forms).
- No `.server.ts` file except the one-field addition described above.
- No database migration, RLS policy, or Storage policy.
- No auth/`require-auth.ts`/`auth-middleware.ts` change.
- `src/routes/admin.tsx` and the Platform Admin sidebar (Step 6) — completely separate file,
  untouched, unaffected. The two navigation systems remain fully independent.
- Public portfolio rendering (`src/routes/portfolio.$slug.tsx`, `portfolio-sections.tsx`,
  `portfolio-mapper.ts`) — untouched.

## Functionality preserved

- All 12 existing routes still render via the same `<Outlet/>` mechanism — same URLs, same
  components, same data.
- Profile identity display (avatar/initial + name), the admin-only "Admin console" link, and
  "Log out" are all still present, moved into the new header bar inside `SidebarInset`.
- The unread-leads badge (`countNewLeadsFn`, `newLeadsCount`) is preserved and now renders as a
  `SidebarMenuBadge` next to "Leads" — same data source, same 30-second refetch interval.
- Loading ("Checking session…" / "Setting up your portfolio…") and error states are unchanged,
  still rendered before the sidebar shell mounts.

## Tests performed

1. `tsc --noEmit` — initially surfaced two `exactOptionalPropertyTypes` errors from the
   `to: undefined` planned-item pattern; fixed by widening the nav-item type to
   `to: string | undefined` explicitly. Clean after.
2. `eslint` (scoped to the changed file) — one Prettier formatting issue, auto-fixed. Clean after.
3. `npm run build` — production build succeeded.
4. Dev-server route smoke test (all 13 real routes: `/dashboard` + the 12 sub-pages) — every one
   returned HTTP 200, no 500s.
5. Dev-server console check — no new runtime/hydration errors attributable to this change; only
   the pre-existing, unrelated Grammarly-extension hydration warning was present (same as before
   this task, on unrelated routes).

## Test results

All PASS. See table above for the route-by-route smoke test.

## Manual verification status

**MANUAL VERIFICATION REQUIRED** — no browser automation was available this session, so the
following were verified at the code/HTTP level only, not by an actual click-through:
1. Desktop sidebar appearance — not visually confirmed in a browser.
2. Active navigation state (`isActive` computed from the current pathname) — logic verified by
   reading the code, not observed live.
3. Sidebar navigation (all `Link` targets match existing route paths) — verified by code
   inspection and the HTTP 200 smoke test above.
4. Header (name/avatar, "View Public Portfolio," "Admin console," "Log out") — present in code,
   not visually confirmed.
5. "View Public Portfolio" link — code-correct (`/portfolio/$slug` with the real slug), not
   click-tested.
6. Mobile behavior (Sheet-based drawer via `useIsMobile`) — relies entirely on the pre-existing,
   previously-unused `sidebar.tsx`/`sheet.tsx` primitives; not exercised in an actual mobile
   viewport this session.
7. Existing page functionality (the 12 sub-pages themselves) — unchanged code, not manually
   re-tested this session (each was already verified in its own prior implementation step).
8. Missing routes — confirmed exactly two: `/dashboard` overview and `/dashboard/settings`, both
   correctly rendered as disabled/planned rather than fabricated.

## Known limitations

- "Dashboard" and "Settings" are visible-but-disabled in the sidebar, per instruction — no page
  exists behind them yet.
- "View Public Portfolio" only appears once the profile summary query resolves (same loading
  behavior the name/avatar already had).
- No collapsed-state persistence beyond what the reused `sidebar.tsx` component already provides
  (cookie-backed, built into the primitive, not custom-built this step).

## Recommended next step

Manual browser verification of the 8 items above. Individual Portfolio Manager page redesigns
(Profile, Gallery, etc.) are explicitly **not** started, per instruction — awaiting a separate,
future authorization.
