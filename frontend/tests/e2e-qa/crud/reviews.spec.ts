// QA-1O — Reviews module lifecycle regression. DESTRUCTIVE.
// Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:reviews` / `test:e2e:qa:crud` scripts.
//
// Audited architecture: `reviews` is NOT a public-submission table — there
// is no customer-facing review form anywhere in the product. Reviews are
// testimonials the beautician curates from external sources (source/
// source_url columns) via their own /dashboard/reviews page, and
// is_verified can only ever be set true by an admin session (DB trigger
// guard_review_verification). Admin has no create function either — only
// list/moderate(is_published,is_verified)/delete, newly wired this phase
// into a per-beautician tab at /admin/beauticians/$slug (previously only a
// platform-wide /admin/reviews list existed). Since there is no public or
// admin create path, QA seeds a review directly via the provider
// (insertRow), exactly matching the phase's explicit allowance to use the
// trusted QA/provider seeding mechanism when no product-level creation
// path exists to drive through the real UI.
import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  buildQaReviewContent,
  runDestructiveQaPreflight,
} from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const AUTH_DIR = "playwright/.auth";
const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function openReviewsTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Reviews", exact: true }).click();
}

test.describe.serial("Reviews module lifecycle @crud @reviews @tenant @audit", () => {
  test("full lifecycle: seed hidden -> admin sees -> publish -> public+aggregate -> unpublish -> delete", async ({
    browser,
  }) => {
    const { provider, runId } = runDestructiveQaPreflight();
    const content = buildQaReviewContent(runId);
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    const proB = await provider.getRow("beautician_profiles", {
      slug: beautyfolioProject.qaIdentities.professionalB.slug,
    });
    if (!proA || !proB) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;

    const originalStatus = proA["status"] as string;
    let profileTemporarilyPublished = false;
    let reviewId: string | null = null;

    try {
      // ---- §1 seed a hidden review directly (no public/admin create path exists) ----
      const inserted = await provider.insertRow("reviews", {
        beautician_profile_id: proAId,
        client_name: content.clientName,
        rating: content.rating,
        review_text: content.reviewText,
        service_name: content.serviceName,
        is_published: false,
      });
      reviewId = inserted["id"] as string;
      expect(inserted["is_verified"], "owner/service-role insert must never self-verify").toBe(
        false,
      );

      if (originalStatus !== "published") {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
        profileTemporarilyPublished = true;
      }

      // ---- §2 Admin sees the hidden review in the per-beautician tab (real UI) ----
      const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
      const adminPage = await adminCtx.newPage();
      await openReviewsTab(adminPage, proASlug);
      await expect(adminPage.getByText(content.clientName)).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByRole("button", { name: "Hidden" })).toBeVisible({
        timeout: 10_000,
      });

      // ---- §3/§4 hidden review absent publicly, excluded from aggregate ----
      const publicCtx1 = await browser.newContext();
      const publicPage1 = await publicCtx1.newPage();
      await publicPage1.goto(`/portfolio/${proASlug}`);
      await expect(publicPage1.getByText(content.clientName)).toHaveCount(0);
      // No published reviews at all yet for Professional A (clean QA
      // baseline) — the ReviewsSection renders nothing and no rating badge
      // appears, per the product's own "don't show a fabricated 0.0★"
      // convention (portfolio-sections.tsx).
      await expect(publicPage1.getByText(/out of 5/)).toHaveCount(0);
      await publicCtx1.close();

      // Direct RLS check: hidden review must not be selectable by an
      // anonymous/unauthorized client either.
      const anonClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const anonRead = await anonClient.from("reviews").select("id").eq("id", reviewId);
      expect(anonRead.data?.length ?? 0, "anon must not see the hidden review row").toBe(0);

      // ---- §5 Admin publishes it (real UI toggle) ----
      await adminPage.getByRole("button", { name: "Hidden" }).click();
      await expect(adminPage.getByRole("button", { name: "Published" })).toBeVisible({
        timeout: 10_000,
      });

      const rowAfterPublish = await provider.getRow("reviews", { id: reviewId });
      expect(rowAfterPublish?.["is_published"]).toBe(true);

      // ---- §6/§7 published review appears publicly, contributes to aggregate ----
      const publicCtx2 = await browser.newContext();
      const publicPage2 = await publicCtx2.newPage();
      await publicPage2.goto(`/portfolio/${proASlug}`);
      await expect(publicPage2.getByText(content.clientName)).toBeVisible({ timeout: 10_000 });
      // Exactly one published review at rating 5 -> aggregate rating = 5
      // (computeAggregateRating returns a plain number, rendered as "5"
      // not "5.0"), review count = 1. Scoped to the reviews section since
      // a bare "5" would otherwise be ambiguous on the page.
      const reviewsSection = publicPage2.locator("#reviews");
      await expect(reviewsSection.getByText("5", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(reviewsSection.getByText("1 reviews")).toBeVisible({ timeout: 10_000 });

      // JSON-LD AggregateRating reflects the same published-only value.
      // Parsed structurally (not substring-matched) so formatting
      // whitespace in the serialized script tag can't produce a false
      // negative.
      const jsonLdTexts = await publicPage2.evaluate(() =>
        Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
          (s) => s.textContent ?? "",
        ),
      );
      interface AggregateRating {
        ratingValue?: number;
        reviewCount?: number;
      }
      let aggregateRating: AggregateRating | null = null;
      for (const text of jsonLdTexts) {
        try {
          const parsed = JSON.parse(text) as { "@graph"?: Array<Record<string, unknown>> };
          for (const node of parsed["@graph"] ?? []) {
            if (node["aggregateRating"]) {
              aggregateRating = node["aggregateRating"] as AggregateRating;
            }
          }
        } catch {
          // not every script tag is necessarily this shape — skip
        }
      }
      expect(aggregateRating, "aggregateRating node must be present in JSON-LD").not.toBeNull();
      expect(aggregateRating?.ratingValue).toBe(5);
      expect(aggregateRating?.reviewCount).toBe(1);
      await publicCtx2.close();

      // ---- audit: review_moderated logged for the publish ----
      const publishAudit = await provider.rowExists("audit_logs", {
        action: "review_moderated",
        entity_type: "review",
        entity_id: reviewId,
      });
      expect(publishAudit, "review_moderated audit row must exist for publish").toBe(true);

      // ---- §10 cross-tenant: Professional B cannot mutate A's review ----
      const proBClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const signIn = await proBClient.auth.signInWithPassword({
        email: requireEnv("QA_PRO_B_EMAIL"),
        password: requireEnv("QA_PRO_B_PASSWORD"),
      });
      expect(signIn.error).toBeNull();
      const crossTenantUpdate = await proBClient
        .from("reviews")
        .update({ is_published: false })
        .eq("id", reviewId)
        .select();
      expect(
        crossTenantUpdate.data?.length ?? 0,
        "cross-tenant review update must affect zero rows",
      ).toBe(0);
      const crossTenantDelete = await proBClient
        .from("reviews")
        .delete()
        .eq("id", reviewId)
        .select();
      expect(
        crossTenantDelete.data?.length ?? 0,
        "cross-tenant review delete must affect zero rows",
      ).toBe(0);
      await proBClient.auth.signOut();

      const rowUnchanged = await provider.getRow("reviews", { id: reviewId });
      expect(
        rowUnchanged?.["is_published"],
        "review must survive rejected cross-tenant attempts",
      ).toBe(true);

      // ---- §8/§9 Admin unpublishes it — disappears publicly, aggregate resets ----
      await adminPage.getByRole("button", { name: "Published" }).click();
      await expect(adminPage.getByRole("button", { name: "Hidden" })).toBeVisible({
        timeout: 10_000,
      });

      const publicCtx3 = await browser.newContext();
      const publicPage3 = await publicCtx3.newPage();
      await publicPage3.goto(`/portfolio/${proASlug}`);
      await expect(publicPage3.getByText(content.clientName)).toHaveCount(0);
      await expect(publicPage3.getByText(/out of 5/)).toHaveCount(0);
      await publicCtx3.close();

      // ---- §12 hard delete via Admin ----
      adminPage.once("dialog", (dialog) => void dialog.accept());
      await adminPage
        .getByRole("button", { name: `Delete review by ${content.clientName}` })
        .click();
      await expect(adminPage.getByText(content.clientName)).toHaveCount(0, { timeout: 10_000 });

      const rowAfterDelete = await provider.getRow("reviews", { id: reviewId });
      expect(rowAfterDelete, "review row must be gone after delete").toBeNull();
      reviewId = null;

      const deleteAudit = await provider.rowExists("audit_logs", {
        action: "review_deleted",
        entity_type: "review",
      });
      expect(deleteAudit, "review_deleted audit row must exist").toBe(true);

      await adminCtx.close();
    } finally {
      if (reviewId) {
        await provider.deleteRow("reviews", { id: reviewId }).catch(() => {});
      }
      if (profileTemporarilyPublished) {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: originalStatus });
      }
      const restored = await provider.getRow("beautician_profiles", { id: proAId });
      expect(restored?.["status"], "Professional A profile status must be restored exactly").toBe(
        originalStatus,
      );
      const orphan = await provider.rowExists("reviews", { client_name: content.clientName });
      expect(orphan, "no review with this runId may remain").toBe(false);
    }
  });
});
