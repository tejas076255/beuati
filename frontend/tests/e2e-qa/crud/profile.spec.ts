// QA-1N-D2 — Profile + Cover image lifecycle fix regression. DESTRUCTIVE.
// Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:profile` / `test:e2e:qa:crud` scripts.
//
// Audited architecture (QA-1N-D1, confirmed live): Profile photo and Cover
// photo upload IMMEDIATELY on file selection (Videos' original shape, not
// Gallery/Before&After's Save-gated shape) via the same shared
// ProfileManager component (src/components/profile/profile-manager.tsx)
// used by both /dashboard/profile and the admin workspace's Profile tab.
// The persisted DB fields (beautician_profiles.profile_image_url /
// .cover_image_url) hold full PUBLIC URLs, not bare storage_path — unique
// among every other media module. This is a full-page form, not a dialog:
// "close" means an in-app navigation away (unmount), not an X/Escape.
import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { runDestructiveQaPreflight } from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const AUTH_DIR = "playwright/.auth";
const BUCKET = "portfolio-media";
const FIXTURE_A = fileURLToPath(new URL("../../fixtures/images/qa-gallery.png", import.meta.url));
const FIXTURE_B = fileURLToPath(new URL("../../fixtures/images/qa-before.png", import.meta.url));
const INVALID_FIXTURE = fileURLToPath(
  new URL("../../fixtures/images/invalid.txt", import.meta.url),
);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

const photoImg = (page: Page) => page.locator("form img.rounded-full");
// Distinct from photoImg — the cover <img> also carries "object-cover" but
// is the only one with "absolute inset-0" (the hero-banner background).
const coverImg = (page: Page) => page.locator("form img.absolute.inset-0");
const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;

async function openProfilePage(page: Page): Promise<void> {
  await page.goto("/dashboard/profile");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible({ timeout: 10_000 });
}

// Toast text ("Photo uploaded"/"Cover photo uploaded") is unreliable as a
// completion signal for the SAME reason saveAndExpectProfileSuccess had to
// stop trusting toast text: a previous upload's toast can still be
// visible when a later upload's wait begins. Polling the rendered <img
// src> instead only resolves once THIS upload's state update has actually
// landed.
async function uploadPhotoAndWait(page: Page, fixturePath: string, matchFragment: string) {
  await page.locator("#profile-photo-input").setInputFiles(fixturePath);
  await expect
    .poll(async () => photoImg(page).getAttribute("src"), { timeout: 10_000 })
    .toContain(matchFragment);
  return photoImg(page).getAttribute("src");
}

async function uploadCoverAndWait(page: Page, fixturePath: string, matchFragment: string) {
  await page.locator("#cover-photo-input").setInputFiles(fixturePath);
  await expect
    .poll(async () => coverImg(page).getAttribute("src"), { timeout: 10_000 })
    .toContain(matchFragment);
  return coverImg(page).getAttribute("src");
}

// Toast text alone is unreliable here (QA-1E lesson, same root cause as
// every other module's saveAndExpectSuccess/Failure helper): a PREVIOUS
// save's toast can still be visible when a later save's wait begins,
// since this is a full page with no dialog to race a close against. The
// button's "Saving…" transient is not a safe signal to assert either —
// a route.abort()-driven failure can settle back to "Save changes" faster
// than a poll can observe the transient state. Instead this simply waits
// for the button to become enabled again after the click, which can only
// happen once THIS submit's async onSave has settled (success or
// failure) — every caller verifies the actual outcome afterward via DB
// state, which is what actually matters.
async function waitForProfileSaveSettled(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Save changes", exact: true });
  await expect(button).toBeVisible({ timeout: 10_000 });
  await expect(button).toBeEnabled({ timeout: 10_000 });
}

async function saveAndExpectProfileSuccess(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await waitForProfileSaveSettled(page);
}

async function saveAndExpectProfileFailure(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await waitForProfileSaveSettled(page);
}

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

async function objectsUnder(
  provider: Awaited<ReturnType<typeof runDestructiveQaPreflight>>["provider"],
): Promise<string[]> {
  return provider.listStorageObjects(BUCKET, `profiles/${proASlug}/profile`);
}

