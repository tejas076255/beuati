# BeautyFolio Phase 2 — Step 2B: Portfolio Content CRUD Foundation

**STATUS: COMPLETE** (closed 2026-08-21 — see "Closure" section at the end of this
document for final evidence; the sections below are the original implementation record
and remain unmodified as history).

Application CRUD layer only — no schema/RLS/Storage changes, per Step 2A's confirmed
"NO MIGRATION REQUIRED" conclusion, preserved. Companion to
`BEAUTYFOLIO-PHASE2-STEP2A-DATA-MODEL.md`.

## What Already Existed (inspected, not duplicated)

Every server function added in this step follows the exact established pattern from Phase 1/
Step 1's dashboard files: `getOwnBeauticianProfileId(supabase, userId)` resolves ownership,
RLS (`owns_beautician_profile()`) is the real authorization boundary, never a client-supplied
`beautician_profile_id`. `availability.server.ts`'s get+upsert single-record pattern was reused
verbatim for `portfolio_seo` (also a 1:1, `UNIQUE beautician_profile_id` table). `dashboard.
profile.tsx`'s existing photo-upload pattern was reused verbatim for the new cover-photo upload.
`faqs.server.ts`/`reviews.server.ts`'s list/create/update/delete dialog pattern was reused for
`portfolio_videos`.

## What Step 2B Added

### 1. Profile content fields (cover_image_url, business_name, social URLs)

- `src/data/dashboard/profile.server.ts` — `OwnProfileUpdate` extended from 18 to 24 fields:
  added `cover_image_url`, `business_name`, `website_url`, `facebook_url`, `instagram_url`,
  `youtube_url`. `updateOwnProfile` itself needed no change — it already writes whatever fields
  are present in the type.
- `src/routes/dashboard.profile.tsx` — added: `business_name` text field, a cover-photo upload
  control (mirrors the existing profile-photo control exactly, reuses the existing `"profile"`
  Storage category — no Storage/RLS change), and 4 social URL fields, each validated as a URL
  via `z.string().url(...).or(z.literal(""))` (empty allowed, malformed rejected).
- **Not done in this step, by design:** public-page rendering of these 6 fields. Step 2B's
  authorized scope is the CRUD layer specifically; wiring them into `portfolio-mapper.ts` and
  the public page would touch public-facing UI, which this step's UI boundary explicitly
  excludes ("do not redesign the public portfolio"). Documented as a known limitation, not
  silently expanded into.
- **Orphan-cleanup note:** the new cover-photo upload replicates the *exact same* un-fixed
  behavior the existing profile-photo upload already has (old Storage object is not deleted on
  replace) — for consistency with the established pattern, and because Step 2B's instructions
  explicitly forbid silently fixing the previously-documented orphan-cleanup issue unless
  directly required. Both photo fields now share the identical, already-known limitation.

### 2. `portfolio_videos` CRUD

- `src/data/dashboard/videos.server.ts` (new) — `listOwnVideos`, `createVideo`, `updateVideo`,
  `deleteVideo`.
- `src/routes/dashboard.videos.tsx` (new) — list + add/edit dialog, matching the existing
  FAQ/review dialog-list pattern. Fields: title (required), platform (select, exactly the 4
  existing enum values, no new values added), video link, thumbnail link, category, description,
  duration (seconds, optional), published toggle.
- **Deliberate scope cut, documented not silently decided:** `video_url` remains a plain URL
  text field, not a Storage file-upload flow. Building direct video-file upload would require new
  MIME-type/size-limit validation beyond "CRUD foundation." `storage_path` remains untouched/null
  for all rows created via this UI — a schema field intentionally left unused this step.
- **Thumbnail follow-up (user-approved, 2026-08-21):** manual testing confirmed the public
  portfolio page already renders `portfolio_videos` (pre-existing, untouched by Step 2B) — a real
  video successfully flowed end-to-end from the new dashboard CRUD through to the public page.
  The thumbnail broke because the initial implementation made `thumbnail_url` a link-only field,
  and the tester had no already-hosted image URL to paste. **Fixed, with explicit approval**:
  `thumbnail_url` is now an upload control, reusing `uploadPortfolioMedia` with the existing
  `"gallery"` Storage category — zero Storage/RLS change, since the Step 1 policy is
  category-agnostic. `video_url` itself is unaffected, still a link field.

### 3. `portfolio_seo` CRUD

