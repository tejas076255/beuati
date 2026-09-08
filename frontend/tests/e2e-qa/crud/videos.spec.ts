// QA-1J — sixth automated business-CRUD pilot: the Admin Videos lifecycle.
// DESTRUCTIVE. Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:videos` / `test:e2e:qa:crud` scripts.
//
// Audited architecture (src/data/dashboard/videos.server.ts,
// src/lib/video-embed.ts, src/components/videos/video-manager.tsx),
// re-confirmed live for QA-1J:
// - Videos is a HYBRID module, not URL-only and not fully storage-backed:
//   `platform` is one of youtube/instagram/uploaded/other. video_url is a
//   plain external URL for youtube/instagram/other; storage_path (Storage
//   object) is used only for platform "uploaded". CRITICALLY, `thumbnail_url`
//   is REQUIRED for every platform — every video, regardless of source,
//   uploads a real thumbnail image to Storage
//   (profiles/{slug}/video-thumbnails/{timestamp}-{filename}), so this
//   pilot is storage-backed for the thumbnail even in the youtube/instagram/
//   other cases exercised here.
// - No service_id column/field exists for Videos at all (unlike Services/
//   Gallery/Before & After) — confirmed by VideoInput's field list. This
//   pilot therefore has nothing to test/assert for service association;
//   recorded as N/A rather than fabricated.
// - URL "normalization" is NOT persisted — video_url is stored exactly as
//   entered; the embed URL is computed at RENDER time only
//   (getVideoEmbedSource in video-embed.ts), inside a click-to-open player
//   modal (VideoPlayerModal), not on the thumbnail card itself. This pilot
//   verifies the rendered iframe's `src`/`title` after opening that modal.
// - assertSafeVideoUrl (server) and the client zod schema both reuse the
//   same isSafeExternalVideoUrl() allow-list: https-only, plus a per-
//   platform host allow-list for youtube/instagram (any https host for
//   "other"). A malformed/wrong-scheme URL is rejected by the REAL UI
//   before any network call — this pilot exercises that path directly
//   rather than only unit-testing the helper.
import { type Browser, type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import {
  buildQaVideoContent,
  runDestructiveQaPreflight,
} from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";
import { saveAndExpectSuccess } from "../../helpers/ui/save-dialog.ts";
import { selectOption } from "../../helpers/ui/select-option.ts";
import { ownerSlugFromStoragePath } from "../../helpers/media/storage-checks.ts";

const AUTH_DIR = "playwright/.auth";
const BUCKET = "portfolio-media";
const THUMBNAIL_FIXTURE = fileURLToPath(
  new URL("../../fixtures/images/qa-gallery.png", import.meta.url),
);
// A second, distinct fixture (already used as the Before & After "before"
// image — reused here only as a generic, distinguishable image, no
// module-specific meaning) so replacement tests can prove the two uploaded
// objects are genuinely different paths, never the same one re-asserted.
const THUMBNAIL_FIXTURE_B = fileURLToPath(
  new URL("../../fixtures/images/qa-before.png", import.meta.url),
);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function openVideosTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Videos", exact: true }).click();
}