// QA-1N-D2 — live investigation found that Supabase Storage's list()
// endpoint (what listStorageObjects/objectsUnder polls) can lag behind a
// just-completed delete by more than the storage-write itself takes: a
// network trace showed the DELETE request return 200 for the exact
// correct path within ~1s of being issued, while polling list() for up
// to 20s afterward still showed the object present. This is Storage-side
// list-consistency lag, not an application defect — the delete demonstrably
// already succeeded. Tracking the actual DELETE response here (deterministic,
// fast, immune to list-lag) is the reliable way to assert the application's
// compensation logic actually fired, for the two tests where the delete
// happens with minimal elapsed time before the very next assertion.
function trackDeleteResponses(page: Page): { path: string; status: number }[] {
  const deletes: { path: string; status: number }[] = [];
  page.on("response", (res) => {
    if (
      res.request().method() === "DELETE" &&
      res.url() === `${requireEnv("SUPABASE_URL")}/storage/v1/object/${BUCKET}`
    ) {
      try {
        const body = JSON.parse(res.request().postData() ?? "{}") as { prefixes?: string[] };
        for (const path of body.prefixes ?? []) deletes.push({ path, status: res.status() });
      } catch {
        // ignore malformed bodies — nothing to track
      }
    }
  });
  return deletes;
}

async function resetProfileImages(
  provider: Awaited<ReturnType<typeof runDestructiveQaPreflight>>["provider"],
): Promise<void> {
  await provider.updateRow(
    "beautician_profiles",
    { slug: proASlug },
    { profile_image_url: null, cover_image_url: null },
  );
  const objects = await objectsUnder(provider);
  for (const name of objects) {
    await provider
      .deleteStorageObject(BUCKET, `profiles/${proASlug}/profile/${name}`)
      .catch(() => {});
  }
}

