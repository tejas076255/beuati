// QA-1H — fourth automated business-CRUD pilot, and the FIRST
// storage-backed module: the Admin Gallery lifecycle. DESTRUCTIVE.
// Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:gallery` / `test:e2e:qa:crud` scripts.
//
// Audited architecture (src/data/dashboard/gallery.server.ts,
// src/lib/storage-upload.ts, supabase/migrations/20260821054621_
// portfolio_media_storage_policies.sql), re-confirmed live for QA-1H:
// - Logical Gallery item = `portfolio_items` (title, category, is_published,
//   service_id, sort_order); each item has 1..n `portfolio_images` rows
//   (storage_path, alt_text, sort_order, is_cover). Visibility is on the
//   ITEM only — no per-image visibility column.
// - Bucket `portfolio-media`, path `profiles/{slug}/{category}/
//   {Date.now()}-{safeFilename}` (uploadPortfolioMedia). No sort/reorder UI
//   exists — sort_order is append-only at insert time (N/A for this pilot).
// - Public URL is DERIVED at render time (getPublicUrl / direct
//   .../storage/v1/object/public/{bucket}/{path} construction), never
//   persisted to the DB.
// - Storage RLS (public read; owner-scoped insert/delete keyed by
//   `(storage.foldername(name))[2]` = the profile SLUG, with an admin
//   bypass) is the real ownership boundary for storage.objects — this is
//   the first pilot able to test it directly.
// - Storage delete on item-delete is NOT handled by dashboard/gallery.
//   server.ts — deletePortfolioItemForProfile only deletes the DB rows and
//   returns the image storage_paths; the CLIENT component
//   (gallery-manager.tsx's `remove` mutation) is responsible for actually
//   calling deletePortfolioMedia() for each image after the DB delete
//   succeeds. This test verifies that end-to-end behavior actually holds.
import { type Browser, type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import {
  buildQaGalleryContent,
  runDestructiveQaPreflight,
} from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";
import { saveAndExpectFailure, saveAndExpectSuccess } from "../../helpers/ui/save-dialog.ts";
import { httpCheck, ownerSlugFromStoragePath } from "../../helpers/media/storage-checks.ts";

const AUTH_DIR = "playwright/.auth";
const BUCKET = "portfolio-media";
const FIXTURE_IMAGE = fileURLToPath(
  new URL("../../fixtures/images/qa-gallery.png", import.meta.url),
);
// QA-1M — reused only as a second, distinguishable file for the multi-file
// partial-upload-failure regression; category is irrelevant to Storage, only
// the filename needs to differ so a route matcher can target it specifically.
const SECOND_FIXTURE_IMAGE = fileURLToPath(
  new URL("../../fixtures/images/qa-before.png", import.meta.url),
);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function openGalleryTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
}

function galleryDialogFileInput(page: Page) {
  return page.getByRole("dialog").locator('input[type="file"]');
}

function galleryCard(page: Page, title: string) {
  return page
    .locator(".rounded-2xl.border.border-border.bg-card.shadow-soft")
    .filter({ hasText: title });
}

// QA-1M — every admin-side mutation (create/update/delete) is a TanStack
// Start server function, called from the browser as an opaque
// `POST /_serverFn/{base64({file,export})}` — never a direct browser-to-
// Supabase-REST call (only the Storage upload itself is direct). Confirmed
// live via a request listener during this phase's investigation. To
// fault-inject one specific DB mutation from Playwright, the export name
// has to be decoded out of that base64 segment; matching on `/rest/v1/...`
// (as the app's *server-side* Supabase calls would suggest) never
// intercepts anything, since those calls never reach the browser's network
// stack.
function isServerFnCall(url: string, exportNameSubstring: string): boolean {
  const match = /\/_serverFn\/([^/?]+)/.exec(url);
  const segment = match?.[1];
  if (!segment) return false;
  try {
    return Buffer.from(segment, "base64").toString("utf-8").includes(exportNameSubstring);
  } catch {
    return false;
  }
}

