// QA-1I — fifth automated business-CRUD pilot, and the SECOND
// storage-backed module: the Admin Before & After lifecycle. DESTRUCTIVE.
// Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:before-after` / `test:e2e:qa:crud` scripts.
//
// Audited architecture (src/data/dashboard/before-after.server.ts,
// src/components/before-after/before-after-manager.tsx), re-confirmed live
// for QA-1I:
// - This is NOT Gallery: one `before_after_items` parent row always gets
//   EXACTLY two `before_after_images` children created together at create
//   time (image_type: "before" | "after", both sort_order 0). There is no
//   "add more images" flow — editing a side calls replaceBeforeAfterImage
//   (uploads the NEW object, points the DB row at it, THEN deletes the OLD
//   object), never delete+recreate.
// - Storage path uses the SAME "before-after" category folder for both
//   sides — `profiles/{slug}/before-after/{timestamp}-{filename}` — the
//   role (before/after) is NOT encoded in the path, only in the DB row's
//   `image_type` column. This is why role-swap detection must be proven
//   via the DB mapping and the rendered <img src>, never inferred from path
//   alone.
// - Public alt text is deterministic and ROLE-SPECIFIC when alt_text is
//   null (always true at creation — the create path never sets it):
//   `Before ${title.toLowerCase()} transformation` /
//   `After ${title.toLowerCase()} transformation by ${professionalName}`
//   (buildBeforeAfterAlt in src/lib/media-alt-text.ts) — a second,
//   independent signal for proving the before/after mapping was not
//   swapped, on top of the <img src> -> storage_path check.
import { type Browser, type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import {
  buildQaBeforeAfterContent,
  runDestructiveQaPreflight,
} from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";
import { saveAndExpectSuccess } from "../../helpers/ui/save-dialog.ts";
import { httpCheck, ownerSlugFromStoragePath } from "../../helpers/media/storage-checks.ts";

const AUTH_DIR = "playwright/.auth";
const BUCKET = "portfolio-media";
const BEFORE_FIXTURE = fileURLToPath(
  new URL("../../fixtures/images/qa-before.png", import.meta.url),
);
const AFTER_FIXTURE = fileURLToPath(new URL("../../fixtures/images/qa-after.png", import.meta.url));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function openBeforeAfterTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Before & After", exact: true }).click();
}

function pairCard(page: Page, title: string) {
  const deleteBtn = page.getByLabel(`Delete ${title}`);
  return deleteBtn.locator("xpath=ancestor::*[contains(@class,'overflow-hidden')][1]");
}

function dropzoneFileInput(page: Page, label: "Before image" | "After image") {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::div[1]")
    .locator('input[type="file"]');
}

async function createPairViaAdmin(
  page: Page,
  fields: { title: string; eventType: string; location: string },
): Promise<void> {
  await page.getByRole("button", { name: "Add Before & After" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Title").fill(fields.title);
  await page.getByLabel("Category").fill(fields.eventType);
  await page.getByLabel("Location").fill(fields.location);
  await dropzoneFileInput(page, "Before image").setInputFiles(BEFORE_FIXTURE);
  await dropzoneFileInput(page, "After image").setInputFiles(AFTER_FIXTURE);
  const activeSwitch = page.getByLabel("Show this transformation on the portfolio");
  await activeSwitch.uncheck(); // initial hidden state, per §10
  await saveAndExpectSuccess(page, "Add pair");
}

async function editDescriptionOnly(
  page: Page,
  title: string,
  newDescription: string,
): Promise<void> {
  await pairCard(page, title).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Description (optional)").fill(newDescription);
  await saveAndExpectSuccess(page, "Save changes");
}

async function togglePublishOnly(page: Page, title: string, active: boolean): Promise<void> {
  await pairCard(page, title).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const activeSwitch = page.getByLabel("Show this transformation on the portfolio");
  if (active) {
    await activeSwitch.check();
  } else {
    await activeSwitch.uncheck();
  }
  await saveAndExpectSuccess(page, "Save changes");
}

async function deletePairViaAdmin(page: Page, title: string): Promise<void> {
  page.once("dialog", (dialog) => void dialog.accept());
  await pairCard(page, title).getByLabel(`Delete ${title}`).click();
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 10_000 });
}