test.describe("Profile image lifecycle regression @crud @profile @storage", () => {
  test.beforeEach(async () => {
    const { provider } = runDestructiveQaPreflight();
    await resetProfileImages(provider);
  });

  test.afterAll(async () => {
    const { provider } = runDestructiveQaPreflight();
    await resetProfileImages(provider);
  });

  test("abandon: select photo, navigate away without save — application deletes it", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const baseline = await objectsUnder(provider);

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);
    await uploadPhotoAndWait(page, FIXTURE_A, "qa-gallery.png");

    const afterSelect = await objectsUnder(provider);
    expect(afterSelect.filter((n) => !baseline.includes(n)).length, "upload must be real").toBe(1);

    // In-app client-side navigation — this is what actually unmounts the
    // full-page ProfileManager component; page.goto() would be a hard
    // reload and would never exercise the unmount cleanup effect. The
    // cleanup's delete call is fire-and-forget, so the context must stay
    // open (and the browser process alive) until the poll below actually
    // observes it complete — closing the context first would cancel any
    // still-in-flight request.
    await page.getByRole("link", { name: "Gallery" }).click();
    await expect(page).toHaveURL(/\/dashboard\/gallery/);

    await expect
      .poll(async () => (await objectsUnder(provider)).filter((n) => !baseline.includes(n)), {
        timeout: 20_000,
        message: "abandoned photo upload must be deleted by the application",
      })
      .toEqual([]);

    await ctx.close();
  });

  test("abandon: select cover, navigate away without save — application deletes it", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const baseline = await objectsUnder(provider);

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);
    await uploadCoverAndWait(page, FIXTURE_A, "qa-gallery.png");

    const afterSelect = await objectsUnder(provider);
    expect(afterSelect.filter((n) => !baseline.includes(n)).length, "upload must be real").toBe(1);

    await page.getByRole("link", { name: "Gallery" }).click();
    await expect(page).toHaveURL(/\/dashboard\/gallery/);

    await expect
      .poll(async () => (await objectsUnder(provider)).filter((n) => !baseline.includes(n)), {
        timeout: 20_000,
        message: "abandoned cover upload must be deleted by the application",
      })
      .toEqual([]);

    await ctx.close();
  });

  test("supersede: photo A then B before save — A deleted, B retained", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    const deletes = trackDeleteResponses(page);
    await openProfilePage(page);

    const srcA = await uploadPhotoAndWait(page, FIXTURE_A, "qa-gallery.png");
    const pathA = new URL(srcA!).pathname.split(`/${BUCKET}/`)[1];
    if (!pathA) throw new Error("Failed to derive storage path from A's public URL.");
    const srcB = await uploadPhotoAndWait(page, FIXTURE_B, "qa-before.png");
    expect(srcB).not.toBe(srcA);

    // The application must have issued a successful delete for exactly
    // A's path — checked via the actual network response, not a
    // Storage-list poll (see trackDeleteResponses's comment for why).
    await expect
      .poll(() => deletes.some((d) => d.path === pathA && d.status === 200), {
        timeout: 10_000,
        message: "A's superseded object must have been deleted with a successful response",
      })
      .toBe(true);
    expect(deletes.length, "exactly one delete call — never a batch/prefix-wide one").toBe(1);

    await page.getByRole("link", { name: "Gallery" }).click();
    await ctx.close();
  });

  test("supersede: cover A then B before save — A deleted, B retained (independent of Profile)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    const deletes = trackDeleteResponses(page);
    await openProfilePage(page);

    const srcA = await uploadCoverAndWait(page, FIXTURE_A, "qa-gallery.png");
    const pathA = new URL(srcA!).pathname.split(`/${BUCKET}/`)[1];
    if (!pathA) throw new Error("Failed to derive storage path from A's public URL.");

    const srcB = await uploadCoverAndWait(page, FIXTURE_B, "qa-before.png");
    expect(srcB).not.toBe(srcA);

    await expect
      .poll(() => deletes.some((d) => d.path === pathA && d.status === 200), {
        timeout: 10_000,
        message: "cover A's superseded object must have been deleted with a successful response",
      })
      .toBe(true);
    expect(deletes.length, "exactly one delete call — never a batch/prefix-wide one").toBe(1);

    await page.getByRole("link", { name: "Gallery" }).click();
    await ctx.close();
  });

  test("mixed: Profile A + Cover A, then replace Profile A->B — Cover A untouched (§9)", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const baseline = await objectsUnder(provider);

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);

    await uploadPhotoAndWait(page, FIXTURE_A, "qa-gallery.png");
    await uploadCoverAndWait(page, FIXTURE_A, "qa-gallery.png");
    const afterBoth = await objectsUnder(provider);
    const coverAObjects = afterBoth.filter((n) => !baseline.includes(n));
    expect(coverAObjects.length, "two independent objects (profile A + cover A)").toBe(2);

    await uploadPhotoAndWait(page, FIXTURE_B, "qa-before.png");

    await expect
      .poll(
        async () => {
          const current = await objectsUnder(provider);
          // Cover's object must still be present, untouched by the
          // profile-side supersede.
          return coverAObjects.filter((n) => current.includes(n)).length;
        },
        { timeout: 20_000, message: "cover A must survive a profile-side replacement" },
      )
      .toBe(1);

    await page.getByRole("link", { name: "Gallery" }).click();
    await ctx.close();
  });

  test("remove-pending: upload NEW then click Remove photo before save — NEW deleted immediately", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const baseline = await objectsUnder(provider);

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);
    await uploadPhotoAndWait(page, FIXTURE_A, "qa-gallery.png");

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Remove photo" }).click();
    await expect(page.locator("form").getByText("No photo")).toBeVisible({ timeout: 5_000 });

    // Application must delete it immediately on Remove — before any
    // navigation/unmount, not merely eventually.
    await expect
      .poll(async () => (await objectsUnder(provider)).filter((n) => !baseline.includes(n)), {
        timeout: 20_000,
        message: "pending NEW must be deleted immediately by Remove photo",
      })
      .toEqual([]);

    const row = await provider.getRow("beautician_profiles", { slug: proASlug });
    expect(row?.["profile_image_url"], "DB must be unchanged until Save").toBeNull();

    await ctx.close();
  });

  test("successful replacement: OLD -> NEW on save — OLD deleted only after DB success (MANDATORY, §30)", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const baseline = await objectsUnder(provider);

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);

    // Persist OLD first.
    await uploadPhotoAndWait(page, FIXTURE_A, "qa-gallery.png");
    await saveAndExpectProfileSuccess(page);
    const rowAfterFirstSave = await provider.getRow("beautician_profiles", { slug: proASlug });
    const oldUrl = rowAfterFirstSave?.["profile_image_url"] as string;
    expect(oldUrl).toContain("qa-gallery.png");

    // Now replace with NEW and save again.
    await uploadPhotoAndWait(page, FIXTURE_B, "qa-before.png");
    await saveAndExpectProfileSuccess(page);
    const rowAfterSecondSave = await provider.getRow("beautician_profiles", { slug: proASlug });
    const newUrl = rowAfterSecondSave?.["profile_image_url"] as string;
    expect(newUrl).toContain("qa-before.png");
    expect(newUrl).not.toBe(oldUrl);

    // NEW must exist.
    const finalObjects = await objectsUnder(provider);
    expect(
      finalObjects.some((n) => n.includes("qa-before.png")),
      "NEW must exist",
    ).toBe(true);

    // OLD must be gone — the QA-1N-D1-confirmed ordinary-successful-path
    // leak this phase exists to fix.
    await expect
      .poll(async () => (await objectsUnder(provider)).some((n) => n.includes("qa-gallery.png")), {
        timeout: 20_000,
        message: "OLD must be deleted after a successful replacement",
      })
      .toBe(false);

    await ctx.close();
  });

  test("successful cover replacement: OLD -> NEW on save — OLD deleted only after DB success (MANDATORY, §31)", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);

    await uploadCoverAndWait(page, FIXTURE_A, "qa-gallery.png");
    await saveAndExpectProfileSuccess(page);
    const rowAfterFirstSave = await provider.getRow("beautician_profiles", { slug: proASlug });
    const oldUrl = rowAfterFirstSave?.["cover_image_url"] as string;
    expect(oldUrl).toContain("qa-gallery.png");

    await uploadCoverAndWait(page, FIXTURE_B, "qa-before.png");
    await saveAndExpectProfileSuccess(page);
    const rowAfterSecondSave = await provider.getRow("beautician_profiles", { slug: proASlug });
    const newUrl = rowAfterSecondSave?.["cover_image_url"] as string;
    expect(newUrl).toContain("qa-before.png");

    const finalObjects = await objectsUnder(provider);
    expect(finalObjects.some((n) => n.includes("qa-before.png"))).toBe(true);

    await expect
      .poll(async () => (await objectsUnder(provider)).some((n) => n.includes("qa-gallery.png")), {
        timeout: 20_000,
        message: "OLD cover must be deleted after a successful replacement",
      })
      .toBe(false);

    await ctx.close();
  });

  test("remove-persisted: persist OLD, choose Remove, save — DB null and OLD deleted", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);

    await uploadPhotoAndWait(page, FIXTURE_A, "qa-gallery.png");
    await saveAndExpectProfileSuccess(page);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Remove photo" }).click();
    await expect(page.locator("form").getByText("No photo")).toBeVisible({ timeout: 5_000 });
    await saveAndExpectProfileSuccess(page);

    const row = await provider.getRow("beautician_profiles", { slug: proASlug });
    expect(row?.["profile_image_url"], "DB field must be null after Remove+Save").toBeNull();

    await expect
      .poll(async () => (await objectsUnder(provider)).some((n) => n.includes("qa-gallery.png")), {
        timeout: 20_000,
        message: "OLD must be deleted after a successful remove+save",
      })
      .toBe(false);

    await ctx.close();
  });

  test("save-failure: OLD preserved, NEW kept pending for retry, then deleted on abandon (§34)", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);

    // Persist OLD first.
    await uploadPhotoAndWait(page, FIXTURE_A, "qa-gallery.png");
    await saveAndExpectProfileSuccess(page);
    const rowAfterFirstSave = await provider.getRow("beautician_profiles", { slug: proASlug });
    const oldUrl = rowAfterFirstSave?.["profile_image_url"] as string;

    // Upload NEW (real), then force the Save's server function to fail —
    // network-level abort, since a fulfilled synthetic error is silently
    // treated as success by the server-function RPC client (QA-1M finding).
    await uploadPhotoAndWait(page, FIXTURE_B, "qa-before.png");
    await page.route("**/_serverFn/**", async (route) => {
      if (
        route.request().method() === "POST" &&
        isServerFnCall(route.request().url(), "updateProfileFn")
      ) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await saveAndExpectProfileFailure(page);
    await page.unroute("**/_serverFn/**");

    // DB must still reference OLD; OLD must still exist.
    const rowAfterFailedSave = await provider.getRow("beautician_profiles", { slug: proASlug });
    expect(rowAfterFailedSave?.["profile_image_url"]).toBe(oldUrl);
    expect(
      await provider.storageObjectExists(BUCKET, new URL(oldUrl).pathname.split(`/${BUCKET}/`)[1]!),
    ).toBe(true);

    // NEW must still be present WHILE the page remains active (retry-friendly).
    const objectsWhileActive = await objectsUnder(provider);
    expect(
      objectsWhileActive.some((n) => n.includes("qa-before.png")),
      "NEW retained for retry",
    ).toBe(true);

    // Now abandon — navigate away without retrying.
    await page.getByRole("link", { name: "Gallery" }).click();

    await expect
      .poll(async () => (await objectsUnder(provider)).some((n) => n.includes("qa-before.png")), {
        timeout: 20_000,
        message: "abandoned NEW must be deleted after navigating away",
      })
      .toBe(false);

    // OLD must still exist, untouched throughout.
    expect(
      (await objectsUnder(provider)).some((n) => n.includes("qa-gallery.png")),
      "OLD must survive the whole failed-save-then-abandon sequence",
    ).toBe(true);

    await ctx.close();
  });

  test("cross-tenant: Professional B cannot update A's image field or delete A's storage object", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    const proAId = proA?.["id"] as string;

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);
    await uploadPhotoAndWait(page, FIXTURE_A, "qa-gallery.png");
    await saveAndExpectProfileSuccess(page);
    await ctx.close();

    const row = await provider.getRow("beautician_profiles", { slug: proASlug });
    const seededUrl = row?.["profile_image_url"] as string;
    const seededPath = new URL(seededUrl).pathname.split(`/${BUCKET}/`)[1];
    if (!seededPath) throw new Error("Failed to derive storage path.");

    const proBClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
    );
    const signIn = await proBClient.auth.signInWithPassword({
      email: requireEnv("QA_PRO_B_EMAIL"),
      password: requireEnv("QA_PRO_B_PASSWORD"),
    });
    expect(signIn.error).toBeNull();

    const updateAttempt = await proBClient
      .from("beautician_profiles")
      .update({ profile_image_url: "https://example.com/hijacked.png" })
      .eq("id", proAId)
      .select();
    expect(updateAttempt.data?.length ?? 0, "cross-tenant DB update must affect zero rows").toBe(0);

    const deleteAttempt = await proBClient.storage.from(BUCKET).remove([seededPath]);
    expect(
      deleteAttempt.data?.length ?? 0,
      "cross-tenant storage delete must not report any object removed",
    ).toBe(0);

    await proBClient.auth.signOut();

    expect(await provider.storageObjectExists(BUCKET, seededPath), "object must survive").toBe(
      true,
    );
    const rowAfter = await provider.getRow("beautician_profiles", { slug: proASlug });
    expect(rowAfter?.["profile_image_url"], "DB must be unchanged").toBe(seededUrl);
  });

  test("invalid file: bad MIME rejected before any upload attempt", async ({ browser }) => {
    const { provider } = runDestructiveQaPreflight();
    const baseline = await objectsUnder(provider);

    const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-professional-a.json` });
    const page = await ctx.newPage();
    await openProfilePage(page);

    await page.locator("#profile-photo-input").setInputFiles(INVALID_FIXTURE);
    await expect(page.getByText("Please upload a JPG, PNG or WebP image.")).toBeVisible({
      timeout: 20_000,
    });

    const afterAttempt = await objectsUnder(provider);
    expect(afterAttempt, "no object may be created from a rejected file").toEqual(baseline);

    await ctx.close();
  });

  test("public fallback: profile_image_url null renders a genuine no-photo placeholder", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    const originalStatus = proA?.["status"] as string;
    let temporarilyPublished = false;
    if (originalStatus !== "published") {
      await provider.updateRow("beautician_profiles", { slug: proASlug }, { status: "published" });
      temporarilyPublished = true;
    }

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`/portfolio/${proASlug}`);
    const placeholder = page.getByRole("img", {
      name: new RegExp(proA?.["display_name"] as string),
    });
    await expect(placeholder).toBeVisible({ timeout: 10_000 });
    // Must not be a real broken <img> — the placeholder is a styled <div
    // role="img">, not an <img> tag with a src.
    const tagName = await placeholder.evaluate((el) => el.tagName);
    expect(tagName).not.toBe("IMG");
    await ctx.close();

    if (temporarilyPublished) {
      await provider.updateRow(
        "beautician_profiles",
        { slug: proASlug },
        { status: originalStatus },
      );
    }
  });
});
