// Lead-arrival notification — end-to-end proof that the public "Check
// availability" form still behaves identically now that it's routed
// through submitPortfolioLeadFn (a server function) instead of calling the
// submit_lead RPC directly from the browser. Recipient resolution,
// duplicate-notification safety, and provider-failure safety are proven
// against the live QA backend in tests/provider/lead-notification-
// provider.test.ts (direct function calls, transport injection) — this
// spec exists to prove the real browser -> server-fn -> RPC wiring itself
// hasn't regressed the public submission UX. DESTRUCTIVE — same
// QA_ALLOW_WRITES_OVERRIDE gate as every other crud/** spec.
import { expect, test } from "@playwright/test";
import {
  buildQaLeadContent,
  runDestructiveQaPreflight,
} from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;

function futureDateInput(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

test.describe.serial("Lead-arrival notification wiring @crud @leads @tenant", () => {
  test("real public submission via the server-fn seam still creates the lead and shows the same success UX", async ({
    browser,
  }) => {
    const { provider, runId } = runDestructiveQaPreflight();
    const content = buildQaLeadContent(runId);
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;
    const originalStatus = proA["status"] as string;

    let profileTemporarilyPublished = false;
    let serviceId: string | null = null;
    let leadId: string | null = null;

    try {
      if (originalStatus !== "published") {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
        profileTemporarilyPublished = true;
      }
      const seededService = await provider.insertRow("services", {
        beautician_profile_id: proAId,
        name: content.serviceName,
        is_active: true,
      });
      serviceId = seededService["id"] as string;

      const publicCtx = await browser.newContext();
      const publicPage = await publicCtx.newPage();
      await publicPage.goto(`/portfolio/${proASlug}`);

      const availabilitySection = publicPage.locator("#availability");
      await availabilitySection.scrollIntoViewIfNeeded();
      await availabilitySection.getByLabel("Your name").fill(content.clientName);
      await availabilitySection.getByLabel("Phone number").fill(content.phone);
      await availabilitySection.getByLabel("Event date").fill(futureDateInput(60));
      await availabilitySection.getByLabel("Service").selectOption({ label: content.serviceName });
      await availabilitySection.getByLabel("Location").fill(content.location);
      await availabilitySection.getByLabel("Message (optional)").fill(content.message);
      await availabilitySection.getByRole("button", { name: "Check availability" }).click();

      // Same success signal as before the server-fn seam was introduced —
      // proves the browser-visible behavior is unchanged.
      await expect(publicPage.getByText("Availability request sent")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        publicPage.getByText("This is a request, not a confirmed booking."),
      ).toBeVisible();
      await publicCtx.close();

      const createdLead = await provider.getRow("leads", {
        beautician_profile_id: proAId,
        phone: content.phone,
      });
      expect(createdLead, "submitted lead must exist for Professional A").not.toBeNull();
      leadId = createdLead!["id"] as string;
      expect(createdLead!["name"]).toBe(content.clientName);
      expect(createdLead!["status"]).toBe("new");

      // The notification attempt (mock transport — no RESEND_API_KEY is
      // configured in the QA env) must never have left the lead/inquiry
      // data in a partial state.
      const inquiry = await provider.getRow("lead_inquiries", { lead_id: leadId });
      expect(inquiry, "lead_inquiries row must exist alongside the lead").not.toBeNull();
    } finally {
      if (leadId) {
        await provider.deleteRow("leads", { id: leadId }).catch(() => {});
      }
      if (serviceId) {
        await provider.deleteRow("services", { id: serviceId }).catch(() => {});
      }
      if (profileTemporarilyPublished) {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: originalStatus });
      }
      const restored = await provider.getRow("beautician_profiles", { id: proAId });
      expect(restored?.["status"], "Professional A profile status must be restored exactly").toBe(
        originalStatus,
      );
      const orphanLead = await provider.rowExists("leads", { name: content.clientName });
      expect(orphanLead, "no lead with this runId may remain").toBe(false);
    }
  });
});
