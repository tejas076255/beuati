// QA-1E — FIRST automated business-CRUD pilot: the Admin FAQs lifecycle.
// DESTRUCTIVE. Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:crud` script.
//
// Node-only imports of the service-role provider are safe here (this file
// runs as the Playwright test-runner process, not inside a browser page —
// see supabase-provider.ts's header comment) as long as the key is never
// handed to page.evaluate/addInitScript. It isn't, anywhere in this file.
import { type Browser, type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  buildQaFaqContent,
  runDestructiveQaPreflight,
} from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";
import type { SupabaseQaProvider } from "../../helpers/providers/supabase-provider.ts";
import { saveAndExpectSuccess } from "../../helpers/ui/save-dialog.ts";

const AUTH_DIR = "playwright/.auth";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function openFaqsTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "FAQs", exact: true }).click();
}

async function createFaqViaAdmin(
  page: Page,
  question: string,
  answer: string,
  published: boolean,
): Promise<void> {
  await page.getByRole("button", { name: "Add FAQ" }).first().click();
  await page.getByLabel("Question").fill(question);
  await page.getByLabel("Answer").fill(answer);
  const checkbox = page.getByLabel(/Published/);
  if (published) {
    await checkbox.check();
  } else {
    await checkbox.uncheck();
  }
  await saveAndExpectSuccess(page);
}

function faqCard(page: Page, question: string) {
  const deleteBtn = page.getByLabel(`Delete FAQ: ${question}`);
  return deleteBtn.locator("xpath=ancestor::*[contains(@class,'p-5')][1]");
}

async function editFaqAnswerOnly(page: Page, question: string, newAnswer: string): Promise<void> {
  await faqCard(page, question).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Answer").fill(newAnswer);
  await saveAndExpectSuccess(page);
}

async function togglePublishOnly(page: Page, question: string, published: boolean): Promise<void> {
  await faqCard(page, question).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  const checkbox = page.getByLabel(/Published/);
  if (published) {
    await checkbox.check();
  } else {
    await checkbox.uncheck();
  }
  await saveAndExpectSuccess(page);
}

async function deleteFaqViaAdmin(page: Page, question: string): Promise<void> {
  page.once("dialog", (dialog) => void dialog.accept());
  await faqCard(page, question).getByLabel(`Delete FAQ: ${question}`).click();
  await expect(page.getByLabel(`Delete FAQ: ${question}`)).toHaveCount(0, { timeout: 10_000 });
}

async function readFaqPageJsonLd(page: Page): Promise<Record<string, unknown> | null> {
  const script = page.locator('script[type="application/ld+json"]');
  const count = await script.count();
  if (count === 0) return null;
  const text = await script.first().textContent();
  if (!text) return null;
  return JSON.parse(text) as Record<string, unknown>;
}

function findFaqPageNode(jsonLd: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!jsonLd) return null;
  const graph = jsonLd["@graph"];
  if (!Array.isArray(graph)) return null;
  return (graph.find((node) => (node as Record<string, unknown>)["@type"] === "FAQPage") ??
    null) as Record<string, unknown> | null;
}

interface LifecycleTiming {
  label: string;
  ms: number;
}
const timings: LifecycleTiming[] = [];