async function createGalleryItemViaAdmin(
  page: Page,
  fields: { title: string; imagePath: string },
): Promise<void> {
  await page.getByRole("button", { name: "Add item" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Title").fill(fields.title);
  // Category and Related service default to "bridal" / "No specific
  // service" respectively — left untouched, matching the phase's preferred
  // no-service-link first-pilot path (§19).
  await galleryDialogFileInput(page).setInputFiles(fields.imagePath);
  const activeSwitch = page.getByLabel("Show on portfolio");
  await activeSwitch.uncheck(); // initial hidden state, per §10
  await saveAndExpectSuccess(page, "Add item");
}

async function editPhotoDescription(page: Page, title: string, newAltText: string): Promise<void> {
  await galleryCard(page, title).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByPlaceholder("Describe this photo…").fill(newAltText);
  await dialog.getByRole("button", { name: "Save description" }).click();
  // The per-image description save does not close the dialog (it's a
  // separate inline mutation, not the item form's own onSuccess) — its
  // unique toast text is the only reliable success signal here.
  await expect(page.getByText("Photo description saved")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function togglePublishOnly(page: Page, title: string, active: boolean): Promise<void> {
  await galleryCard(page, title).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const activeSwitch = page.getByLabel("Show on portfolio");
  if (active) {
    await activeSwitch.check();
  } else {
    await activeSwitch.uncheck();
  }
  await saveAndExpectSuccess(page, "Save changes");
}

async function deleteGalleryItemViaAdmin(page: Page, title: string): Promise<void> {
  page.once("dialog", (dialog) => void dialog.accept());
  await galleryCard(page, title).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 10_000 });
}

interface LifecycleTiming {
  label: string;
  ms: number;
}
const timings: LifecycleTiming[] = [];

async function runGalleryLifecycle(browser: Browser, label: string): Promise<void> {
  const start = Date.now();
  const { provider, runId } = runDestructiveQaPreflight();
  const content = buildQaGalleryContent(runId);
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
  const baselineItemCountA = await provider.countRows("portfolio_items", {
    beautician_profile_id: proAId,
  });
  const baselineItemCountB = await provider.countRows("portfolio_items", {
    beautician_profile_id: proBId,
  });
  const baselineStorageObjects = await provider.listStorageObjects(
    BUCKET,
    `profiles/${proASlug}/gallery`,
  );
  const preexisting = await provider.rowExists("portfolio_items", { title: content.title });
  expect(preexisting, "no gallery item matching this runId should pre-exist").toBe(false);

  let itemId: string | null = null;
  let imageId: string | null = null;
  let uploadedStoragePath: string | null = null;
  let profileTemporarilyPublished = false;

  try {
    // ---- fixture prerequisite: make Professional A's public page reachable ----
    if (originalStatus !== "published") {
      await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
      profileTemporarilyPublished = true;
    }

    // ---- §10 Admin creates a hidden Gallery item with a real upload (real UI) ----
    const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const adminPage = await adminCtx.newPage();
    await openGalleryTab(adminPage, proASlug);
    await createGalleryItemViaAdmin(adminPage, {
      title: content.title,
      imagePath: FIXTURE_IMAGE,
    });

    // ---- §12 DB create assertions ----
    const createdItem = await provider.getRow("portfolio_items", { title: content.title });
    expect(createdItem, "created gallery item row must exist").not.toBeNull();
    itemId = createdItem!["id"] as string;
    expect(createdItem!["beautician_profile_id"]).toBe(proAId);
    expect(createdItem!["category"]).toBe(content.category);
    expect(createdItem!["service_id"]).toBeNull();
    expect(createdItem!["is_published"]).toBe(false);
    const sortOrderAfterCreate = createdItem!["sort_order"];

    const createdImage = await provider.getRow("portfolio_images", { portfolio_item_id: itemId });
    expect(createdImage, "created gallery image row must exist").not.toBeNull();
    imageId = createdImage!["id"] as string;
    uploadedStoragePath = createdImage!["storage_path"] as string;
    expect(createdImage!["alt_text"]).toBe(content.title);
    expect(createdImage!["is_cover"]).toBe(true);
    const imageSortOrder = createdImage!["sort_order"];

    const proBHasIt = await provider.rowExists("portfolio_items", {
      beautician_profile_id: proBId,
      title: content.title,
    });
    expect(proBHasIt, "Professional B must not have a matching gallery item").toBe(false);

    // ---- §11 storage assertion after upload ----
    expect(uploadedStoragePath.startsWith(`profiles/${proASlug}/gallery/`)).toBe(true);
    expect(ownerSlugFromStoragePath(uploadedStoragePath)).toBe(proASlug);
    expect(ownerSlugFromStoragePath(uploadedStoragePath)).not.toBe(proBSlug);
    const objectExists = await provider.storageObjectExists(BUCKET, uploadedStoragePath);
    expect(objectExists, "uploaded storage object must exist").toBe(true);

    // ---- §13 public/storage URL assertion (public bucket permits a
    // direct GET even while the item is unpublished — visibility is an
    // application-level filter, not a storage-level one) ----
    const publicUrl = `${requireEnv("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/${uploadedStoragePath}`;
    const uploadCheck = await httpCheck(publicUrl);
    expect(uploadCheck.ok, "uploaded object must be fetchable via its public URL").toBe(true);
    expect(uploadCheck.contentType).toMatch(/^image\//);

    // ---- §14 create audit ----
    const createAuditExists = await provider.rowExists("audit_logs", {
      action: "gallery_item_created",
      entity_type: "gallery_item",
      entity_id: itemId,
    });
    expect(createAuditExists, "gallery_item_created audit row must exist").toBe(true);

    // ---- §15 dashboard sync ----
    const proACtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage = await proACtx.newPage();
    await proAPage.goto("/dashboard/gallery");
    await expect(proAPage.getByText(content.title)).toBeVisible({ timeout: 10_000 });
    await proACtx.close();

    const proBCtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-b.json`,
    });
    const proBPage = await proBCtx.newPage();
    await proBPage.goto("/dashboard/gallery");
    await expect(proBPage.getByText(content.title)).toHaveCount(0);
    await proBPage.close(); // context stays open for later cross-tenant tests

    // ---- §16 hidden/public visibility (item-level is_published gate) ----
    const publicCtx1 = await browser.newContext();
    const publicPage1 = await publicCtx1.newPage();
    await publicPage1.goto(`/portfolio/${proASlug}`);
    await expect(publicPage1.getByAltText(content.title)).toHaveCount(0);
    await publicCtx1.close();

    // ---- §17 partial edit: photo description (alt text) only ----
    await editPhotoDescription(adminPage, content.title, `${content.title} edited description`);

    // ---- §17/§18 verify partial-edit integrity — unrelated fields/path preserved ----
    const afterEdit = await provider.getRow("portfolio_images", { id: imageId });
    expect(afterEdit!["alt_text"]).toBe(`${content.title} edited description`);
    expect(afterEdit!["storage_path"], "storage path must remain unchanged").toBe(
      uploadedStoragePath,
    );
    expect(afterEdit!["is_cover"]).toBe(true);
    expect(afterEdit!["sort_order"]).toBe(imageSortOrder);
    const imageCountAfterEdit = await provider.countRows("portfolio_images", {
      portfolio_item_id: itemId,
    });
    expect(imageCountAfterEdit, "no duplicate storage/image row created by the edit").toBe(1);

    const itemAfterEdit = await provider.getRow("portfolio_items", { id: itemId });
    expect(itemAfterEdit!["title"]).toBe(content.title);
    expect(itemAfterEdit!["category"]).toBe(content.category);
    expect(itemAfterEdit!["service_id"]).toBeNull();
    expect(itemAfterEdit!["is_published"]).toBe(false);
    expect(itemAfterEdit!["sort_order"]).toBe(sortOrderAfterCreate);

    // ---- §18 update audit (alt-text edit logs entity_id = imageId) ----
    const updateAuditExists = await provider.rowExists("audit_logs", {
      action: "gallery_item_updated",
      entity_type: "gallery_item",
      entity_id: imageId,
    });
    expect(updateAuditExists, "gallery_item_updated audit row must exist").toBe(true);

    // ---- §20 sort/reorder: audited N/A — no reorder UI exists in the
    // current Gallery implementation (sort_order is append-only at
    // insert). No assertion fabricated here.

    // ---- §21 activate the item (real UI, toggle only) ----
    await togglePublishOnly(adminPage, content.title, true);

    const afterPublish = await provider.getRow("portfolio_items", { id: itemId });
    expect(afterPublish!["id"]).toBe(itemId);
    expect(afterPublish!["title"]).toBe(content.title);
    expect(afterPublish!["category"]).toBe(content.category);
    expect(afterPublish!["is_published"]).toBe(true);
    const countAfterPublish = await provider.countRows("portfolio_items", { id: itemId });
    expect(countAfterPublish, "no duplicate gallery item row").toBe(1);

    // ---- §21/§22 public gallery render + browser image-load assertion ----
    const publicCtx2 = await browser.newContext();
    const publicPage2 = await publicCtx2.newPage();
    await publicPage2.goto(`/portfolio/${proASlug}`);
    // The mobile mosaic markup renders first in DOM order but is
    // CSS-hidden at the desktop viewport this suite runs under — the
    // desktop grid's copy (last in DOM order) is the one actually visible.
    const publicImg = publicPage2.getByAltText(content.title).last();
    await expect(publicImg).toBeVisible({ timeout: 10_000 });
    const renderedSrc = await publicImg.getAttribute("src");
    expect(renderedSrc, "rendered <img> must have a src").toBeTruthy();
    expect(renderedSrc).toContain(uploadedStoragePath);

    const naturalWidth = await publicImg.evaluate((el) => (el as HTMLImageElement).naturalWidth);
    expect(naturalWidth, "browser must successfully decode the rendered image").toBeGreaterThan(0);
    await publicCtx2.close();

    // ---- §23/§24/§25 cross-tenant negative tests — Professional B ----
    const preAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: itemId,
      action: "gallery_item_updated",
    });
    const preAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: itemId,
      action: "gallery_item_deleted",
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

    // §23 cross-tenant update rejection
    const updateAttempt = await proBClient
      .from("portfolio_items")
      .update({ title: "QA_E2E_REJECTED_CROSS_TENANT_ATTEMPT" })
      .eq("id", itemId)
      .select();
    expect(updateAttempt.data?.length ?? 0, "cross-tenant item update must affect zero rows").toBe(
      0,
    );

    // §24 cross-tenant delete rejection
    const deleteAttempt = await proBClient
      .from("portfolio_items")
      .delete()
      .eq("id", itemId)
      .select();
    expect(deleteAttempt.data?.length ?? 0, "cross-tenant item delete must affect zero rows").toBe(
      0,
    );

    // §25 storage RLS ownership negative — HIGH VALUE for the first
    // storage-backed module: Professional B's own session must not be able
    // to delete Professional A's QA storage object directly.
    const storageDeleteAttempt = await proBClient.storage
      .from(BUCKET)
      .remove([uploadedStoragePath]);
    const objectStillExistsAfterAttempt = await provider.storageObjectExists(
      BUCKET,
      uploadedStoragePath,
    );
    expect(
      objectStillExistsAfterAttempt,
      "storage object must survive a cross-tenant delete attempt",
    ).toBe(true);
    expect(
      storageDeleteAttempt.data?.length ?? 0,
      "cross-tenant storage delete must not report any object removed",
    ).toBe(0);

    await proBClient.auth.signOut();

    const unchangedAfterAttempts = await provider.getRow("portfolio_items", { id: itemId });
    expect(
      unchangedAfterAttempts,
      "gallery item must still exist after rejected cross-tenant attempts",
    ).not.toBeNull();
    expect(unchangedAfterAttempts!["title"]).toBe(content.title);

    // ---- §34 false-success audit absence ----
    const postAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: itemId,
      action: "gallery_item_updated",
    });
    const postAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: itemId,
      action: "gallery_item_deleted",
    });
    expect(
      postAttemptUpdateAuditCount,
      "no new gallery_item_updated audit row from the rejected attempt",
    ).toBe(preAttemptUpdateAuditCount);
    expect(
      postAttemptDeleteAuditCount,
      "no new gallery_item_deleted audit row from the rejected attempt",
    ).toBe(preAttemptDeleteAuditCount);
    await proBCtx.close();

    // ---- §26 admin delete (real UI) ----
    await deleteGalleryItemViaAdmin(adminPage, content.title);

    // ---- §27 delete DB assertions (no dangling child rows) ----
    const afterDeleteItem = await provider.getRow("portfolio_items", { id: itemId });
    expect(afterDeleteItem, "gallery item row must be gone after delete").toBeNull();
    const afterDeleteImage = await provider.getRow("portfolio_images", { id: imageId });
    expect(afterDeleteImage, "gallery image row must be gone after delete").toBeNull();

    // ---- §28 delete storage assertion — CRITICAL. The current UI is
    // expected to delete the storage object itself after the DB delete
    // succeeds (gallery-manager.tsx's `remove` mutation). If this ever
    // stops holding, that is a real product/storage defect, not something
    // to normalize away here. ----
    const objectExistsAfterDelete = await provider.storageObjectExists(BUCKET, uploadedStoragePath);
    expect(
      objectExistsAfterDelete,
      "uploaded storage object must be deleted by the application after item delete",
    ).toBe(false);

    // ---- §29 public/dashboard cleanup ----
    await expect(adminPage.getByText(content.title)).toHaveCount(0);

    const proACtx2 = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage2 = await proACtx2.newPage();
    await proAPage2.goto("/dashboard/gallery");
    await expect(proAPage2.getByText(content.title)).toHaveCount(0);
    await proACtx2.close();

    const publicCtx3 = await browser.newContext();
    const publicPage3 = await publicCtx3.newPage();
    await publicPage3.goto(`/portfolio/${proASlug}`);
    await expect(publicPage3.getByAltText(content.title)).toHaveCount(0);
    await publicCtx3.close();

    // §40 image URL post-delete — the authoritative signal that the object
    // is actually gone is the Storage API listing above
    // (objectExistsAfterDelete, already asserted false), not the public
    // CDN URL: uploads are sent with `cacheControl: "3600"`, so Supabase's
    // storage CDN may keep serving a cached 200 for the deleted object's
    // URL for up to an hour after deletion — this is expected CDN cache
    // behavior, not evidence the underlying object still exists. Logged
    // for visibility, not asserted as pass/fail.
    const postDeleteCheck = await httpCheck(publicUrl);
    console.log(
      `[gallery] post-delete public URL check: ok=${postDeleteCheck.ok} status=${postDeleteCheck.status} (CDN cache may still serve a 200 briefly; storage API confirmed the object itself is gone)`,
    );

    const proBStillFine = await provider.countRows("portfolio_items", {
      beautician_profile_id: proBId,
    });
    expect(proBStillFine, "Professional B's gallery item count must be unaffected").toBe(
      baselineItemCountB,
    );

    // ---- §30 delete audit ----
    const deleteAuditExists = await provider.rowExists("audit_logs", {
      action: "gallery_item_deleted",
      entity_type: "gallery_item",
      entity_id: itemId,
    });
    expect(deleteAuditExists, "gallery_item_deleted audit row must exist").toBe(true);

    await adminCtx.close();

    // ---- §32 final DB / storage orphan check ----
    const finalCountA = await provider.countRows("portfolio_items", {
      beautician_profile_id: proAId,
    });
    expect(finalCountA, "Professional A gallery item count must return to baseline").toBe(
      baselineItemCountA,
    );
    const runIdOrphan = await provider.rowExists("portfolio_items", { title: content.title });
    expect(runIdOrphan, "no gallery item with this runId may remain").toBe(false);
    const finalStorageObjects = await provider.listStorageObjects(
      BUCKET,
      `profiles/${proASlug}/gallery`,
    );
    const newOrphans = finalStorageObjects.filter((name) => !baselineStorageObjects.includes(name));
    expect(
      newOrphans,
      "no new storage objects may remain under Professional A's gallery path",
    ).toEqual([]);
  } finally {
    // Safety-net cleanup — runs regardless of pass/fail above.
    if (itemId) {
      await provider.deleteRow("portfolio_items", { id: itemId }).catch(() => {});
    }
    if (uploadedStoragePath) {
      await provider.deleteStorageObject(BUCKET, uploadedStoragePath).catch(() => {});
    }
    if (profileTemporarilyPublished) {
      await provider.updateRow("beautician_profiles", { id: proAId }, { status: originalStatus });
    }
    const restored = await provider.getRow("beautician_profiles", { id: proAId });
    expect(restored!["status"], "Professional A profile status must be restored exactly").toBe(
      originalStatus,
    );
  }

  timings.push({ label, ms: Date.now() - start });
}

test.describe
  .serial("Gallery automated lifecycle pilot @crud @gallery @tenant @audit @storage", () => {
  test("full lifecycle — first run", async ({ browser }) => {
    await runGalleryLifecycle(browser, "first lifecycle");
  });

  test("full lifecycle — second run (idempotency / re-run proof)", async ({ browser }) => {
    await runGalleryLifecycle(browser, "second lifecycle");
  });

  test.afterAll(() => {
    console.log("Gallery lifecycle runtime measurements:");
    for (const t of timings) {
      console.log(`  ${t.label}: ${(t.ms / 1000).toFixed(1)}s`);
    }
  });
});

// QA-1M — save-failure compensation regressions (gallery-manager.tsx's
// `save` mutation, §4-§7 of the phase). Fault injection is Playwright
// `page.route()` network interception scoped to this test's own browser
// context — it exists only inside this test process, is never reachable by
// a real user, requires no production feature flag, alters no schema/RLS,
// and is automatically gone the instant the context closes. Every
// assertion below reads Storage/DB state via the same authoritative
// provider APIs used by the lifecycle pilot above, BEFORE this file's own
// `finally`-block fallback cleanup ever runs — proving APPLICATION
// cleanup, not QA-harness cleanup.
test.describe("Gallery save-failure compensation regression @crud @gallery @storage", () => {
  test("upload succeeds, then Gallery create fails — application deletes the uploaded object (§21A)", async ({
    browser,
  }) => {
    const { provider, runId } = runDestructiveQaPreflight();
    const content = buildQaGalleryContent(runId);
    const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;

    const baselineStorageObjects = await provider.listStorageObjects(
      BUCKET,
      `profiles/${proASlug}/gallery`,
    );
    const baselineItemCount = await provider.countRows("portfolio_items", {
      beautician_profile_id: proAId,
    });

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const page = await ctx.newPage();
    try {
      await openGalleryTab(page, proASlug);
      await page.getByRole("button", { name: "Add item" }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await page.getByLabel("Title").fill(content.title);
      await galleryDialogFileInput(page).setInputFiles(FIXTURE_IMAGE);

      // Force the DB create (createGalleryItemAdminFn server function) to
      // fail — the upload itself is left completely real, so a genuine
      // object lands in Storage before this fault fires.
      await page.route("**/_serverFn/**", async (route) => {
        const isTarget =
          route.request().method() === "POST" &&
          isServerFnCall(route.request().url(), "createGalleryItemAdminFn");
        if (isTarget) {
          // route.fulfill() with a synthetic body is silently treated as a
          // successful response by the server-function RPC client (it
          // doesn't appear to check HTTP status), so this uses a genuine
          // network-level failure instead — the same shape a real dropped
          // connection or upstream 502 would produce, which the client's
          // fetch call actually rejects on.
          await route.abort("failed");
          return;
        }
        await route.continue();
      });

      const errorMsg = await saveAndExpectFailure(page, "Add item");
      console.log(`[gallery §21A] save-failure toast: ${errorMsg}`);
      await page.unroute("**/_serverFn/**");

      // No DB row for this failed attempt.
      const itemExists = await provider.rowExists("portfolio_items", { title: content.title });
      expect(itemExists, "no gallery item row from a failed create attempt").toBe(false);
      const countUnchanged = await provider.countRows("portfolio_items", {
        beautician_profile_id: proAId,
      });
      expect(countUnchanged, "gallery item count must remain at baseline").toBe(baselineItemCount);

      // Application must have already deleted the uploaded object by the
      // time the error toast rendered (compensation is awaited inside the
      // mutationFn's catch, before it rethrows) — polled defensively.
      await expect
        .poll(
          async () => {
            const current = await provider.listStorageObjects(
              BUCKET,
              `profiles/${proASlug}/gallery`,
            );
            return current.filter((name) => !baselineStorageObjects.includes(name));
          },
          {
            timeout: 10_000,
            message: "uploaded object from the failed create attempt must be deleted",
          },
        )
        .toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("multi-file: second upload fails — application deletes the first file's already-uploaded object (§21B)", async ({
    browser,
  }) => {
    const { provider, runId } = runDestructiveQaPreflight();
    const content = buildQaGalleryContent(runId);
    const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;

    const baselineStorageObjects = await provider.listStorageObjects(
      BUCKET,
      `profiles/${proASlug}/gallery`,
    );
    const baselineItemCount = await provider.countRows("portfolio_items", {
      beautician_profile_id: proAId,
    });

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const page = await ctx.newPage();
    try {
      await openGalleryTab(page, proASlug);
      await page.getByRole("button", { name: "Add item" }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await page.getByLabel("Title").fill(content.title);
      // Two files selected — the sequential upload loop uploads
      // qa-gallery.png first (succeeds for real), then qa-before.png
      // second (intercepted to fail).
      await galleryDialogFileInput(page).setInputFiles([FIXTURE_IMAGE, SECOND_FIXTURE_IMAGE]);

      await page.route("**/storage/v1/object/**", async (route) => {
        const url = route.request().url();
        if (route.request().method() === "POST" && url.includes("qa-before")) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              message: "QA_FAULT_INJECTION: simulated second-file upload failure",
            }),
          });
          return;
        }
        await route.continue();
      });

      const errorMsg = await saveAndExpectFailure(page, "Add item");
      console.log(`[gallery §21B] save-failure toast: ${errorMsg}`);
      await page.unroute("**/storage/v1/object/**");

      const itemExists = await provider.rowExists("portfolio_items", { title: content.title });
      expect(itemExists, "no gallery item row from a failed create attempt").toBe(false);
      const countUnchanged = await provider.countRows("portfolio_items", {
        beautician_profile_id: proAId,
      });
      expect(countUnchanged, "gallery item count must remain at baseline").toBe(baselineItemCount);

      // The FIRST file's real upload must be deleted by the application's
      // attempt-scoped compensation; the second file never uploaded at all
      // (its own request was the one intercepted to fail).
      await expect
        .poll(
          async () => {
            const current = await provider.listStorageObjects(
              BUCKET,
              `profiles/${proASlug}/gallery`,
            );
            return current.filter((name) => !baselineStorageObjects.includes(name));
          },
          {
            timeout: 10_000,
            message:
              "the first file's uploaded object must be deleted after the second file's upload fails",
          },
        )
        .toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
