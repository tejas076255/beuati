// QA-1G — third automated business-CRUD pilot: the Admin Packages
// lifecycle. DESTRUCTIVE. Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:packages` / `test:e2e:qa:crud` scripts.
//
// Audited pricing behavior (Phase 5.2F, re-confirmed live for QA-1G):
// unlike Services, the Package form (package-manager.tsx) requires a valid
// numeric price >= 0 for EVERY price_type, including custom_quote — the
// zod schema is `z.coerce.number().min(0)` with no price_type-conditional
// branch. Leaving the field blank does not block save; it simply persists
// as 0 (RHF/zod coerce ""→0). The public JSON-LD Offer is still dropped
// for custom_quote regardless of the stored numeric price
// (buildOfferEntities/buildOfferPricing in portfolio.$slug.tsx / seo-
// helpers.ts key off price_type alone), and public price text always
// renders "Custom quote" for that type regardless of the stored number.
import { type Browser, type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  buildQaPackageContent,
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

async function openPackagesTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Packages", exact: true }).click();
}

function packageCard(page: Page, name: string) {
  const deleteBtn = page.getByLabel(`Delete ${name}`);
  return deleteBtn.locator("xpath=ancestor::*[contains(@class,'p-5')][1]");
}

interface PackageFormFields {
  name: string;
  bestFor?: string;
  price: string;
  priceType: "Fixed" | "Starting from" | "Custom quote";
  inclusions?: string[];
  note?: string;
  active: boolean;
}

async function fillPackageForm(page: Page, fields: PackageFormFields): Promise<void> {
  await page.getByLabel("Package name").fill(fields.name);
  if (fields.bestFor) {
    await page.getByLabel("Best for (optional)").fill(fields.bestFor);
  }
  await page.getByLabel("Price (₹)").fill(fields.price);
  if (fields.priceType !== "Fixed") {
    await selectOption(page, "Price type", fields.priceType);
  }
  if (fields.inclusions?.length) {
    await page.getByLabel(/Included services \/ details/).fill(fields.inclusions.join("\n"));
  }
  if (fields.note) {
    await page.getByLabel("Note (optional)").fill(fields.note);
  }
  const activeCheckbox = page.getByLabel("Published (visible on the portfolio)");
  if (fields.active) {
    await activeCheckbox.check();
  } else {
    await activeCheckbox.uncheck();
  }
}

async function createPackageViaAdmin(page: Page, fields: PackageFormFields): Promise<void> {
  await page.getByRole("button", { name: "Add package" }).first().click();
  await fillPackageForm(page, fields);
  await saveAndExpectSuccess(page);
}

async function editPackageNoteOnly(page: Page, name: string, newNote: string): Promise<void> {
  await packageCard(page, name).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Note (optional)").fill(newNote);
  await saveAndExpectSuccess(page);
}

async function toggleActiveOnly(page: Page, name: string, active: boolean): Promise<void> {
  await packageCard(page, name).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  const activeCheckbox = page.getByLabel("Published (visible on the portfolio)");
  if (active) {
    await activeCheckbox.check();
  } else {
    await activeCheckbox.uncheck();
  }
  await saveAndExpectSuccess(page);
}

async function changePriceTypeOnly(
  page: Page,
  name: string,
  priceType: "Fixed" | "Starting from" | "Custom quote",
): Promise<void> {
  await packageCard(page, name).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  await selectOption(page, "Price type", priceType);
  await saveAndExpectSuccess(page);
}

async function deletePackageViaAdmin(page: Page, name: string): Promise<void> {
  page.once("dialog", (dialog) => void dialog.accept());
  await packageCard(page, name).getByLabel(`Delete ${name}`).click();
  await expect(page.getByLabel(`Delete ${name}`)).toHaveCount(0, { timeout: 10_000 });
}

