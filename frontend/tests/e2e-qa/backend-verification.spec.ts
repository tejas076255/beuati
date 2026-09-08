// QA-1D Step 3B §5/§6 — before any identity is ever used to log in, prove
// the isolated QA browser runtime (playwright.qa.config.ts) is actually
// wired to the dedicated QA Supabase project, and prove no server-only
// secret reached the browser bundle. Entirely non-destructive: no
// credentials, no submission that could ever succeed.
import { expect, test } from "@playwright/test";

const QA_BACKEND_REF = "tidymcyhgxzqhpbmcmyr";
const PROTECTED_BACKEND_REF = "ivbujlyilzmlublqzalu";

test.describe("QA runtime backend verification @qa @readonly", () => {
  test("the browser's Supabase auth requests target the QA backend, never the protected one", async ({
    page,
  }) => {
    const requestHosts: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes(".supabase.co")) {
        requestHosts.push(new URL(url).hostname);
      }
    });

    await page.goto("/login");
    // See auth.setup.ts — must wait for hydration or the click falls
    // through to a native form GET instead of firing the Supabase request
    // this test needs to observe.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill("qa-runtime-verification-only@beautyfolio.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("not-a-real-password-just-proving-wiring");
    await page.getByRole("button", { name: /sign in/i }).click();

    // The submit always fails (dummy credentials) — we only need the
    // request to have been *sent* to learn which project it targeted.
    await page.waitForTimeout(1500);

    expect(requestHosts.length, "expected at least one Supabase request to fire").toBeGreaterThan(
      0,
    );
    const targetsProtected = requestHosts.some((h) => h.startsWith(PROTECTED_BACKEND_REF));
    const targetsQa = requestHosts.every((h) => h.startsWith(QA_BACKEND_REF));

    expect(targetsProtected, "a request targeted the protected production backend").toBe(false);
    expect(targetsQa, "every Supabase request must target the QA backend").toBe(true);
  });

  test("no server-only secret is present in any script/document served to the browser", async ({
    page,
  }) => {
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
    expect(
      serviceRoleKey.length,
      "SUPABASE_SERVICE_ROLE_KEY must be configured for this check",
    ).toBeGreaterThan(0);

    const bodies: string[] = [];
    page.on("response", async (response) => {
      const contentType = response.headers()["content-type"] ?? "";
      if (contentType.includes("javascript") || contentType.includes("html")) {
        try {
          bodies.push(await response.text());
        } catch {
          // Response body unavailable (e.g. already consumed) — skip.
        }
      }
    });

    await page.goto("/");
    await page.goto("/login");
    await page.goto("/dashboard"); // triggers the client bundle for the protected area too

    // Boolean-only assertion — never assert on the raw matched text, so a
    // failure's error message never echoes the secret value itself.
    //
    // Deliberately NOT also checking for the literal substring
    // "sb_secret_": src/integrations/supabase/client.ts's own
    // isNewSupabaseApiKey() contains that exact string as a legitimate,
    // client-side key-format check (`value.startsWith('sb_secret_')`) and
    // is bundled into every page — a substring check would permanently
    // false-positive on the app's own code, not on a leaked secret. Only
    // the actual configured secret VALUE is a meaningful signal.
    const exposedServiceRoleKey = bodies.some((body) => body.includes(serviceRoleKey));

    expect(exposedServiceRoleKey, "SERVER SECRET EXPOSED").toBe(false);
  });
});