async function runFaqLifecycle(browser: Browser, label: string): Promise<void> {
  const start = Date.now();
  const { provider, runId } = runDestructiveQaPreflight();
  const content = buildQaFaqContent(runId);

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
  const baselineFaqCountA = await provider.countRows("faqs", { beautician_profile_id: proAId });
  const baselineFaqCountB = await provider.countRows("faqs", { beautician_profile_id: proBId });
  const preexisting = await provider.rowExists("faqs", { question: content.question });
  expect(preexisting, "no FAQ matching this runId should pre-exist").toBe(false);

  let faqId: string | null = null;
  let profileTemporarilyPublished = false;

  try {
    // ---- fixture prerequisite: make Professional A's public page reachable ----
    if (originalStatus !== "published") {
      await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
      profileTemporarilyPublished = true;
    }

    // ---- §8 Admin creates a hidden FAQ (real UI) ----
    const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
    const adminPage = await adminCtx.newPage();
    await openFaqsTab(adminPage, beautyfolioProject.qaIdentities.professionalA.slug);
    await createFaqViaAdmin(adminPage, content.question, content.initialAnswer, false);

    // ---- §9 DB assertion after create ----
    const created = await provider.getRow("faqs", { question: content.question });
    expect(created, "created FAQ row must exist").not.toBeNull();
    faqId = created!["id"] as string;
    expect(created!["answer"]).toBe(content.initialAnswer);
    expect(created!["beautician_profile_id"]).toBe(proAId);
    expect(created!["is_published"]).toBe(false);
    const sortOrderAfterCreate = created!["sort_order"];
    const proBHasIt = await provider.rowExists("faqs", {
      beautician_profile_id: proBId,
      question: content.question,
    });
    expect(proBHasIt, "Professional B must not have a matching FAQ").toBe(false);

    // ---- §10 create audit assertion ----
    const createAuditExists = await provider.rowExists("audit_logs", {
      action: "faq_created",
      entity_type: "faq",
      entity_id: faqId,
    });
    expect(createAuditExists, "faq_created audit row must exist").toBe(true);

    // ---- §11 dashboard sync (Professional A sees it; Professional B doesn't) ----
    const proACtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage = await proACtx.newPage();
    await proAPage.goto("/dashboard/faqs");
    await expect(proAPage.getByText(content.question)).toBeVisible({ timeout: 10_000 });
    await proACtx.close();

    const proBCtx = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-b.json`,
    });
    const proBPage = await proBCtx.newPage();
    await proBPage.goto("/dashboard/faqs");
    await expect(proBPage.getByText(content.question)).toHaveCount(0);
    await proBPage.close(); // context stays open for later cross-tenant test

    // ---- §12 public hidden assertion ----
    const publicCtx1 = await browser.newContext();
    const publicPage1 = await publicCtx1.newPage();
    await publicPage1.goto(`/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}`);
    await expect(publicPage1.getByText(content.question)).toHaveCount(0);
    const jsonLd1 = await readFaqPageJsonLd(publicPage1);
    const faqPageNode1 = findFaqPageNode(jsonLd1);
    const mainEntity1 = (faqPageNode1?.["mainEntity"] as { name?: string }[] | undefined) ?? [];
    expect(mainEntity1.some((e) => e.name === content.question)).toBe(false);
    await publicCtx1.close();

    // ---- §13 partial edit: answer only ----
    await editFaqAnswerOnly(adminPage, content.question, content.editedAnswer);

    // ---- §14... verify partial-edit integrity ----
    const afterEdit = await provider.getRow("faqs", { id: faqId });
    expect(afterEdit!["answer"]).toBe(content.editedAnswer);
    expect(afterEdit!["question"]).toBe(content.question);
    expect(afterEdit!["sort_order"]).toBe(sortOrderAfterCreate);
    expect(afterEdit!["is_published"]).toBe(false);

    const updateAuditExists = await provider.rowExists("audit_logs", {
      action: "faq_updated",
      entity_type: "faq",
      entity_id: faqId,
    });
    expect(updateAuditExists, "faq_updated audit row must exist").toBe(true);

    // ---- §15 publish via admin (toggle only) ----
    await togglePublishOnly(adminPage, content.question, true);

    const afterPublish = await provider.getRow("faqs", { id: faqId });
    expect(afterPublish!["id"]).toBe(faqId);
    expect(afterPublish!["question"]).toBe(content.question);
    expect(afterPublish!["answer"]).toBe(content.editedAnswer);
    expect(afterPublish!["sort_order"]).toBe(sortOrderAfterCreate);
    expect(afterPublish!["is_published"]).toBe(true);
    const countAfterPublish = await provider.countRows("faqs", { id: faqId });
    expect(countAfterPublish, "no duplicate FAQ row").toBe(1);

    // ---- §16/§17 public visible + FAQPage JSON-LD ----
    const publicCtx2 = await browser.newContext();
    const publicPage2 = await publicCtx2.newPage();
    await publicPage2.goto(`/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}`);
    await expect(publicPage2.getByText(content.question)).toBeVisible({ timeout: 10_000 });
    await expect(publicPage2.getByText(content.editedAnswer)).toBeVisible({ timeout: 10_000 });

    const jsonLd2 = await readFaqPageJsonLd(publicPage2);
    expect(jsonLd2, "JSON-LD must parse").not.toBeNull();
    const faqPageNode2 = findFaqPageNode(jsonLd2);
    expect(faqPageNode2, "FAQPage node must be present once published").not.toBeNull();
    const mainEntity2 =
      (faqPageNode2?.["mainEntity"] as
        { name?: string; acceptedAnswer?: { text?: string } }[] | undefined) ?? [];
    const ourEntry = mainEntity2.find((e) => e.name === content.question);
    expect(ourEntry, "our FAQ must appear in FAQPage mainEntity").toBeTruthy();
    expect(ourEntry?.acceptedAnswer?.text).toBe(content.editedAnswer);
    await publicCtx2.close();

    // ---- §19/§20 cross-tenant negative test (Professional B, RLS-level) ----
    const preAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: faqId,
      action: "faq_updated",
    });
    const preAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: faqId,
      action: "faq_deleted",
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
      .from("faqs")
      .update({ answer: "QA_E2E_REJECTED_CROSS_TENANT_ATTEMPT" })
      .eq("id", faqId)
      .select();
    expect(updateAttempt.data?.length ?? 0, "cross-tenant update must affect zero rows").toBe(0);

    const deleteAttempt = await proBClient.from("faqs").delete().eq("id", faqId).select();
    expect(deleteAttempt.data?.length ?? 0, "cross-tenant delete must affect zero rows").toBe(0);
    await proBClient.auth.signOut();

    const unchangedAfterAttempts = await provider.getRow("faqs", { id: faqId });
    expect(
      unchangedAfterAttempts,
      "FAQ must still exist after rejected cross-tenant attempts",
    ).not.toBeNull();
    expect(unchangedAfterAttempts!["answer"]).toBe(content.editedAnswer);

    const postAttemptUpdateAuditCount = await provider.countRows("audit_logs", {
      entity_id: faqId,
      action: "faq_updated",
    });
    const postAttemptDeleteAuditCount = await provider.countRows("audit_logs", {
      entity_id: faqId,
      action: "faq_deleted",
    });
    expect(
      postAttemptUpdateAuditCount,
      "no new faq_updated audit row from the rejected attempt",
    ).toBe(preAttemptUpdateAuditCount);
    expect(
      postAttemptDeleteAuditCount,
      "no new faq_deleted audit row from the rejected attempt",
    ).toBe(preAttemptDeleteAuditCount);
    await proBCtx.close();

    // ---- §21 admin delete (real UI) ----
    await deleteFaqViaAdmin(adminPage, content.question);

    // ---- §22 delete assertions ----
    const afterDelete = await provider.getRow("faqs", { id: faqId });
    expect(afterDelete, "FAQ row must be gone after delete").toBeNull();
    await expect(adminPage.getByText(content.question)).toHaveCount(0);

    const proACtx2 = await browser.newContext({
      storageState: `${AUTH_DIR}/qa-professional-a.json`,
    });
    const proAPage2 = await proACtx2.newPage();
    await proAPage2.goto("/dashboard/faqs");
    await expect(proAPage2.getByText(content.question)).toHaveCount(0);
    await proACtx2.close();

    const publicCtx3 = await browser.newContext();
    const publicPage3 = await publicCtx3.newPage();
    await publicPage3.goto(`/portfolio/${beautyfolioProject.qaIdentities.professionalA.slug}`);
    await expect(publicPage3.getByText(content.question)).toHaveCount(0);
    const jsonLd3 = await readFaqPageJsonLd(publicPage3);
    const faqPageNode3 = findFaqPageNode(jsonLd3);
    const mainEntity3 = (faqPageNode3?.["mainEntity"] as { name?: string }[] | undefined) ?? [];
    expect(mainEntity3.some((e) => e.name === content.question)).toBe(false);
    await publicCtx3.close();

    const proBStillFine = await provider.countRows("faqs", { beautician_profile_id: proBId });
    expect(proBStillFine, "Professional B's FAQ count must be unaffected").toBe(baselineFaqCountB);

    // ---- §23 delete audit assertion ----
    const deleteAuditExists = await provider.rowExists("audit_logs", {
      action: "faq_deleted",
      entity_type: "faq",
      entity_id: faqId,
    });
    expect(deleteAuditExists, "faq_deleted audit row must exist").toBe(true);

    await adminCtx.close();

    // ---- §24 final orphan / baseline-restore check ----
    const finalCountA = await provider.countRows("faqs", { beautician_profile_id: proAId });
    expect(finalCountA, "Professional A FAQ count must return to baseline").toBe(baselineFaqCountA);
    const runIdOrphan = await provider.rowExists("faqs", { question: content.question });
    expect(runIdOrphan, "no FAQ with this runId may remain").toBe(false);
  } finally {
    // Safety-net cleanup — runs regardless of pass/fail above.
    if (faqId) {
      await provider.deleteRow("faqs", { id: faqId }).catch(() => {});
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

test.describe.serial("FAQ automated lifecycle pilot @crud @faq @tenant @audit @seo", () => {
  test("full lifecycle — first run", async ({ browser }) => {
    await runFaqLifecycle(browser, "first lifecycle");
  });

  test("full lifecycle — second run (idempotency / re-run proof)", async ({ browser }) => {
    await runFaqLifecycle(browser, "second lifecycle");
  });

  test.afterAll(() => {
    console.log("FAQ lifecycle runtime measurements:");
    for (const t of timings) {
      console.log(`  ${t.label}: ${(t.ms / 1000).toFixed(1)}s`);
    }
  });
});