interface LifecycleTiming {
  label: string;
  ms: number;
}
const timings: LifecycleTiming[] = [];

async function runBeforeAfterLifecycle(browser: Browser, label: string): Promise<void> {
  const start = Date.now();
  const { provider, runId } = runDestructiveQaPreflight();
  const content = buildQaBeforeAfterContent(runId);
  const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
  const proBSlug = beautyfolioProject.qaIdentities.professionalB.slug;

  const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
  const proB = await provider.getRow("beautician_profiles", { slug: proBSlug });
  if (!proA || !proB)
    throw new Error("QA professional fixtures not found — run qa:provision-identities first.");
  const proAId = proA["id"] as string;
  const proBId = proB["id"] as string;
  const professionalDisplayName = proA["display_name"] as string;
  expect(proAId, "Professional A and B must be distinct").not.toBe(proBId);

  const originalStatus = proA["status"] as string;
  const baselineParentCountA = await provider.countRows("before_after_items", {
    beautician_profile_id: proAId,
  });
  const baselineParentCountB = await provider.countRows("before_after_items", {
    beautician_profile_id: proBId,
  });
  const baselineStorageObjects = await provider.listStorageObjects(
    BUCKET,
    `profiles/${proASlug}/before-after`,
  );
  const preexisting = await provider.rowExists("before_after_items", { title: content.title });
  expect(preexisting, "no before/after item matching this runId should pre-exist").toBe(false);

  let itemId: string | null = null;
  let beforeStoragePath: string | null = null;
  let afterStoragePath: string | null = null;
  let profileTemporarilyPublished = false;

  try {
    // ---- fixture prerequisite: make Professional A's public page reachable ----
    if (originalStatus !== "published") {
      await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
      profileTemporarilyPublished = true;
    }

    // ---- §10 Admin creates a hidden pair with real BEFORE + AFTER uploads (real UI) ----
    const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const adminPage = await adminCtx.newPage();
    await openBeforeAfterTab(adminPage, proASlug);
    await createPairViaAdmin(adminPage, {
      title: content.title,
      eventType: content.eventType,
      location: content.location,
    });

    // ---- §12 DB parent assertion ----
    const createdItem = await provider.getRow("before_after_items", { title: content.title });
    expect(createdItem, "created before/after parent row must exist").not.toBeNull();
    itemId = createdItem!["id"] as string;
    expect(createdItem!["beautician_profile_id"]).toBe(proAId);
    expect(createdItem!["event_type"]).toBe(content.eventType);
    expect(createdItem!["location"]).toBe(content.location);
    expect(createdItem!["service_id"]).toBeNull();
    expect(createdItem!["is_published"]).toBe(false);

    const proBHasIt = await provider.rowExists("before_after_items", {
      beautician_profile_id: proBId,
      title: content.title,
    });
    expect(proBHasIt, "Professional B must not have a matching before/after item").toBe(false);

    // ---- §13 child image role assertions — CRITICAL ----
    const beforeRow = await provider.getRow("before_after_images", {
      before_after_id: itemId,
      image_type: "before",
    });
    const afterRow = await provider.getRow("before_after_images", {
      before_after_id: itemId,
      image_type: "after",
    });
    expect(beforeRow, "BEFORE child image row must exist").not.toBeNull();
    expect(afterRow, "AFTER child image row must exist").not.toBeNull();
    beforeStoragePath = beforeRow!["storage_path"] as string;
    afterStoragePath = afterRow!["storage_path"] as string;
    expect(beforeRow!["id"]).not.toBe(afterRow!["id"]);
    expect(beforeStoragePath).not.toBe(afterStoragePath);
    const totalImageRows = await provider.countRows("before_after_images", {
      before_after_id: itemId,
    });
    expect(totalImageRows, "exactly two child image rows — no duplicate, no third role").toBe(2);

    // ---- §11 storage assertions after upload ----
    expect(beforeStoragePath.startsWith(`profiles/${proASlug}/before-after/`)).toBe(true);
    expect(afterStoragePath.startsWith(`profiles/${proASlug}/before-after/`)).toBe(true);
    expect(ownerSlugFromStoragePath(beforeStoragePath)).toBe(proASlug);
    expect(ownerSlugFromStoragePath(afterStoragePath)).toBe(proASlug);
    expect(ownerSlugFromStoragePath(beforeStoragePath)).not.toBe(proBSlug);
    expect(ownerSlugFromStoragePath(afterStoragePath)).not.toBe(proBSlug);
    expect(await provider.storageObjectExists(BUCKET, beforeStoragePath)).toBe(true);
    expect(await provider.storageObjectExists(BUCKET, afterStoragePath)).toBe(true);

    // ---- §15 public/storage URL assertion for both objects ----
    const beforePublicUrl = `${requireEnv("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/${beforeStoragePath}`;
    const afterPublicUrl = `${requireEnv("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/${afterStoragePath}`;
    const beforeUploadCheck = await httpCheck(beforePublicUrl);
    const afterUploadCheck = await httpCheck(afterPublicUrl);
    expect(beforeUploadCheck.ok, "BEFORE object must be fetchable via its public URL").toBe(true);
    expect(beforeUploadCheck.contentType).toMatch(/^image\//);
    expect(afterUploadCheck.ok, "AFTER object must be fetchable via its public URL").toBe(true);
    expect(afterUploadCheck.contentType).toMatch(/^image\//);

    // ---- §16 create audit ----
    const createAuditExists = await provider.rowExists("audit_logs", {
      action: "before_after_created",
      entity_type: "before_after_item",
      entity_id: itemId,
    });
    expect(createAuditExists, "before_after_created audit row must exist").toBe(true);

    // ---- §17 dashboard sync ----
    const proACtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage = await proACtx.newPage();
    await proAPage.goto("/dashboard/before-after");
    await expect(proAPage.getByText(content.title)).toBeVisible({ timeout: 10_000 });
    await proACtx.close();

    const proBCtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-b.json`,
    });
    const proBPage = await proBCtx.newPage();
    await proBPage.goto("/dashboard/before-after");
    await expect(proBPage.getByText(content.title)).toHaveCount(0);
    await proBPage.close(); // context stays open for later cross-tenant tests

    // ---- §18 hidden/public visibility (item-level is_published gate) ----
    const publicCtx1 = await browser.newContext();
    const publicPage1 = await publicCtx1.newPage();
    await publicPage1.goto(`/portfolio/${proASlug}`);
    await expect(publicPage1.getByText(content.title)).toHaveCount(0);
    await publicCtx1.close();

    // ---- §19 partial edit: description only ----
    await editDescriptionOnly(adminPage, content.title, content.editedDescription);

    // ---- §19/§20 verify partial-edit integrity — unrelated fields/paths/roles preserved ----
    const afterEdit = await provider.getRow("before_after_items", { id: itemId });
    expect(afterEdit!["description"]).toBe(content.editedDescription);
    expect(afterEdit!["title"]).toBe(content.title);
    expect(afterEdit!["event_type"]).toBe(content.eventType);
    expect(afterEdit!["location"]).toBe(content.location);
    expect(afterEdit!["service_id"]).toBeNull();
    expect(afterEdit!["is_published"]).toBe(false);

    const beforeAfterEdit = await provider.getRow("before_after_images", { id: beforeRow!["id"] });
    const afterAfterEdit = await provider.getRow("before_after_images", { id: afterRow!["id"] });
    expect(beforeAfterEdit!["image_type"]).toBe("before");
    expect(beforeAfterEdit!["storage_path"]).toBe(beforeStoragePath);
    expect(afterAfterEdit!["image_type"]).toBe("after");
    expect(afterAfterEdit!["storage_path"]).toBe(afterStoragePath);
    const imageCountAfterEdit = await provider.countRows("before_after_images", {
      before_after_id: itemId,
    });
    expect(imageCountAfterEdit, "no new storage/image rows created by the metadata edit").toBe(2);

    // ---- §20 update audit ----
    const updateAuditExists = await provider.rowExists("audit_logs", {
      action: "before_after_updated",
      entity_type: "before_after_item",
      entity_id: itemId,
    });
    expect(updateAuditExists, "before_after_updated audit row must exist").toBe(true);

    // ---- §22 sort/reorder: audited N/A — no reorder UI exists in the
    // current Before & After implementation. No assertion fabricated.

    // ---- §23 activate the pair (real UI, toggle only) ----
    await togglePublishOnly(adminPage, content.title, true);

    const afterPublish = await provider.getRow("before_after_items", { id: itemId });
    expect(afterPublish!["id"]).toBe(itemId);
    expect(afterPublish!["title"]).toBe(content.title);
    expect(afterPublish!["is_published"]).toBe(true);
    const countAfterPublish = await provider.countRows("before_after_items", { id: itemId });
    expect(countAfterPublish, "no duplicate before/after parent row").toBe(1);
    const imageCountAfterPublish = await provider.countRows("before_after_images", {
      before_after_id: itemId,
    });
    expect(imageCountAfterPublish, "still exactly two child image rows after activation").toBe(2);

    // ---- §24/§25/§26 public paired render, browser decode, role integrity ----
    const publicCtx2 = await browser.newContext();
    const publicPage2 = await publicCtx2.newPage();
    await publicPage2.goto(`/portfolio/${proASlug}`);

    const expectedBeforeAlt = `Before ${content.title.toLowerCase()} transformation`;
    const expectedAfterAlt = `After ${content.title.toLowerCase()} transformation by ${professionalDisplayName}`;

    const beforeImg = publicPage2.getByAltText(expectedBeforeAlt);
    const afterImg = publicPage2.getByAltText(expectedAfterAlt);
    await expect(beforeImg).toBeVisible({ timeout: 10_000 });
    await expect(afterImg).toBeVisible({ timeout: 10_000 });

    // §26 role integrity — the rendered BEFORE element's src must resolve to
    // the DB-recorded BEFORE storage path, and likewise for AFTER, proving
    // no swap occurred (the path itself carries no before/after marker, so
    // this is the only way to prove the mapping is correct).
    const beforeSrc = await beforeImg.getAttribute("src");
    const afterSrc = await afterImg.getAttribute("src");
    expect(beforeSrc).toContain(beforeStoragePath);
    expect(afterSrc).toContain(afterStoragePath);
    expect(beforeSrc).not.toContain(afterStoragePath);
    expect(afterSrc).not.toContain(beforeStoragePath);

    // §25 browser image decode for both
    const beforeNaturalWidth = await beforeImg.evaluate(
      (el) => (el as HTMLImageElement).naturalWidth,
    );
    const beforeNaturalHeight = await beforeImg.evaluate(
      (el) => (el as HTMLImageElement).naturalHeight,
    );
    const afterNaturalWidth = await afterImg.evaluate(
      (el) => (el as HTMLImageElement).naturalWidth,
    );
    const afterNaturalHeight = await afterImg.evaluate(
      (el) => (el as HTMLImageElement).naturalHeight,
    );
    expect(beforeNaturalWidth, "BEFORE image must successfully decode").toBeGreaterThan(0);
    expect(beforeNaturalHeight, "BEFORE image must successfully decode").toBeGreaterThan(0);
    expect(afterNaturalWidth, "AFTER image must successfully decode").toBeGreaterThan(0);
    expect(afterNaturalHeight, "AFTER image must successfully decode").toBeGreaterThan(0);
    // Fixtures use distinct dimensions (before=4x2, after=2x4) specifically
    // so a swap would also be visible as a dimension mismatch here.
    expect(beforeNaturalWidth).toBe(4);
    expect(beforeNaturalHeight).toBe(2);
    expect(afterNaturalWidth).toBe(2);
    expect(afterNaturalHeight).toBe(4);

    await publicCtx2.close();

    // ---- §27/§28/§29/§30 cross-tenant negative tests — Professional B ----
    const preAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: itemId,
      action: "before_after_updated",
    });
    const preAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: itemId,
      action: "before_after_deleted",
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

    // §27 cross-tenant update rejection
    const updateAttempt = await proBClient
      .from("before_after_items")
      .update({ title: "QA_E2E_REJECTED_CROSS_TENANT_ATTEMPT" })
      .eq("id", itemId)
      .select();
    expect(updateAttempt.data?.length ?? 0, "cross-tenant item update must affect zero rows").toBe(
      0,
    );

    // §28 cross-tenant delete rejection
    const deleteAttempt = await proBClient
      .from("before_after_items")
      .delete()
      .eq("id", itemId)
      .select();
    expect(deleteAttempt.data?.length ?? 0, "cross-tenant item delete must affect zero rows").toBe(
      0,
    );

    // §29/§30 direct cross-tenant storage delete rejection — both sides
    const beforeStorageDeleteAttempt = await proBClient.storage
      .from(BUCKET)
      .remove([beforeStoragePath]);
    const afterStorageDeleteAttempt = await proBClient.storage
      .from(BUCKET)
      .remove([afterStoragePath]);
    const beforeStillExists = await provider.storageObjectExists(BUCKET, beforeStoragePath);
    const afterStillExists = await provider.storageObjectExists(BUCKET, afterStoragePath);
    expect(
      beforeStillExists,
      "BEFORE storage object must survive a cross-tenant delete attempt",
    ).toBe(true);
    expect(
      afterStillExists,
      "AFTER storage object must survive a cross-tenant delete attempt",
    ).toBe(true);
    expect(
      beforeStorageDeleteAttempt.data?.length ?? 0,
      "cross-tenant BEFORE storage delete must not report any object removed",
    ).toBe(0);
    expect(
      afterStorageDeleteAttempt.data?.length ?? 0,
      "cross-tenant AFTER storage delete must not report any object removed",
    ).toBe(0);

    await proBClient.auth.signOut();

    const unchangedAfterAttempts = await provider.getRow("before_after_items", { id: itemId });
    expect(
      unchangedAfterAttempts,
      "before/after item must still exist after rejected cross-tenant attempts",
    ).not.toBeNull();
    expect(unchangedAfterAttempts!["title"]).toBe(content.title);

    // ---- §31 false-success audit absence ----
    const postAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: itemId,
      action: "before_after_updated",
    });
    const postAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: itemId,
      action: "before_after_deleted",
    });
    expect(
      postAttemptUpdateAuditCount,
      "no new before_after_updated audit row from the rejected attempt",
    ).toBe(preAttemptUpdateAuditCount);
    expect(
      postAttemptDeleteAuditCount,
      "no new before_after_deleted audit row from the rejected attempt",
    ).toBe(preAttemptDeleteAuditCount);
    await proBCtx.close();

    // ---- §32 admin delete (real UI) ----
    await deletePairViaAdmin(adminPage, content.title);

    // ---- §33 parent/child DB cleanup ----
    const afterDeleteItem = await provider.getRow("before_after_items", { id: itemId });
    expect(afterDeleteItem, "before/after parent row must be gone after delete").toBeNull();
    const afterDeleteBefore = await provider.getRow("before_after_images", {
      id: beforeRow!["id"],
    });
    const afterDeleteAfter = await provider.getRow("before_after_images", { id: afterRow!["id"] });
    expect(afterDeleteBefore, "BEFORE child image row must be gone after delete").toBeNull();
    expect(afterDeleteAfter, "AFTER child image row must be gone after delete").toBeNull();

    // ---- §34 both storage objects cleaned — CRITICAL ----
    const beforeExistsAfterDelete = await provider.storageObjectExists(BUCKET, beforeStoragePath);
    const afterExistsAfterDelete = await provider.storageObjectExists(BUCKET, afterStoragePath);
    expect(
      beforeExistsAfterDelete,
      "BEFORE storage object must be deleted by the application after item delete",
    ).toBe(false);
    expect(
      afterExistsAfterDelete,
      "AFTER storage object must be deleted by the application after item delete",
    ).toBe(false);

    // ---- §35 dashboard/public cleanup ----
    await expect(adminPage.getByText(content.title)).toHaveCount(0);

    const proACtx2 = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage2 = await proACtx2.newPage();
    await proAPage2.goto("/dashboard/before-after");
    await expect(proAPage2.getByText(content.title)).toHaveCount(0);
    await proACtx2.close();

    const publicCtx3 = await browser.newContext();
    const publicPage3 = await publicCtx3.newPage();
    await publicPage3.goto(`/portfolio/${proASlug}`);
    await expect(publicPage3.getByText(content.title)).toHaveCount(0);
    await publicCtx3.close();

    // §36 post-delete CDN cache handling — Storage API (already asserted
    // above) is authoritative; a briefly-cached public URL is expected and
    // logged only, never asserted as pass/fail (Gallery/QA-1H lesson).
    const beforePostDeleteCheck = await httpCheck(beforePublicUrl);
    const afterPostDeleteCheck = await httpCheck(afterPublicUrl);
    console.log(
      `[before-after] post-delete public URL checks: before.ok=${beforePostDeleteCheck.ok} after.ok=${afterPostDeleteCheck.ok} (CDN cache may still serve a 200 briefly; storage API confirmed both objects are gone)`,
    );

    const proBStillFine = await provider.countRows("before_after_items", {
      beautician_profile_id: proBId,
    });
    expect(proBStillFine, "Professional B's before/after count must be unaffected").toBe(
      baselineParentCountB,
    );

    // ---- §37 delete audit ----
    const deleteAuditExists = await provider.rowExists("audit_logs", {
      action: "before_after_deleted",
      entity_type: "before_after_item",
      entity_id: itemId,
    });
    expect(deleteAuditExists, "before_after_deleted audit row must exist").toBe(true);

    await adminCtx.close();

    // ---- §39 final DB / storage orphan check ----
    const finalCountA = await provider.countRows("before_after_items", {
      beautician_profile_id: proAId,
    });
    expect(finalCountA, "Professional A before/after count must return to baseline").toBe(
      baselineParentCountA,
    );
    const runIdOrphan = await provider.rowExists("before_after_items", { title: content.title });
    expect(runIdOrphan, "no before/after item with this runId may remain").toBe(false);
    const finalStorageObjects = await provider.listStorageObjects(
      BUCKET,
      `profiles/${proASlug}/before-after`,
    );
    const newOrphans = finalStorageObjects.filter((name) => !baselineStorageObjects.includes(name));
    expect(
      newOrphans,
      "no new storage objects may remain under Professional A's before-after path",
    ).toEqual([]);
  } finally {
    // Safety-net cleanup — runs regardless of pass/fail above.
    if (itemId) {
      await provider.deleteRow("before_after_items", { id: itemId }).catch(() => {});
    }
    if (beforeStoragePath) {
      await provider.deleteStorageObject(BUCKET, beforeStoragePath).catch(() => {});
    }
    if (afterStoragePath) {
      await provider.deleteStorageObject(BUCKET, afterStoragePath).catch(() => {});
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
  .serial("Before & After automated lifecycle pilot @crud @before-after @tenant @audit @storage", () => {
  test("full lifecycle — first run", async ({ browser }) => {
    await runBeforeAfterLifecycle(browser, "first lifecycle");
  });

  test("full lifecycle — second run (idempotency / re-run proof)", async ({ browser }) => {
    await runBeforeAfterLifecycle(browser, "second lifecycle");
  });

  test.afterAll(() => {
    console.log("Before & After lifecycle runtime measurements:");
    for (const t of timings) {
      console.log(`  ${t.label}: ${(t.ms / 1000).toFixed(1)}s`);
    }
  });
});