- `src/data/dashboard/seo.server.ts` (new) — `getOwnSeo` (returns `null` if no row exists yet,
  matching `availability.server.ts`'s exact pattern), `saveOwnSeo` (upsert on the unique
  `beautician_profile_id`, guaranteeing the 1:1 relationship can never produce a duplicate row —
  this is what the "duplicate 1:1 record cannot be created" requirement resolves to structurally,
  not application-level de-duplication logic).
- `src/routes/dashboard.seo.tsx` (new) — single form, matching `dashboard.availability.tsx`'s
  exact structure (including the `formReady` gating pattern for the same Radix-Select
  display-sync reason documented since Phase 1). Fields: title, meta description, primary
  keyword, canonical URL (validated), OG title/description/image URL (image URL validated),
  robots index/follow toggles.

## Navigation

`src/routes/dashboard.tsx` — added "Videos" and "SEO" to `NAV_ITEMS`, between Reviews and
Availability.

## Security / Ownership — Verified, Not Assumed

Every new function relies on the exact same `owns_beautician_profile()` RLS already confirmed
correct in Step 2A — zero new policies needed, zero policy changes made.

**Live negative-authorization tests performed this step (anon key, non-destructive):**
- `POST portfolio_videos` as anon → rejected, `42501` RLS violation
- `POST portfolio_seo` as anon → rejected, `42501` RLS violation
- `PATCH beautician_profiles.business_name` as anon → returned `204` (ambiguous on its own —
  could mean "0 rows matched" either from RLS or a nonexistent row) — **resolved with a follow-up
  read**: `business_name` confirmed still `null` afterward, proving the write had zero effect,
  not just an ambiguous status code.

## Validation

- URL fields (`website_url`, `facebook_url`, `instagram_url`, `youtube_url`, `video_url`,
  `thumbnail_url`, `canonical_url`, `og_image_url`) use `zod`'s `.url()`, rejecting malformed
  input; the profile social fields additionally allow an empty string (optional), while video
  link/thumbnail are required (a video with no playable link or thumbnail has nothing to render
  — matches the existing public-page filter that already drops videos without a `thumbnail_url`).
- `platform` constrained to the exact 4 existing enum values via `z.enum(...)` — no new values.
- Ownership violations are structurally impossible to construct from the client: no form or
  server function anywhere accepts a `beautician_profile_id` as input; every one resolves it
  server-side via `getOwnBeauticianProfileId`.

## Testing

- **Code-level:** `tsc --noEmit` — PASS. `eslint` (scoped to all changed/new files) — PASS.
  `npm run build` — PASS. Bundle-leak grep for `getOwnBeauticianProfileId`/`listOwnVideos`/
  `createVideo`/`updateVideo`/`deleteVideo`/`getOwnSeo`/`saveOwnSeo`/`updateOwnProfile` across
  `.output/public/` — zero matches. `routeTree.gen.ts` confirmed to contain `/dashboard/videos`
  and `/dashboard/seo`.
- **Database-level (live, read-only + safe negative writes):** anon rejected on all three new
  write surfaces, confirmed above with a follow-up read where the status code alone was
  ambiguous.
- **Manual browser verification: NOT YET PERFORMED** — requires the user to log in as a real
  beautician and exercise each new form (see completion report below for the exact actions).

## Documentation

This file created. `docs/BEAUTYFOLIO-ADMIN-PHASE-1.md` intentionally not updated — nothing in
Step 2B touches any Phase 1 admin table, route, or RLS policy.

## Finding Deferred to a New, Separately-Authorized Step (not Step 2B)

Manual testing surfaced a **pre-existing gap in the public portfolio's `VideosSection`**
(`src/components/portfolio/portfolio-sections.tsx`, line ~925) — the play button has no
`onClick` handler and no player/modal/embed exists anywhere in the file. This predates Step 2B
entirely; it was invisible before because there was no way to create a real video until this
step's CRUD existed. The user also requested a reel/shorts-style vertical video viewer instead
of the current grid-card layout. Both are public-portfolio presentation work, explicitly outside
Step 2B's authorized "data/backend CRUD foundation only" scope. **User decision (2026-08-21):**
handle as a new, separately-authorized step rather than folding into Step 2B — Step 2B's CRUD
scope stays clean and closed; the video-playback/presentation work is not started.