function findOfferForItem(
  jsonLd: Record<string, unknown> | null,
  itemName: string,
): Record<string, unknown> | undefined {
  if (!jsonLd) return undefined;
  const graph = jsonLd["@graph"];
  if (!Array.isArray(graph)) return undefined;
  for (const node of graph as Record<string, unknown>[]) {
    const offers = node["makesOffer"];
    if (!Array.isArray(offers)) continue;
    const match = offers.find((o) => {
      const itemOffered = (o as Record<string, unknown>)["itemOffered"] as
        Record<string, unknown> | undefined;
      return itemOffered?.["name"] === itemName;
    });
    if (match) return match as Record<string, unknown>;
  }
  return undefined;
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

async function runPackageLifecycle(browser: Browser, label: string): Promise<void> {
  const start = Date.now();
  const { provider, runId } = runDestructiveQaPreflight();
  const content = buildQaPackageContent(runId);

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
  const baselinePackageCountA = await provider.countRows("packages", {
    beautician_profile_id: proAId,
  });
  const baselinePackageCountB = await provider.countRows("packages", {
    beautician_profile_id: proBId,
  });
  const baselinePackageServicesCount = await provider.countRows("package_services", {});
  const preexisting = await provider.rowExists("packages", { name: content.name });
  expect(preexisting, "no package matching this runId should pre-exist").toBe(false);

  let packageId: string | null = null;
  let quotePackageId: string | null = null;
  let profileTemporarilyPublished = false;

  try {
    // ---- fixture prerequisite: make Professional A's public page reachable ----
    if (originalStatus !== "published") {
      await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
      profileTemporarilyPublished = true;
    }

    // ---- §11 Admin creates a hidden Package (real UI) ----
    const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const adminPage = await adminCtx.newPage();
    await openPackagesTab(adminPage, beautyfolioProject.qaIdentities.professionalA.slug);
    await createPackageViaAdmin(adminPage, {
      name: content.name,
      bestFor: content.bestFor,
      price: content.price,
      priceType: "Fixed",
      inclusions: content.inclusions,
      note: content.note,
      active: false,
    });

    // ---- §12 DB create assertions ----
    const created = await provider.getRow("packages", { name: content.name });
    expect(created, "created package row must exist").not.toBeNull();
    packageId = created!["id"] as string;
    expect(created!["beautician_profile_id"]).toBe(proAId);
    expect(created!["best_for"]).toBe(content.bestFor);
    expect(Number(created!["price"])).toBe(Number(content.price));
    expect(created!["price_type"]).toBe("fixed");
    expect(created!["inclusions"]).toEqual(content.inclusions);
    expect(created!["note"]).toBe(content.note);
    expect(created!["is_active"]).toBe(false);
    const sortOrderAfterCreate = created!["sort_order"];
    const proBHasIt = await provider.rowExists("packages", {
      beautician_profile_id: proBId,
      name: content.name,
    });
    expect(proBHasIt, "Professional B must not have a matching package").toBe(false);

    // ---- §13 package_services assertion — table is unused by the current
    // application (audited in packages.server.ts), so creating a package
    // must not incidentally create any package_services rows ----
    const packageServicesCountAfterCreate = await provider.countRows("package_services", {});
    expect(
      packageServicesCountAfterCreate,
      "package_services must remain unused — no rows created by a package create",
    ).toBe(baselinePackageServicesCount);

    // ---- §14 create audit ----
    const createAuditExists = await provider.rowExists("audit_logs", {
      action: "package_created",
      entity_type: "package",
      entity_id: packageId,
    });
    expect(createAuditExists, "package_created audit row must exist").toBe(true);

    // ---- §15 dashboard sync (Professional A sees it; Professional B doesn't) ----
    const proACtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage = await proACtx.newPage();
    await proAPage.goto("/dashboard/packages");
    await expect(proAPage.getByText(content.name)).toBeVisible({ timeout: 10_000 });
    await proACtx.close();

    const proBCtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-b.json`,
    });
    const proBPage = await proBCtx.newPage();
    await proBPage.goto("/dashboard/packages");
    await expect(proBPage.getByText(content.name)).toHaveCount(0);
    await proBPage.close(); // context stays open for later cross-tenant test

    // ---- §16 hidden public assertion (no dedicated Package detail route
    // exists in the current architecture — confirmed by audit; only the
    // main portfolio listing applies) ----
    const publicCtx1 = await browser.newContext();
    const publicPage1 = await publicCtx1.newPage();
    await publicPage1.goto(`/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}`);
    await expect(publicPage1.getByText(content.name)).toHaveCount(0);
    await publicCtx1.close();

    // ---- §17 partial edit: note only ----
    await editPackageNoteOnly(adminPage, content.name, content.editedNote);

    // ---- §17/§23 verify partial-edit integrity — all unrelated fields preserved ----
    const afterEdit = await provider.getRow("packages", { id: packageId });
    expect(afterEdit!["note"]).toBe(content.editedNote);
    expect(afterEdit!["name"]).toBe(content.name);
    expect(afterEdit!["best_for"]).toBe(content.bestFor);
    expect(Number(afterEdit!["price"])).toBe(Number(content.price));
    expect(afterEdit!["price_type"]).toBe("fixed");
    expect(afterEdit!["inclusions"]).toEqual(content.inclusions);
    expect(afterEdit!["is_active"]).toBe(false);
    expect(afterEdit!["sort_order"]).toBe(sortOrderAfterCreate);

    // ---- §24 update audit ----
    const updateAuditExists = await provider.rowExists("audit_logs", {
      action: "package_updated",
      entity_type: "package",
      entity_id: packageId,
    });
    expect(updateAuditExists, "package_updated audit row must exist").toBe(true);

    // ---- §19 focused price-regression case: custom_quote with a valid
    // numeric price (Package custom_quote always requires a numeric price,
    // unlike Services) ----
    await createPackageViaAdmin(adminPage, {
      name: content.quoteName,
      price: content.quotePrice,
      priceType: "Custom quote",
      inclusions: content.quoteInclusions,
      active: false,
    });
    const quoteRow = await provider.getRow("packages", { name: content.quoteName });
    expect(quoteRow, "custom_quote package row must exist").not.toBeNull();
    quotePackageId = quoteRow!["id"] as string;
    expect(quoteRow!["price_type"]).toBe("custom_quote");
    expect(Number(quoteRow!["price"])).toBe(Number(content.quotePrice));

    // ---- §20 optional second price-type transition on the companion
    // package: custom_quote -> fixed, unrelated fields must survive ----
    await changePriceTypeOnly(adminPage, content.quoteName, "Fixed");
    const quoteAfterTransition = await provider.getRow("packages", { id: quotePackageId });
    expect(quoteAfterTransition!["price_type"]).toBe("fixed");
    expect(Number(quoteAfterTransition!["price"])).toBe(Number(content.quotePrice));
    expect(quoteAfterTransition!["name"]).toBe(content.quoteName);
    expect(quoteAfterTransition!["inclusions"]).toEqual(content.quoteInclusions);

    // ---- §21 activate the primary package (real UI, toggle only) ----
    await toggleActiveOnly(adminPage, content.name, true);

    const afterPublish = await provider.getRow("packages", { id: packageId });
    expect(afterPublish!["id"]).toBe(packageId);
    expect(afterPublish!["name"]).toBe(content.name);
    expect(afterPublish!["note"]).toBe(content.editedNote);
    expect(afterPublish!["price_type"]).toBe("fixed");
    expect(Number(afterPublish!["price"])).toBe(Number(content.price));
    expect(afterPublish!["inclusions"]).toEqual(content.inclusions);
    expect(afterPublish!["sort_order"]).toBe(sortOrderAfterCreate);
    expect(afterPublish!["is_active"]).toBe(true);
    const countAfterPublish = await provider.countRows("packages", { id: packageId });
    expect(countAfterPublish, "no duplicate package row").toBe(1);

    // ---- §22/§23 public portfolio + public price rendering ----
    const publicCtx2 = await browser.newContext();
    const publicPage2 = await publicCtx2.newPage();
    await publicPage2.goto(`/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}`);
    await expect(publicPage2.getByRole("heading", { name: content.name, level: 3 })).toBeVisible({
      timeout: 10_000,
    });
    const formattedPrice = `₹${Number(content.price).toLocaleString("en-IN")}`;
    await expect(publicPage2.getByText(formattedPrice).first()).toBeVisible();
    for (const inclusion of content.inclusions) {
      await expect(publicPage2.getByText(inclusion)).toBeVisible();
    }

    // ---- §24/§31 Package JSON-LD (Offer within the main portfolio graph —
    // fixed price_type must produce an Offer with a plain numeric price) ----
    const jsonLd = await readJsonLd(publicPage2);
    expect(jsonLd, "portfolio JSON-LD must parse").not.toBeNull();
    const offerForPackage = findOfferForItem(jsonLd, content.name);
    expect(
      offerForPackage,
      "an Offer entity must exist for the active fixed-price package",
    ).not.toBeUndefined();
    expect(offerForPackage!["price"]).toBe(Number(content.price));
    await publicCtx2.close();

    // ---- §25 readiness effect — audited: Packages do not participate in
    // any readiness/indexability computation in this product (confirmed no
    // "package" reference in evaluatePortfolioContentReadiness or related
    // helpers) — NOT APPLICABLE, no assertion to make here.

    // ---- §26/§27 cross-tenant negative — Professional B ----
    const preAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: packageId,
      action: "package_updated",
    });
    const preAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: packageId,
      action: "package_deleted",
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
      .from("packages")
      .update({ note: "QA_E2E_REJECTED_CROSS_TENANT_ATTEMPT" })
      .eq("id", packageId)
      .select();
    expect(updateAttempt.data?.length ?? 0, "cross-tenant update must affect zero rows").toBe(0);

    const deleteAttempt = await proBClient.from("packages").delete().eq("id", packageId).select();
    expect(deleteAttempt.data?.length ?? 0, "cross-tenant delete must affect zero rows").toBe(0);
    await proBClient.auth.signOut();

    const unchangedAfterAttempts = await provider.getRow("packages", { id: packageId });
    expect(
      unchangedAfterAttempts,
      "package must still exist after rejected cross-tenant attempts",
    ).not.toBeNull();
    expect(unchangedAfterAttempts!["note"]).toBe(content.editedNote);

    const postAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: packageId,
      action: "package_updated",
    });
    const postAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: packageId,
      action: "package_deleted",
    });
    expect(
      postAttemptUpdateAuditCount,
      "no new package_updated audit row from the rejected attempt",
    ).toBe(preAttemptUpdateAuditCount);
    expect(
      postAttemptDeleteAuditCount,
      "no new package_deleted audit row from the rejected attempt",
    ).toBe(preAttemptDeleteAuditCount);
    await proBCtx.close();

    // ---- §28 admin delete (real UI) ----
    await deletePackageViaAdmin(adminPage, content.name);
    await deletePackageViaAdmin(adminPage, content.quoteName);
    quotePackageId = null;

    // ---- §29 delete assertions ----
    const afterDelete = await provider.getRow("packages", { id: packageId });
    expect(afterDelete, "package row must be gone after delete").toBeNull();
    await expect(adminPage.getByText(content.name)).toHaveCount(0);

    const proACtx2 = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage2 = await proACtx2.newPage();
    await proAPage2.goto("/dashboard/packages");
    await expect(proAPage2.getByText(content.name)).toHaveCount(0);
    await proACtx2.close();

    const publicCtx3 = await browser.newContext();
    const publicPage3 = await publicCtx3.newPage();
    await publicPage3.goto(`/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}`);
    await expect(publicPage3.getByText(content.name)).toHaveCount(0);
    await publicCtx3.close();

    const proBStillFine = await provider.countRows("packages", {
      beautician_profile_id: proBId,
    });
    expect(proBStillFine, "Professional B's package count must be unaffected").toBe(
      baselinePackageCountB,
    );

    // ---- §41 package_services cleanup — never touched since never created ----
    const packageServicesFinal = await provider.countRows("package_services", {});
    expect(packageServicesFinal, "package_services must remain unused throughout").toBe(
      baselinePackageServicesCount,
    );

    // ---- §30 delete audit ----
    const deleteAuditExists = await provider.rowExists("audit_logs", {
      action: "package_deleted",
      entity_type: "package",
      entity_id: packageId,
    });
    expect(deleteAuditExists, "package_deleted audit row must exist").toBe(true);

    await adminCtx.close();

    // ---- §44 final orphan / baseline-restore check ----
    const finalCountA = await provider.countRows("packages", { beautician_profile_id: proAId });
    expect(finalCountA, "Professional A package count must return to baseline").toBe(
      baselinePackageCountA,
    );
    const runIdOrphan = await provider.rowExists("packages", { name: content.name });
    expect(runIdOrphan, "no package with this runId may remain").toBe(false);
  } finally {
    // Safety-net cleanup — runs regardless of pass/fail above.
    if (packageId) {
      await provider.deleteRow("packages", { id: packageId }).catch(() => {});
    }
    if (quotePackageId) {
      await provider.deleteRow("packages", { id: quotePackageId }).catch(() => {});
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
  .serial("Packages automated lifecycle pilot @crud @packages @tenant @audit @seo", () => {
  test("full lifecycle — first run", async ({ browser }) => {
    await runPackageLifecycle(browser, "first lifecycle");
  });

  test("full lifecycle — second run (idempotency / re-run proof)", async ({ browser }) => {
    await runPackageLifecycle(browser, "second lifecycle");
  });

  test.afterAll(() => {
    console.log("Package lifecycle runtime measurements:");
    for (const t of timings) {
      console.log(`  ${t.label}: ${(t.ms / 1000).toFixed(1)}s`);
    }
  });
});
