// QA-1F — second automated business-CRUD pilot: the Admin Services
// lifecycle. DESTRUCTIVE. Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:services` / `test:e2e:qa:crud` scripts.
import { type Browser, type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  buildQaServiceContent,
  runDestructiveQaPreflight,
} from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";
import { saveAndExpectSuccess } from "../../helpers/ui/save-dialog.ts";
import { selectOption } from "../../helpers/ui/select-option.ts";

const AUTH_DIR = "playwright/.auth";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function openServicesTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Services", exact: true }).click();
}

function serviceCard(page: Page, name: string) {
  const deleteBtn = page.getByLabel(`Delete ${name}`);
  return deleteBtn.locator("xpath=ancestor::*[contains(@class,'p-5')][1]");
}

async function addRepeatableItems(
  page: Page,
  sectionLabel: string,
  values: string[],
): Promise<void> {
  const container = page.getByText(sectionLabel, { exact: true }).locator("xpath=ancestor::div[1]");
  for (const value of values) {
    await container.getByRole("button", { name: "+ Add item" }).click();
    await container.locator("input").last().fill(value);
  }
}

interface ServiceFormFields {
  name: string;
  category: string;
  description: string;
  price: string;
  priceType: "Fixed" | "Starting from" | "Custom quote";
  durationMinutes?: string;
  includedItems?: string[];
  suitableFor?: string[];
  preparationNotes?: string;
  active: boolean;
}

async function fillServiceForm(page: Page, fields: ServiceFormFields): Promise<void> {
  await page.getByLabel("Name").fill(fields.name);
  await selectOption(page, "Category", fields.category);
  await page.getByLabel("Description").fill(fields.description);

  const activeSwitch = page.getByLabel("Show on portfolio");
  if (fields.active) {
    await activeSwitch.check();
  } else {
    await activeSwitch.uncheck();
  }

  if (fields.priceType !== "Fixed") {
    await selectOption(page, "Price type", fields.priceType);
  }
  if (fields.price) {
    await page.getByLabel("Price (₹)").fill(fields.price);
  }
  if (fields.durationMinutes) {
    await page.getByLabel("Typical duration (minutes)").fill(fields.durationMinutes);
  }
  if (fields.includedItems?.length) {
    await addRepeatableItems(page, "What's included", fields.includedItems);
  }
  if (fields.suitableFor?.length) {
    await addRepeatableItems(page, "Suitable for", fields.suitableFor);
  }
  if (fields.preparationNotes) {
    await page.getByLabel("Preparation notes").fill(fields.preparationNotes);
  }
}

async function createServiceViaAdmin(page: Page, fields: ServiceFormFields): Promise<void> {
  await page.getByRole("button", { name: "Add Service" }).first().click();
  await fillServiceForm(page, fields);
  await saveAndExpectSuccess(page);
}

async function editServiceDescriptionOnly(
  page: Page,
  name: string,
  newDescription: string,
): Promise<void> {
  await serviceCard(page, name).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Description").fill(newDescription);
  await saveAndExpectSuccess(page);
}

async function toggleActiveOnly(page: Page, name: string, active: boolean): Promise<void> {
  await serviceCard(page, name).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  const activeSwitch = page.getByLabel("Show on portfolio");
  if (active) {
    await activeSwitch.check();
  } else {
    await activeSwitch.uncheck();
  }
  await saveAndExpectSuccess(page);
}

async function deleteServiceViaAdmin(page: Page, name: string): Promise<void> {
  page.once("dialog", (dialog) => void dialog.accept());
  await serviceCard(page, name).getByLabel(`Delete ${name}`).click();
  await expect(page.getByLabel(`Delete ${name}`)).toHaveCount(0, { timeout: 10_000 });
}

function findServiceJsonLdNode(
  jsonLd: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!jsonLd) return null;
  const graph = jsonLd["@graph"];
  if (!Array.isArray(graph)) return null;
  return (graph.find((node) => (node as Record<string, unknown>)["@type"] === "Service") ??
    null) as Record<string, unknown> | null;
}

async function readJsonLd(page: Page): Promise<Record<string, unknown> | null> {
  const script = page.locator('script[type="application/ld+json"]');
  const count = await script.count();
  if (count === 0) return null;
  const text = await script.first().textContent();
  if (!text) return null;
  return JSON.parse(text) as Record<string, unknown>;
}

interface LifecycleTiming {
  label: string;
  ms: number;
}
const timings: LifecycleTiming[] = [];