**Resolved (2026-08-21):** this deferred work was completed across four separately-authorized
follow-up steps (video playback + reel-style presentation, video viewer UX correction, uploaded-
video workflow, upload UX polish) — see the "Closure" section below for the full record and
evidence. Playback, native uploaded-video support, and the reel-style viewer are now live.

## Known Limitations

- New profile fields (cover/business/social) are writable but not yet publicly rendered —
  deferred, out of this step's UI boundary. Still outstanding as of closure.
- ~~No direct video-file upload — `video_url`/`thumbnail_url` are link fields only this pass.~~
  **Resolved** — direct video-file upload (`platform = "uploaded"`) was added in a follow-up
  step; see "Closure" below.
- Cover-photo orphan-cleanup shares the same pre-existing, documented limitation as profile-photo
  (old file not deleted on replace) — not fixed, per instruction not to silently expand scope.
  Still outstanding as of closure.
- `is_cover` gallery-selection UI and the gallery/before-after delete-order orphan-cleanup fix
  remain entirely untouched, as instructed (belongs to a future, separately-authorized step).
  Still outstanding as of closure.

## Closure (2026-08-21)

**STATUS: STEP 2B COMPLETE.** All CRUD foundation work above, plus its deferred video-playback
finding, is closed. This section is the final evidence record; nothing above it was altered
except the status/limitation annotations added at closure time.

### Files changed across the full video-subsystem effort (Step 2B + its four follow-up steps)

| File | Change |
|---|---|
| `src/data/dashboard/profile.server.ts` | `OwnProfileUpdate` extended (cover/business/social fields) |
| `src/routes/dashboard.profile.tsx` | cover-photo upload, business name, social URL fields |
| `src/data/dashboard/videos.server.ts` | `portfolio_videos` CRUD; `VideoInput` extended with `storage_path` |
| `src/routes/dashboard.videos.tsx` | Videos dashboard page: platform-aware form, uploaded-video dropzone (drag-and-drop, filename/size, Change/Remove), platform-specific helper text, thumbnail upload, dialog scroll fix |
| `src/data/dashboard/seo.server.ts` | `portfolio_seo` get/upsert |
| `src/routes/dashboard.seo.tsx` | SEO dashboard page |
| `src/routes/dashboard.tsx` | nav entries for Videos/SEO |
| `src/lib/storage-upload.ts` | added `uploadPortfolioVideo` (video Storage upload, separate from image upload) |
| `src/lib/video-embed.ts` | new — per-platform embed resolution (YouTube iframe, Instagram iframe, uploaded native `<video>`, link fallback) |
| `src/data/portfolio.ts` | `BeauticianProfile.videos` extended with `platform`/`videoUrl`/`storagePath` |
| `src/data/portfolio-mapper.ts` | video mapping carries platform/URL/storage fields through |
| `src/components/portfolio/portfolio-sections.tsx` | `VideosSection` play button wired up; new `VideoPlayerModal` (aspect-ratio-correct per platform, backdrop-click-to-close, focus management, poster from thumbnail) |

### Automated verification evidence (final state, all follow-up steps included)

- `tsc --noEmit` — PASS
- `eslint` (all changed files) — PASS, zero errors; one pre-existing warning unrelated to this
  work (`react-refresh/only-export-components` on `waLink`, present before Step 2B)
- `npm run build` — PASS
- Dev server runtime check — no errors attributable to this work; only pre-existing, unrelated
  hydration warnings observed (browser-extension DOM injection, login-form `autoComplete`)

### Manual verification evidence (user-confirmed, 2026-08-21)

- Uploaded-video platform: correct helper text, visible/clickable dropzone, MP4/MOV/WebM upload,
  50MB limit messaging, successful save, correct portfolio display and native playback
- Instagram video flow: working
- YouTube video flow: working
- Platform switching: working
- Thumbnail upload: still functional
- Add/Edit Video dialog: reachable Save button at 100% browser zoom (scroll fix confirmed)

### Non-blocking observations carried forward

- Cover/business/social profile fields are writable but not yet rendered on the public page —
  separate, unauthorized-so-far scope.
- Cover-photo orphan-cleanup (old Storage file not deleted on replace) — pre-existing, documented,
  not fixed.
- `is_cover` gallery-selection UI and gallery/before-after delete-order orphan-cleanup — untouched.
- Uploaded-video upload has no progress percentage (indeterminate "Uploading…" only) and no
  client-side duration auto-detection.
- Instagram's inline embed remains best-effort, dependent on Instagram's own `/embed/` endpoint
  behavior — outside this app's control.