function videoCard(page: Page, title: string) {
  return page
    .getByText(title, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
}

async function uploadThumbnail(page: Page, fixturePath: string = THUMBNAIL_FIXTURE): Promise<void> {
  await page
    .getByRole("dialog")
    .locator('input[type="file"][accept*="image"]')
    .setInputFiles(fixturePath);
  // The thumbnail preview <img> only appears once the upload has actually
  // completed and form state carries a real thumbnail_url.
  await expect(page.getByRole("dialog").getByAltText("Thumbnail")).toBeVisible({
    timeout: 10_000,
  });
}

/** Uses the visible "Change" control (shown once a thumbnail is already
 * set) to trigger a replacement upload — this is the real UI path a user
 * takes to swap thumbnails before ever saving, distinct from the initial
 * empty-dropzone upload. */
async function changeThumbnail(page: Page, fixturePath: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  const thumbnailImg = dialog.getByAltText("Thumbnail");
  // A thumbnail preview is already visible before this call (that's what
  // makes "Change" available) — waiting for visibility alone is a no-op.
  // The only reliable signal that the NEW upload actually completed is the
  // <img> src attribute changing away from whatever it was before.
  const previousSrc = await thumbnailImg.getAttribute("src");
  await dialog.getByRole("button", { name: "Change" }).click();
  await dialog.locator('input[type="file"][accept*="image"]').setInputFiles(fixturePath);
  await expect
    .poll(() => thumbnailImg.getAttribute("src"), { timeout: 10_000 })
    .not.toBe(previousSrc);
}

async function currentThumbnailStoragePath(page: Page): Promise<string> {
  const src = await page.getByRole("dialog").getByAltText("Thumbnail").getAttribute("src");
  const path = src ? storagePathFromPublicUrl(src, BUCKET) : null;
  if (!path) throw new Error("Could not resolve the currently-displayed thumbnail's storage path.");
  return path;
}

async function createVideoViaAdmin(
  page: Page,
  fields: { title: string; videoUrl: string; category: string },
): Promise<void> {
  await page.getByRole("button", { name: "Add video" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Title").fill(fields.title);
  await selectOption(page, "Platform", "youtube");
  await page.getByLabel("Duration (seconds, optional)").fill("120");
  await page.getByLabel("Video link").fill(fields.videoUrl);
  await uploadThumbnail(page);
  await page.getByLabel("Category (optional)").fill(fields.category);
  const activeCheckbox = page.getByLabel("Show on portfolio");
  await activeCheckbox.uncheck(); // initial hidden state, per §10
  await saveAndExpectSuccess(page, "Save");
}

async function editDescriptionOnly(
  page: Page,
  title: string,
  newDescription: string,
): Promise<void> {
  await videoCard(page, title).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Description (optional)").fill(newDescription);
  await saveAndExpectSuccess(page, "Save");
}

async function togglePublishOnly(page: Page, title: string, active: boolean): Promise<void> {
  await videoCard(page, title).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const activeCheckbox = page.getByLabel("Show on portfolio");
  if (active) {
    await activeCheckbox.check();
  } else {
    await activeCheckbox.uncheck();
  }
  await saveAndExpectSuccess(page, "Save");
}

async function changeVideoUrlOnly(page: Page, title: string, newUrl: string): Promise<void> {
  await videoCard(page, title).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Video link").fill(newUrl);
  await saveAndExpectSuccess(page, "Save");
}

async function deleteVideoViaAdmin(page: Page, title: string): Promise<void> {
  page.once("dialog", (dialog) => void dialog.accept());
  await videoCard(page, title).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 10_000 });
}

/** Extracts the storage object path from a public URL of the exact shape
 * `${SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}` — the app's
 * own thumbnail_url values are always this shape (buildPublicMediaUrl). */
function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

interface LifecycleTiming {
  label: string;
  ms: number;
}
const timings: LifecycleTiming[] = [];

async function runVideoLifecycle(browser: Browser, label: string): Promise<void> {
  const start = Date.now();
  const { provider, runId } = runDestructiveQaPreflight();
  const content = buildQaVideoContent(runId);
  const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
  const proBSlug = beautyfolioProject.qaIdentities.professionalB.slug;

  const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
  const proB = await provider.getRow("beautician_profiles", { slug: proBSlug });
  if (!proA || !proB)
    throw new Error("QA professional fixtures not found — run qa:provision-identities first.");
  const proAId = proA["id"] as string;
  const proBId = proB["id"] as string;
  expect(proAId, "Professional A and B must be distinct").not.toBe(proBId);

  const originalStatus = proA["status"] as string;
  const originalPlan = (proA["plan"] as string) ?? "free";
  const baselineCountA = await provider.countRows("portfolio_videos", {
    beautician_profile_id: proAId,
  });
  const baselineCountB = await provider.countRows("portfolio_videos", {
    beautician_profile_id: proBId,
  });
  const baselineThumbnailObjects = await provider.listStorageObjects(
    BUCKET,
    `profiles/${proASlug}/video-thumbnails`,
  );
  const preexisting = await provider.rowExists("portfolio_videos", { title: content.title });
  expect(preexisting, "no video matching this runId should pre-exist").toBe(false);

  let videoId: string | null = null;
  let thumbnailStoragePath: string | null = null;
  // The thumbnail dropzone uploads to Storage immediately on file
  // selection, independent of form submission (same pattern as every
  // other module's dropzones) — so deliberately abandoning this negative-
  // validation form after uploading a thumbnail leaves that one object
  // genuinely orphaned unless this test's own cleanup accounts for it. Not
  // a product defect: the same would happen on a real user's plain Cancel.
  let invalidAttemptThumbnailPath: string | null = null;
  let profileTemporarilyPublished = false;
  let profileTemporarilyUpgraded = false;

  try {
    // ---- fixture prerequisite: make Professional A's public page reachable ----
    if (originalStatus !== "published") {
      await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
      profileTemporarilyPublished = true;
    }

    // ---- 5-tier entitlements — fixture prerequisite: Videos require
    // Silver+ (Free and Starter both lock Videos at 0). This suite
    // exercises the Video CRUD lifecycle itself, not entitlement caps
    // (that's entitlements.spec.ts's job) — via the same safe service-role
    // fixture path already used for `status` above (a NULL auth.uid()
    // actor is exempt from the plan guard specifically so fixture setup
    // like this keeps working; see the plan-entitlements migration).
    // Free/Starter-plan rejection for Videos remains covered exclusively
    // by entitlements.spec.ts.
    if (originalPlan !== "silver") {
      await provider.updateRow("beautician_profiles", { id: proAId }, { plan: "silver" });
      profileTemporarilyUpgraded = true;
    }

    const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const adminPage = await adminCtx.newPage();
    await openVideosTab(adminPage, proASlug);

    // ---- §14/§27 invalid/dangerous URL rejection through the REAL form,
    // BEFORE the primary create — no DB row must ever be created ----
    await adminPage.getByRole("button", { name: "Add video" }).click();
    const invalidDialog = adminPage.getByRole("dialog");
    await expect(invalidDialog).toBeVisible({ timeout: 10_000 });
    await adminPage.getByLabel("Title").fill(content.invalidTitle);
    await selectOption(adminPage, "Platform", "youtube");
    await uploadThumbnail(adminPage);
    const invalidAttemptThumbnailSrc = await invalidDialog
      .getByAltText("Thumbnail")
      .getAttribute("src");
    invalidAttemptThumbnailPath = invalidAttemptThumbnailSrc
      ? storagePathFromPublicUrl(invalidAttemptThumbnailSrc, BUCKET)
      : null;
    // wrong-host attempt (not on the youtube allow-list)
    await adminPage.getByLabel("Video link").fill("https://evil.example.com/video");
    await adminPage.getByRole("button", { name: "Save", exact: true }).click();
    await expect(invalidDialog, "dialog must remain open — wrong-host URL blocked").toBeVisible();
    await expect(adminPage.getByText(/valid HTTPS video URL/i)).toBeVisible({ timeout: 5_000 });
    // dangerous-scheme attempt
    await adminPage.getByLabel("Video link").fill("javascript:alert(1)");
    await adminPage.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      invalidDialog,
      "dialog must remain open — javascript: scheme blocked",
    ).toBeVisible();
    await expect(adminPage.getByText(/valid HTTPS video URL/i)).toBeVisible({ timeout: 5_000 });

    // QA-1J-D2 §7/§21 — a merely-invalid Save attempt must NOT delete the
    // pending thumbnail while the dialog is still open: the user may
    // correct the URL and save with the same thumbnail. The object must
    // still exist right now, before we ever close the dialog.
    expect(
      await provider.storageObjectExists(BUCKET, invalidAttemptThumbnailPath!),
      "pending thumbnail must survive a merely-invalid Save attempt while the dialog stays open",
    ).toBe(true);

    await adminPage.keyboard.press("Escape");
    await expect(invalidDialog).toBeHidden({ timeout: 10_000 });

    const invalidRowExists = await provider.rowExists("portfolio_videos", {
      title: content.invalidTitle,
    });
    expect(invalidRowExists, "no row may be created for a rejected invalid URL").toBe(false);

    // QA-1J-D2 §17/§23 — the APPLICATION itself (not this test's fallback
    // cleanup) must delete the abandoned pending thumbnail once the dialog
    // is closed via Escape. Asserted BEFORE any QA-side deletion — the
    // fallback below only protects the QA backend if this assertion or the
    // application behavior it proves ever regresses. Polled rather than
    // checked once: the cleanup delete is intentionally fire-and-forget
    // (never blocks the dialog from closing), so it may complete a short
    // moment after the dialog itself has already disappeared.
    await expect
      .poll(() => provider.storageObjectExists(BUCKET, invalidAttemptThumbnailPath!), {
        timeout: 10_000,
        message: "application must delete the abandoned pending thumbnail on dialog close",
      })
      .toBe(false);
    invalidAttemptThumbnailPath = null;

    // ---- §10 Admin creates a hidden Video with a valid youtube URL (real UI) ----
    await createVideoViaAdmin(adminPage, {
      title: content.title,
      videoUrl: content.youtubeWatchUrl,
      category: content.category,
    });

    // ---- §11 DB create assertions ----
    const created = await provider.getRow("portfolio_videos", { title: content.title });
    expect(created, "created video row must exist").not.toBeNull();
    videoId = created!["id"] as string;
    expect(created!["beautician_profile_id"]).toBe(proAId);
    expect(created!["video_url"]).toBe(content.youtubeWatchUrl);
    expect(created!["storage_path"]).toBeNull();
    expect(created!["category"]).toBe(content.category);
    expect(created!["duration_seconds"]).toBe(120);
    expect(created!["is_published"]).toBe(false);
    const proBHasIt = await provider.rowExists("portfolio_videos", {
      beautician_profile_id: proBId,
      title: content.title,
    });
    expect(proBHasIt, "Professional B must not have a matching video").toBe(false);

    // ---- §12 provider detection assertion ----
    expect(created!["platform"]).toBe("youtube");

    // ---- §13 URL is stored verbatim (not persisted/normalized) — the
    // embed transformation happens only at render time, verified later ----
    thumbnailStoragePath = storagePathFromPublicUrl(created!["thumbnail_url"] as string, BUCKET);
    expect(thumbnailStoragePath, "thumbnail_url must resolve to a storage path").not.toBeNull();
    expect(thumbnailStoragePath!.startsWith(`profiles/${proASlug}/video-thumbnails/`)).toBe(true);
    expect(ownerSlugFromStoragePath(thumbnailStoragePath!)).toBe(proASlug);
    expect(await provider.storageObjectExists(BUCKET, thumbnailStoragePath!)).toBe(true);

    // ---- §15 create audit ----
    const createAuditExists = await provider.rowExists("audit_logs", {
      action: "video_created",
      entity_type: "video",
      entity_id: videoId,
    });
    expect(createAuditExists, "video_created audit row must exist").toBe(true);

    // ---- §16 dashboard sync ----
    const proACtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage = await proACtx.newPage();
    await proAPage.goto("/dashboard/videos");
    await expect(proAPage.getByText(content.title)).toBeVisible({ timeout: 10_000 });
    await proACtx.close();

    const proBCtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-b.json`,
    });
    const proBPage = await proBCtx.newPage();
    await proBPage.goto("/dashboard/videos");
    await expect(proBPage.getByText(content.title)).toHaveCount(0);
    await proBPage.close(); // context stays open for later cross-tenant tests

    // ---- §17 hidden/public visibility (item-level is_published gate) ----
    const publicCtx1 = await browser.newContext();
    const publicPage1 = await publicCtx1.newPage();
    await publicPage1.goto(`/portfolio/${proASlug}`);
    await expect(publicPage1.getByText(content.title)).toHaveCount(0);
    await publicCtx1.close();

    // ---- §18 partial edit: description only ----
    await editDescriptionOnly(adminPage, content.title, content.editedDescription);

    // ---- §18/§19 verify partial-edit integrity — unrelated fields preserved ----
    const afterEdit = await provider.getRow("portfolio_videos", { id: videoId });
    expect(afterEdit!["description"]).toBe(content.editedDescription);
    expect(afterEdit!["title"]).toBe(content.title);
    expect(afterEdit!["platform"]).toBe("youtube");
    expect(afterEdit!["video_url"]).toBe(content.youtubeWatchUrl);
    expect(afterEdit!["category"]).toBe(content.category);
    expect(afterEdit!["is_published"]).toBe(false);
    const countAfterEdit = await provider.countRows("portfolio_videos", { id: videoId });
    expect(countAfterEdit, "no duplicate video row from the metadata edit").toBe(1);

    // ---- §19 update audit ----
    const updateAuditExists = await provider.rowExists("audit_logs", {
      action: "video_updated",
      entity_type: "video",
      entity_id: videoId,
    });
    expect(updateAuditExists, "video_updated audit row must exist").toBe(true);

    // ---- §20 URL format transition (same provider, same id, different
    // accepted format: watch?v= -> youtu.be/) ----
    await changeVideoUrlOnly(adminPage, content.title, content.youtubeShortUrl);
    const afterUrlChange = await provider.getRow("portfolio_videos", { id: videoId });
    expect(afterUrlChange!["video_url"]).toBe(content.youtubeShortUrl);
    expect(afterUrlChange!["platform"]).toBe("youtube");
    expect(afterUrlChange!["title"]).toBe(content.title);
    expect(afterUrlChange!["description"]).toBe(content.editedDescription);

    // ---- §21 service association — N/A: no service_id field/column
    // exists for Videos at all (confirmed by audit of VideoInput). No
    // assertion fabricated.

    // ---- §22 sort/reorder — N/A: no reorder UI exists (list orders by
    // created_at only). No assertion fabricated.

    // ---- §23 activate the video (real UI, toggle only) ----
    await togglePublishOnly(adminPage, content.title, true);

    const afterPublish = await provider.getRow("portfolio_videos", { id: videoId });
    expect(afterPublish!["id"]).toBe(videoId);
    expect(afterPublish!["title"]).toBe(content.title);
    expect(afterPublish!["video_url"]).toBe(content.youtubeShortUrl);
    expect(afterPublish!["is_published"]).toBe(true);
    const countAfterPublish = await provider.countRows("portfolio_videos", { id: videoId });
    expect(countAfterPublish, "no duplicate video row after activation").toBe(1);

    // ---- §24/§25/§26 public render — thumbnail card + player-modal embed ----
    const publicCtx2 = await browser.newContext();
    const publicPage2 = await publicCtx2.newPage();
    await publicPage2.goto(`/portfolio/${proASlug}`);
    const playButton = publicPage2.getByRole("button", { name: `Play ${content.title}` });
    await expect(playButton).toBeVisible({ timeout: 10_000 });
    await playButton.click();

    const playerDialog = publicPage2.getByRole("dialog", { name: "Video player" });
    await expect(playerDialog).toBeVisible({ timeout: 10_000 });
    const iframe = playerDialog.locator("iframe");
    await expect(iframe).toBeVisible({ timeout: 10_000 });
    await expect(iframe).toHaveAttribute("src", content.expectedEmbedSrc);
    await expect(iframe).toHaveAttribute("title", content.title);
    await expect(iframe).toHaveAttribute("allowfullscreen", "");
    const allowAttr = await iframe.getAttribute("allow");
    expect(allowAttr, "iframe must carry the app's fixed allow policy").toContain("autoplay");
    await publicCtx2.close();

    // ---- §28/§29 cross-tenant negative tests — Professional B ----
    const preAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: videoId,
      action: "video_updated",
    });
    const preAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: videoId,
      action: "video_deleted",
    });

    const proBClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
    );
    const signIn = await proBClient.auth.signInWithPassword({
      email: requireEnv("QA_PRO_B_EMAIL"),
      password: requireEnv("QA_PRO_B_PASSWORD"),
    });
    expect(signIn.error, "Professional B sign-in must succeed for this test").toBeNull();

    const updateAttempt = await proBClient
      .from("portfolio_videos")
      .update({ title: "QA_E2E_REJECTED_CROSS_TENANT_ATTEMPT" })
      .eq("id", videoId)
      .select();
    expect(updateAttempt.data?.length ?? 0, "cross-tenant update must affect zero rows").toBe(0);

    const deleteAttempt = await proBClient
      .from("portfolio_videos")
      .delete()
      .eq("id", videoId)
      .select();
    expect(deleteAttempt.data?.length ?? 0, "cross-tenant delete must affect zero rows").toBe(0);
    await proBClient.auth.signOut();

    // ---- §30 storage cross-tenant test — N/A for this pilot's chosen
    // provider (youtube): the only storage object is the thumbnail, and
    // its cross-tenant deletion path is already fully proven generically
    // by the Gallery (QA-1H) and Before & After (QA-1I) pilots using the
    // exact same storage RLS policy — not repeated here to avoid
    // over-expanding this pilot's scope.

    const unchangedAfterAttempts = await provider.getRow("portfolio_videos", { id: videoId });
    expect(
      unchangedAfterAttempts,
      "video must still exist after rejected cross-tenant attempts",
    ).not.toBeNull();
    expect(unchangedAfterAttempts!["title"]).toBe(content.title);

    // ---- §38 false-success audit absence ----
    const postAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: videoId,
      action: "video_updated",
    });
    const postAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: videoId,
      action: "video_deleted",
    });
    expect(
      postAttemptUpdateAuditCount,
      "no new video_updated audit row from the rejected attempt",
    ).toBe(preAttemptUpdateAuditCount);
    expect(
      postAttemptDeleteAuditCount,
      "no new video_deleted audit row from the rejected attempt",
    ).toBe(preAttemptDeleteAuditCount);
    await proBCtx.close();

    // ---- §31 admin delete (real UI) ----
    await deleteVideoViaAdmin(adminPage, content.title);

    // ---- §32 delete assertions ----
    const afterDelete = await provider.getRow("portfolio_videos", { id: videoId });
    expect(afterDelete, "video row must be gone after delete").toBeNull();
    await expect(adminPage.getByText(content.title)).toHaveCount(0);

    const proACtx2 = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage2 = await proACtx2.newPage();
    await proAPage2.goto("/dashboard/videos");
    await expect(proAPage2.getByText(content.title)).toHaveCount(0);
    await proACtx2.close();

    const publicCtx3 = await browser.newContext();
    const publicPage3 = await publicCtx3.newPage();
    await publicPage3.goto(`/portfolio/${proASlug}`);
    await expect(publicPage3.getByText(content.title)).toHaveCount(0);
    await publicCtx3.close();

    // ---- storage cleanup: the thumbnail object must be gone too ----
    const thumbnailExistsAfterDelete = await provider.storageObjectExists(
      BUCKET,
      thumbnailStoragePath!,
    );
    expect(
      thumbnailExistsAfterDelete,
      "thumbnail storage object must be deleted by the application after video delete",
    ).toBe(false);

    const proBStillFine = await provider.countRows("portfolio_videos", {
      beautician_profile_id: proBId,
    });
    expect(proBStillFine, "Professional B's video count must be unaffected").toBe(baselineCountB);

    // ---- §33 delete audit ----
    const deleteAuditExists = await provider.rowExists("audit_logs", {
      action: "video_deleted",
      entity_type: "video",
      entity_id: videoId,
    });
    expect(deleteAuditExists, "video_deleted audit row must exist").toBe(true);

    await adminCtx.close();

    // ---- §35 final orphan check ----
    const finalCountA = await provider.countRows("portfolio_videos", {
      beautician_profile_id: proAId,
    });
    expect(finalCountA, "Professional A video count must return to baseline").toBe(baselineCountA);
    const runIdOrphan = await provider.rowExists("portfolio_videos", { title: content.title });
    expect(runIdOrphan, "no video with this runId may remain").toBe(false);
    const finalThumbnailObjects = await provider.listStorageObjects(
      BUCKET,
      `profiles/${proASlug}/video-thumbnails`,
    );
    const newOrphans = finalThumbnailObjects.filter(
      (name) => !baselineThumbnailObjects.includes(name),
    );
    expect(newOrphans, "no new thumbnail storage objects may remain").toEqual([]);
  } finally {
    // Safety-net cleanup — runs regardless of pass/fail above.
    if (videoId) {
      await provider.deleteRow("portfolio_videos", { id: videoId }).catch(() => {});
    }
    if (thumbnailStoragePath) {
      await provider.deleteStorageObject(BUCKET, thumbnailStoragePath).catch(() => {});
    }
    if (invalidAttemptThumbnailPath) {
      await provider.deleteStorageObject(BUCKET, invalidAttemptThumbnailPath).catch(() => {});
    }
    if (profileTemporarilyPublished) {
      await provider.updateRow("beautician_profiles", { id: proAId }, { status: originalStatus });
    }
    if (profileTemporarilyUpgraded) {
      await provider.updateRow("beautician_profiles", { id: proAId }, { plan: originalPlan });
    }
    const restored = await provider.getRow("beautician_profiles", { id: proAId });
    expect(restored!["status"], "Professional A profile status must be restored exactly").toBe(
      originalStatus,
    );
    expect(restored!["plan"], "Professional A plan must be restored exactly").toBe(originalPlan);
  }

  timings.push({ label, ms: Date.now() - start });
}

test.describe
  .serial("Videos automated lifecycle pilot @crud @videos @tenant @audit @storage", () => {
  test("full lifecycle — first run", async ({ browser }) => {
    await runVideoLifecycle(browser, "first lifecycle");
  });

  test("full lifecycle — second run (idempotency / re-run proof)", async ({ browser }) => {
    await runVideoLifecycle(browser, "second lifecycle");
  });

  test.afterAll(() => {
    console.log("Video lifecycle runtime measurements:");
    for (const t of timings) {
      console.log(`  ${t.label}: ${(t.ms / 1000).toFixed(1)}s`);
    }
  });
});

// QA-1J-D2 — regression coverage for the confirmed (QA-1J-D1) and now
// fixed thumbnail-orphan defect. Every assertion below checks the
// APPLICATION's own cleanup via the authoritative Storage API, before any
// QA-side fallback deletion — proving the fix, not just tolerating the
// defect.
test.describe.serial("Videos thumbnail orphan-fix regression @crud @videos @storage", () => {
  // 5-tier entitlements — this whole block creates real video rows via
  // Admin against professional A, so (like the lifecycle describe above)
  // it needs Silver+ for the duration. Handled once for the whole block
  // via beforeAll/afterAll rather than per-test, since every test here
  // targets the same professional and none of them exercise plan behavior
  // itself (that remains entitlements.spec.ts's job).
  let orphanFixOriginalPlan = "free";
  let orphanFixProfileTemporarilyUpgraded = false;

  test.beforeAll(async () => {
    const { provider } = runDestructiveQaPreflight();
    const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) throw new Error("QA professional fixture not found.");
    orphanFixOriginalPlan = (proA["plan"] as string) ?? "free";
    if (orphanFixOriginalPlan !== "silver") {
      await provider.updateRow(
        "beautician_profiles",
        { id: proA["id"] as string },
        { plan: "silver" },
      );
      orphanFixProfileTemporarilyUpgraded = true;
    }
  });

  test.afterAll(async () => {
    if (!orphanFixProfileTemporarilyUpgraded) return;
    const { provider } = runDestructiveQaPreflight();
    const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) return;
    await provider.updateRow(
      "beautician_profiles",
      { id: proA["id"] as string },
      { plan: orphanFixOriginalPlan },
    );
  });

  test("close via X deletes the pending thumbnail (§18)", async ({ browser }) => {
    const start = Date.now();
    const { provider } = runDestructiveQaPreflight();
    const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const page = await ctx.newPage();
    await openVideosTab(page, proASlug);

    const baselineCount = await provider.countRows("portfolio_videos", {});

    await page.getByRole("button", { name: "Add video" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await uploadThumbnail(page);
    const path = await currentThumbnailStoragePath(page);
    expect(
      await provider.storageObjectExists(BUCKET, path),
      "must exist immediately after upload",
    ).toBe(true);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    const countAfter = await provider.countRows("portfolio_videos", {});
    expect(countAfter, "closing without saving must never create a row").toBe(baselineCount);
    // Application-cleanup assertion, BEFORE any fallback deletion (§17/§23).
    // Polled — the cleanup delete is fire-and-forget and may land a short
    // moment after the dialog itself has already closed.
    await expect
      .poll(() => provider.storageObjectExists(BUCKET, path), {
        timeout: 10_000,
        message: "application must delete the pending thumbnail when the dialog is closed via X",
      })
      .toBe(false);

    await ctx.close();
    timings.push({ label: "close/cancel cleanup", ms: Date.now() - start });
  });

  test("replacing a thumbnail before save deletes only the superseded upload (§20)", async ({
    browser,
  }) => {
    const start = Date.now();
    const { provider, runId } = runDestructiveQaPreflight();
    const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
    const title = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_D2Replace`;

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const page = await ctx.newPage();
    await openVideosTab(page, proASlug);

    let videoId: string | null = null;
    let pathC: string | null = null;
    try {
      await page.getByRole("button", { name: "Add video" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await page.getByLabel("Title").fill(title);
      await selectOption(page, "Platform", "youtube");
      await page.getByLabel("Video link").fill("https://www.youtube.com/watch?v=D2RepA000001");

      // Optional multi-replacement (§11/§24), combined here: A -> B -> C.
      await uploadThumbnail(page, THUMBNAIL_FIXTURE);
      const pathA = await currentThumbnailStoragePath(page);
      await changeThumbnail(page, THUMBNAIL_FIXTURE_B);
      const pathB = await currentThumbnailStoragePath(page);
      expect(pathB, "B must be a genuinely different object than A").not.toBe(pathA);
      // §5 — A must already be gone shortly after B becomes pending, well
      // before any save is attempted. Polled: the supersede-delete is
      // fire-and-forget in the app (never blocks the upload flow), so it
      // may land a short moment after the new thumbnail's preview repaints.
      await expect
        .poll(() => provider.storageObjectExists(BUCKET, pathA), {
          timeout: 10_000,
          message: "superseded thumbnail A must be deleted once B is uploaded, before any save",
        })
        .toBe(false);
      expect(await provider.storageObjectExists(BUCKET, pathB), "B must exist").toBe(true);

      await changeThumbnail(page, THUMBNAIL_FIXTURE);
      pathC = await currentThumbnailStoragePath(page);
      expect(pathC, "C must be a genuinely different object than B").not.toBe(pathB);
      await expect
        .poll(() => provider.storageObjectExists(BUCKET, pathB), {
          timeout: 10_000,
          message: "superseded thumbnail B must be deleted once C is uploaded",
        })
        .toBe(false);
      expect(await provider.storageObjectExists(BUCKET, pathC), "C must exist").toBe(true);

      await saveAndExpectSuccess(page, "Save");

      const created = await provider.getRow("portfolio_videos", { title });
      expect(created, "video row must exist").not.toBeNull();
      videoId = created!["id"] as string;
      expect(
        storagePathFromPublicUrl(created!["thumbnail_url"] as string, BUCKET),
        "DB must reference exactly the final uploaded thumbnail (C)",
      ).toBe(pathC);
      expect(
        await provider.storageObjectExists(BUCKET, pathC),
        "C must still exist after save",
      ).toBe(true);

      await deleteVideoViaAdmin(page, title);
      expect(
        await provider.storageObjectExists(BUCKET, pathC),
        "C must be deleted by the normal admin-delete flow",
      ).toBe(false);
      videoId = null;
      pathC = null;
    } finally {
      if (videoId) await provider.deleteRow("portfolio_videos", { id: videoId }).catch(() => {});
      if (pathC) await provider.deleteStorageObject(BUCKET, pathC).catch(() => {});
    }

    await ctx.close();
    timings.push({ label: "replace-before-save", ms: Date.now() - start });
  });

  test("edit: cancelling after a thumbnail replacement preserves the original (§22)", async ({
    browser,
  }) => {
    const start = Date.now();
    const { provider, runId } = runDestructiveQaPreflight();
    const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
    const title = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_D2EditCancel`;

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const page = await ctx.newPage();
    await openVideosTab(page, proASlug);

    let videoId: string | null = null;
    let oldPath: string | null = null;
    let newPath: string | null = null;
    try {
      await createVideoViaAdmin(page, {
        title,
        videoUrl: "https://www.youtube.com/watch?v=D2EditCancel1",
        category: "Bridal",
      });
      const created = await provider.getRow("portfolio_videos", { title });
      videoId = created!["id"] as string;
      oldPath = storagePathFromPublicUrl(created!["thumbnail_url"] as string, BUCKET);
      expect(oldPath, "OLD persisted thumbnail path must resolve").not.toBeNull();

      await videoCard(page, title).getByRole("button", { name: "Edit" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await changeThumbnail(page, THUMBNAIL_FIXTURE_B);
      newPath = await currentThumbnailStoragePath(page);
      expect(newPath, "NEW must differ from OLD").not.toBe(oldPath);
      expect(await provider.storageObjectExists(BUCKET, oldPath!), "OLD must still exist").toBe(
        true,
      );
      expect(await provider.storageObjectExists(BUCKET, newPath), "NEW must exist").toBe(true);

      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      const unchanged = await provider.getRow("portfolio_videos", { id: videoId });
      expect(unchanged!["thumbnail_url"], "DB must still reference OLD after cancelling").toBe(
        created!["thumbnail_url"],
      );
      expect(await provider.storageObjectExists(BUCKET, oldPath!), "OLD must remain").toBe(true);
      // Polled — the cleanup delete is fire-and-forget and may land a
      // short moment after the dialog itself has already closed.
      await expect
        .poll(() => provider.storageObjectExists(BUCKET, newPath!), {
          timeout: 10_000,
          message: "NEW (abandoned replacement) must be deleted by the application",
        })
        .toBe(false);
      newPath = null;

      await deleteVideoViaAdmin(page, title);
      videoId = null;
      oldPath = null;
    } finally {
      if (videoId) await provider.deleteRow("portfolio_videos", { id: videoId }).catch(() => {});
      if (oldPath) await provider.deleteStorageObject(BUCKET, oldPath).catch(() => {});
      if (newPath) await provider.deleteStorageObject(BUCKET, newPath).catch(() => {});
    }
    await ctx.close();
    timings.push({ label: "edit-cancel replacement", ms: Date.now() - start });
  });

  test("edit: a successful thumbnail replacement deletes the old object (§23)", async ({
    browser,
  }) => {
    const { provider, runId } = runDestructiveQaPreflight();
    const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
    const title = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_D2EditSuccess`;

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const page = await ctx.newPage();
    await openVideosTab(page, proASlug);

    let videoId: string | null = null;
    let newPath: string | null = null;
    try {
      await createVideoViaAdmin(page, {
        title,
        videoUrl: "https://www.youtube.com/watch?v=D2EditSucces",
        category: "Bridal",
      });
      const created = await provider.getRow("portfolio_videos", { title });
      videoId = created!["id"] as string;
      const oldPath = storagePathFromPublicUrl(created!["thumbnail_url"] as string, BUCKET);

      await videoCard(page, title).getByRole("button", { name: "Edit" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await changeThumbnail(page, THUMBNAIL_FIXTURE_B);
      newPath = await currentThumbnailStoragePath(page);
      await saveAndExpectSuccess(page, "Save");

      const afterUpdate = await provider.getRow("portfolio_videos", { id: videoId });
      expect(afterUpdate!["id"], "same Video ID must be preserved").toBe(videoId);
      expect(
        storagePathFromPublicUrl(afterUpdate!["thumbnail_url"] as string, BUCKET),
        "DB must now reference NEW",
      ).toBe(newPath);
      expect(await provider.storageObjectExists(BUCKET, newPath), "NEW must exist").toBe(true);
      expect(
        await provider.storageObjectExists(BUCKET, oldPath!),
        "OLD must be deleted after a successful replacement (existing behavior, preserved)",
      ).toBe(false);

      await deleteVideoViaAdmin(page, title);
      expect(
        await provider.storageObjectExists(BUCKET, newPath),
        "NEW must be gone after delete",
      ).toBe(false);
      videoId = null;
      newPath = null;
    } finally {
      if (videoId) await provider.deleteRow("portfolio_videos", { id: videoId }).catch(() => {});
      if (newPath) await provider.deleteStorageObject(BUCKET, newPath).catch(() => {});
    }
    await ctx.close();
  });
});