async function runServiceLifecycle(browser: Browser, label: string): Promise<void> {
  const start = Date.now();
  const { provider, runId } = runDestructiveQaPreflight();
  const content = buildQaServiceContent(runId);

  const proA = await provider.getRow("beautician_profiles", {
    slug: beautyfolioProject.qaIdentities.professionalA.slug,
  });
  const proB = await provider.getRow("beautician_profiles", {
    slug: beautyfolioProject.qaIdentities.professionalB.slug,
  });
  if (!proA || !proB)
    throw new Error("QA professional fixtures not found — run qa:provision-identities first.");
  const proAId = proA["id"] as string;
  const proBId = proB["id"] as string;
  expect(proAId, "Professional A and B must be distinct").not.toBe(proBId);

  const originalStatus = proA["status"] as string;
  const baselineServiceCountA = await provider.countRows("services", {
    beautician_profile_id: proAId,
  });
  const baselineServiceCountB = await provider.countRows("services", {
    beautician_profile_id: proBId,
  });
  const preexisting = await provider.rowExists("services", { name: content.name });
  expect(preexisting, "no service matching this runId should pre-exist").toBe(false);

  let serviceId: string | null = null;
  let quoteServiceId: string | null = null;
  let profileTemporarilyPublished = false;

  try {
    // ---- fixture prerequisite: make Professional A's public page reachable ----
    // Minimum change only — primary_city is deliberately left untouched, so
    // the service page's real content-completeness indexability rule
    // (§22/§23) is exercised honestly rather than weakened.
    if (originalStatus !== "published") {
      await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
      profileTemporarilyPublished = true;
    }

    // ---- §10 Admin creates a hidden Service (real UI) ----
    const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const adminPage = await adminCtx.newPage();
    await openServicesTab(adminPage, beautyfolioProject.qaIdentities.professionalA.slug);
    await createServiceViaAdmin(adminPage, {
      name: content.name,
      category: content.category,
      description: content.description,
      price: content.price,
      priceType: "Fixed",
      durationMinutes: content.durationMinutes,
      includedItems: content.includedItems,
      suitableFor: content.suitableFor,
      preparationNotes: content.preparationNotes,
      active: false,
    });

    // ---- §11 DB create assertions ----
    const created = await provider.getRow("services", { name: content.name });
    expect(created, "created service row must exist").not.toBeNull();
    serviceId = created!["id"] as string;
    expect(created!["beautician_profile_id"]).toBe(proAId);
    expect(created!["category"]).toBe(content.category);
    expect(created!["short_description"]).toBe(content.description);
    expect(Number(created!["price"])).toBe(Number(content.price));
    expect(created!["price_type"]).toBe("fixed");
    expect(created!["duration_minutes"]).toBe(Number(content.durationMinutes));
    expect(created!["included_items"]).toEqual(content.includedItems);
    expect(created!["suitable_for"]).toEqual(content.suitableFor);
    expect(created!["preparation_notes"]).toBe(content.preparationNotes);
    expect(created!["is_active"]).toBe(false);
    const proBHasIt = await provider.rowExists("services", {
      beautician_profile_id: proBId,
      name: content.name,
    });
    expect(proBHasIt, "Professional B must not have a matching service").toBe(false);

    // ---- §12 persisted slug integrity ----
    const persistedSlug = created!["slug"] as string;
    expect(persistedSlug, "created service must have a non-empty persisted slug").toBeTruthy();

    // ---- §13 create audit ----
    const createAuditExists = await provider.rowExists("audit_logs", {
      action: "service_created",
      entity_type: "service",
      entity_id: serviceId,
    });
    expect(createAuditExists, "service_created audit row must exist").toBe(true);

    // ---- §14 dashboard sync (Professional A sees it; Professional B doesn't) ----
    const proACtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage = await proACtx.newPage();
    await proAPage.goto("/dashboard/services");
    await expect(proAPage.getByText(content.name)).toBeVisible({ timeout: 10_000 });
    await proACtx.close();

    const proBCtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-b.json`,
    });
    const proBPage = await proBCtx.newPage();
    await proBPage.goto("/dashboard/services");
    await expect(proBPage.getByText(content.name)).toHaveCount(0);
    await proBPage.close(); // context stays open for later cross-tenant test

    // ---- §15 hidden public assertion (listing + detail route) ----
    const publicCtx1 = await browser.newContext();
    const publicPage1 = await publicCtx1.newPage();
    await publicPage1.goto(`/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}`);
    await expect(publicPage1.getByText(content.name)).toHaveCount(0);

    const hiddenDetailResponse = await publicPage1.goto(
      `/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}/services/${persistedSlug}`,
    );
    expect(hiddenDetailResponse?.status(), "hidden service's detail route must 404").toBe(404);
    await publicCtx1.close();

    // ---- §16 partial edit: description only ----
    await editServiceDescriptionOnly(adminPage, content.name, content.editedDescription);

    // ---- §16/§20 verify partial-edit integrity — all unrelated fields preserved ----
    const afterEdit = await provider.getRow("services", { id: serviceId });
    expect(afterEdit!["short_description"]).toBe(content.editedDescription);
    expect(afterEdit!["name"]).toBe(content.name);
    expect(afterEdit!["category"]).toBe(content.category);
    expect(Number(afterEdit!["price"])).toBe(Number(content.price));
    expect(afterEdit!["price_type"]).toBe("fixed");
    expect(afterEdit!["duration_minutes"]).toBe(Number(content.durationMinutes));
    expect(afterEdit!["included_items"]).toEqual(content.includedItems);
    expect(afterEdit!["suitable_for"]).toEqual(content.suitableFor);
    expect(afterEdit!["preparation_notes"]).toBe(content.preparationNotes);
    expect(afterEdit!["is_active"]).toBe(false);
    expect(afterEdit!["slug"], "slug must remain stable across an unrelated edit").toBe(
      persistedSlug,
    );

    // ---- §17 update audit ----
    const updateAuditExists = await provider.rowExists("audit_logs", {
      action: "service_updated",
      entity_type: "service",
      entity_id: serviceId,
    });
    expect(updateAuditExists, "service_updated audit row must exist").toBe(true);

    // ---- §18 focused price-regression case: custom_quote with no price ----
    await createServiceViaAdmin(adminPage, {
      name: content.quoteName,
      category: content.category,
      description: content.quoteDescription,
      price: "",
      priceType: "Custom quote",
      active: false,
    });
    const quoteRow = await provider.getRow("services", { name: content.quoteName });
    expect(quoteRow, "custom_quote service row must exist").not.toBeNull();
    quoteServiceId = quoteRow!["id"] as string;
    expect(quoteRow!["price_type"]).toBe("custom_quote");
    expect(quoteRow!["price"]).toBeNull();

    // ---- §19 activate the primary service (real UI, toggle only) ----
    await toggleActiveOnly(adminPage, content.name, true);

    const afterPublish = await provider.getRow("services", { id: serviceId });
    expect(afterPublish!["id"]).toBe(serviceId);
    expect(afterPublish!["slug"]).toBe(persistedSlug);
    expect(afterPublish!["short_description"]).toBe(content.editedDescription);
    expect(afterPublish!["name"]).toBe(content.name);
    expect(afterPublish!["category"]).toBe(content.category);
    expect(afterPublish!["is_active"]).toBe(true);
    const countAfterPublish = await provider.countRows("services", { id: serviceId });
    expect(countAfterPublish, "no duplicate service row").toBe(1);

    // ---- §23 readiness assertion (deterministic: no primary_city means
    // this fixture is never fully indexable, so the admin badge must read
    // "Needs details" once visible, not "Ready for search") ----
    await adminPage.reload();
    await openServicesTab(adminPage, beautyfolioProject.qaIdentities.professionalA.slug);
    await expect(serviceCard(adminPage, content.name).getByText("Needs details")).toBeVisible({
      timeout: 10_000,
    });

    // ---- §20/§21 public portfolio + service detail route assertions ----
    const publicCtx2 = await browser.newContext();
    const publicPage2 = await publicCtx2.newPage();
    await publicPage2.goto(`/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}`);
    await expect(publicPage2.getByRole("link", { name: content.name, exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // ---- §21/§26 slug -> route -> service identity consistency ----
    const detailResponse = await publicPage2.goto(
      `/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}/services/${persistedSlug}`,
    );
    expect(detailResponse?.status(), "active service's detail route must load").toBe(200);
    await expect(publicPage2.getByRole("heading", { level: 1 })).toContainText(content.name);
    await expect(publicPage2.getByText(content.editedDescription).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      publicPage2.getByText(`₹${Number(content.price).toLocaleString("en-IN")}`).first(),
    ).toBeVisible();

    // ---- §22/§27 SEO / JSON-LD (deterministic — no primary_city => noindex) ----
    // The root route ships a default noindex,nofollow meta tag; this
    // route's own head() appends its real robots directive after it rather
    // than replacing it, so two meta[name=robots] tags are present — the
    // route-specific one (last in document order) is the one that matters.
    const robotsMeta = publicPage2.locator('meta[name="robots"]').last();
    await expect(robotsMeta).toHaveAttribute("content", "noindex, follow");
    const canonical = publicPage2.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      "href",
      new RegExp(
        `/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}/services/${persistedSlug}$`,
      ),
    );
    const jsonLd = await readJsonLd(publicPage2);
    expect(jsonLd, "service JSON-LD must parse").not.toBeNull();
    const serviceNode = findServiceJsonLdNode(jsonLd);
    expect(serviceNode, "Service node must be present in JSON-LD").not.toBeNull();
    expect(serviceNode!["name"]).toBe(content.name);
    await publicCtx2.close();

    // ---- §24/§25 cross-tenant negative — Professional B ----
    const preAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: serviceId,
      action: "service_updated",
    });
    const preAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: serviceId,
      action: "service_deleted",
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
      .from("services")
      .update({ short_description: "QA_E2E_REJECTED_CROSS_TENANT_ATTEMPT" })
      .eq("id", serviceId)
      .select();
    expect(updateAttempt.data?.length ?? 0, "cross-tenant update must affect zero rows").toBe(0);

    const deleteAttempt = await proBClient.from("services").delete().eq("id", serviceId).select();
    expect(deleteAttempt.data?.length ?? 0, "cross-tenant delete must affect zero rows").toBe(0);
    await proBClient.auth.signOut();

    const unchangedAfterAttempts = await provider.getRow("services", { id: serviceId });
    expect(
      unchangedAfterAttempts,
      "service must still exist after rejected cross-tenant attempts",
    ).not.toBeNull();
    expect(unchangedAfterAttempts!["short_description"]).toBe(content.editedDescription);

    const postAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: serviceId,
      action: "service_updated",
    });
    const postAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: serviceId,
      action: "service_deleted",
    });
    expect(
      postAttemptUpdateAuditCount,
      "no new service_updated audit row from the rejected attempt",
    ).toBe(preAttemptUpdateAuditCount);
    expect(
      postAttemptDeleteAuditCount,
      "no new service_deleted audit row from the rejected attempt",
    ).toBe(preAttemptDeleteAuditCount);
    await proBCtx.close();

    // ---- §26 admin delete (real UI) ----
    await deleteServiceViaAdmin(adminPage, content.name);
    // cleanup the price-regression companion service via the real UI too
    await deleteServiceViaAdmin(adminPage, content.quoteName);
    quoteServiceId = null;

    // ---- §27 delete assertions ----
    const afterDelete = await provider.getRow("services", { id: serviceId });
    expect(afterDelete, "service row must be gone after delete").toBeNull();
    await expect(adminPage.getByText(content.name)).toHaveCount(0);

    const proACtx2 = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage2 = await proACtx2.newPage();
    await proAPage2.goto("/dashboard/services");
    await expect(proAPage2.getByText(content.name)).toHaveCount(0);
    await proACtx2.close();

    const publicCtx3 = await browser.newContext();
    const publicPage3 = await publicCtx3.newPage();
    await publicPage3.goto(`/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}`);
    await expect(publicPage3.getByText(content.name)).toHaveCount(0);

    // ---- §36 deleted-route behavior ----
    const deletedDetailResponse = await publicPage3.goto(
      `/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}/services/${persistedSlug}`,
    );
    expect(deletedDetailResponse?.status(), "deleted service's detail route must 404").toBe(404);
    await publicCtx3.close();

    const proBStillFine = await provider.countRows("services", {
      beautician_profile_id: proBId,
    });
    expect(proBStillFine, "Professional B's service count must be unaffected").toBe(
      baselineServiceCountB,
    );

    // ---- §28 delete audit ----
    const deleteAuditExists = await provider.rowExists("audit_logs", {
      action: "service_deleted",
      entity_type: "service",
      entity_id: serviceId,
    });
    expect(deleteAuditExists, "service_deleted audit row must exist").toBe(true);

    await adminCtx.close();

    // ---- §29 final orphan / baseline-restore check ----
    const finalCountA = await provider.countRows("services", { beautician_profile_id: proAId });
    expect(finalCountA, "Professional A service count must return to baseline").toBe(
      baselineServiceCountA,
    );
    const runIdOrphan = await provider.rowExists("services", { name: content.name });
    expect(runIdOrphan, "no service with this runId may remain").toBe(false);
  } finally {
    // Safety-net cleanup — runs regardless of pass/fail above.
    if (serviceId) {
      await provider.deleteRow("services", { id: serviceId }).catch(() => {});
    }
    if (quoteServiceId) {
      await provider.deleteRow("services", { id: quoteServiceId }).catch(() => {});
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
  .serial("Services automated lifecycle pilot @crud @services @tenant @audit @seo", () => {
  test("full lifecycle — first run", async ({ browser }) => {
    await runServiceLifecycle(browser, "first lifecycle");
  });

  test("full lifecycle — second run (idempotency / re-run proof)", async ({ browser }) => {
    await runServiceLifecycle(browser, "second lifecycle");
  });

  test.afterAll(() => {
    console.log("Service lifecycle runtime measurements:");
    for (const t of timings) {
      console.log(`  ${t.label}: ${(t.ms / 1000).toFixed(1)}s`);
    }
  });
});
