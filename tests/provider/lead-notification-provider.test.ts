// Lead-arrival email notification — live-backend coverage for
// submitPortfolioLead() (src/data/leads-submit.server.ts), called directly
// (bypassing the HTTP/server-fn boundary) against the isolated QA Supabase
// backend with injected clients/transport. DESTRUCTIVE — creates real lead
// rows on the QA backend, cleaned up in a finally block. Skips gracefully
// (same non-destructive-by-default contract as the rest of tests/provider/)
// unless BOTH SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are configured AND
// QA_ALLOW_WRITES_OVERRIDE=true is explicitly set for this process — never
// runs destructively as a side effect of the plain `npm run test:provider`.
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { submitPortfolioLead } from "../../src/data/leads-submit.server";
import {
  createResendTransport,
  type EmailPayload,
  type EmailSendResult,
  type EmailTransport,
} from "../../src/lib/email/transport";
import { createSupabaseProviderFromEnv } from "../helpers/providers/supabase-provider";
import {
  buildQaLeadContent,
  runDestructiveQaPreflight,
} from "../projects/beautyfolio/qa-destructive-preflight";
import { beautyfolioProject } from "../projects/beautyfolio/project";

const provider = createSupabaseProviderFromEnv();
const writesAllowed = process.env["QA_ALLOW_WRITES_OVERRIDE"] === "true";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

function recordingTransport(): EmailTransport & { sent: EmailPayload[] } {
  const sent: EmailPayload[] = [];
  return {
    sent,
    async send(payload: EmailPayload): Promise<EmailSendResult> {
      sent.push(payload);
      return { ok: true, provider: "mock" };
    },
  };
}

function throwingTransport(): EmailTransport {
  return {
    async send(): Promise<EmailSendResult> {
      throw new Error("simulated provider outage");
    },
  };
}

/** A fetch stub that hangs ONLY for requests to Resend's API — every other
 * URL (the real Supabase RPC/read calls this same test still needs to make)
 * passes through to the real global fetch unchanged. Simulates a hung/slow
 * Resend endpoint, exercised here through the real createResendTransport
 * against real submitPortfolioLead()/RPC/DB calls. */
function stubHangingResendFetch(): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url.toString();
      if (!urlString.includes("api.resend.com")) {
        return realFetch(url, init);
      }
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }),
  );
}

describe.skipIf(!provider || !writesAllowed)(
  "Lead-arrival notification @live @provider @destructive",
  () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("resolves Professional A's account email, never Professional B's, and survives transport failure without duplicating the lead", async () => {
      const { runId } = runDestructiveQaPreflight();
      const content = buildQaLeadContent(runId);
      const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;

      const proA = await provider!.getRow("beautician_profiles", { slug: proASlug });
      if (!proA) throw new Error("QA professional fixtures not found.");
      const proAId = proA["id"] as string;
      const originalStatus = proA["status"] as string;
      let profileTemporarilyPublished = false;

      const supabaseUrl = requireEnv("SUPABASE_URL");
      const anonClient = createClient(supabaseUrl, requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const adminClient = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const proAEmail = requireEnv("QA_PRO_A_EMAIL");
      const proBEmail = requireEnv("QA_PRO_B_EMAIL");

      const leadIds: string[] = [];

      try {
        if (originalStatus !== "published") {
          await provider!.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
          profileTemporarilyPublished = true;
        }

        // ---- genuinely new enquiry: notification must target Professional
        // A's real account email, never Professional B's ----
        const transport1 = recordingTransport();
        const result1 = await submitPortfolioLead(
          {
            _slug: proASlug,
            _name: content.clientName,
            _phone: content.phone,
            _location: content.location,
            _source: "portfolio",
            _message: content.message,
            // The real public form always sends these two — they're the
            // fields that disambiguate PostgREST's function resolution
            // between this QA backend's two overloaded submit_lead()
            // signatures (pre-existing schema state, not introduced by
            // this phase; see report §18).
            _conversion_path: `/portfolio/${proASlug}`,
            _cta_location: "availability_section",
          },
          { readOnlyClient: anonClient, adminClient, transport: transport1 },
        );
        expect(result1.error).toBeNull();
        expect(result1.leadId).toBeTruthy();
        leadIds.push(result1.leadId!);

        expect(transport1.sent).toHaveLength(1);
        expect(transport1.sent[0]!.to).toBe(proAEmail);
        expect(transport1.sent[0]!.to).not.toBe(proBEmail);
        expect(transport1.sent[0]!.subject).toBe("New BeautyFolio enquiry");
        const body = transport1.sent[0]!.text.toLowerCase();
        expect(body).toContain(content.clientName.toLowerCase());
        expect(body).toContain(content.phone);
        expect(body).toContain("enquiry");
        expect(body).not.toMatch(/booking confirmed|your booking|appointment confirmed/);

        // ---- idempotent replay (same phone, no distinguishing
        // service/date within the RPC's ~5-minute duplicate window) must
        // reuse the same lead and must NOT send a second notification ----
        const transport2 = recordingTransport();
        const result2 = await submitPortfolioLead(
          {
            _slug: proASlug,
            _name: content.clientName,
            _phone: content.phone,
            _location: content.location,
            _source: "portfolio",
            _message: content.message,
            _conversion_path: `/portfolio/${proASlug}`,
            _cta_location: "availability_section",
          },
          { readOnlyClient: anonClient, adminClient, transport: transport2 },
        );
        expect(result2.error).toBeNull();
        expect(result2.leadId).toBe(result1.leadId);
        expect(
          transport2.sent,
          "idempotent replay must not send a duplicate notification",
        ).toHaveLength(0);

        // ---- transport failure must not affect lead success or create a
        // duplicate lead — a distinct customer/phone so this is a genuinely
        // new lead, not another replay of the one above ----
        const failurePhone = `9${content.phone.slice(1)}`;
        const result3 = await submitPortfolioLead(
          {
            _slug: proASlug,
            _name: `${content.prefix}FailureCase`,
            _phone: failurePhone,
            _location: content.location,
            _source: "portfolio",
            _conversion_path: `/portfolio/${proASlug}`,
            _cta_location: "availability_section",
          },
          { readOnlyClient: anonClient, adminClient, transport: throwingTransport() },
        );
        expect(
          result3.error,
          "lead creation must succeed even though the transport throws",
        ).toBeNull();
        expect(result3.leadId).toBeTruthy();
        leadIds.push(result3.leadId!);

        const leadRowCount = await provider!.countRows("leads", { phone: failurePhone });
        expect(leadRowCount, "transport failure must not duplicate the lead").toBe(1);

        // ---- Resend timeout must behave exactly like any other transport
        // failure: bounded wait, lead still succeeds, no duplicate ----
        stubHangingResendFetch();
        const timeoutPhone = `8${content.phone.slice(1)}`;
        const timeoutStart = Date.now();
        const result4 = await submitPortfolioLead(
          {
            _slug: proASlug,
            _name: `${content.prefix}TimeoutCase`,
            _phone: timeoutPhone,
            _location: content.location,
            _source: "portfolio",
            _conversion_path: `/portfolio/${proASlug}`,
            _cta_location: "availability_section",
          },
          {
            readOnlyClient: anonClient,
            adminClient,
            transport: createResendTransport(
              "re_test_not_a_real_key",
              "notifications@example.test",
              200,
            ),
          },
        );
        const timeoutElapsedMs = Date.now() - timeoutStart;
        vi.unstubAllGlobals();

        expect(
          result4.error,
          "lead creation must succeed even though the email provider times out",
        ).toBeNull();
        expect(result4.leadId).toBeTruthy();
        leadIds.push(result4.leadId!);
        expect(
          timeoutElapsedMs,
          "a hung provider must not materially delay the response",
        ).toBeLessThan(5_000);

        const timeoutLeadRowCount = await provider!.countRows("leads", { phone: timeoutPhone });
        expect(timeoutLeadRowCount, "provider timeout must not duplicate the lead").toBe(1);
      } finally {
        vi.unstubAllGlobals();
        for (const id of leadIds) {
          await provider!.deleteRow("leads", { id }).catch(() => {});
        }
        if (profileTemporarilyPublished) {
          await provider!.updateRow(
            "beautician_profiles",
            { id: proAId },
            { status: originalStatus },
          );
        }
        const restored = await provider!.getRow("beautician_profiles", { id: proAId });
        expect(restored?.["status"]).toBe(originalStatus);
        const orphan = await provider!.rowExists("leads", { name: content.clientName });
        expect(orphan, "no lead from this run may remain").toBe(false);
        const orphanFailureCase = await provider!.rowExists("leads", {
          name: `${content.prefix}FailureCase`,
        });
        expect(orphanFailureCase, "no failure-case lead from this run may remain").toBe(false);
        const orphanTimeoutCase = await provider!.rowExists("leads", {
          name: `${content.prefix}TimeoutCase`,
        });
        expect(orphanTimeoutCase, "no timeout-case lead from this run may remain").toBe(false);
      }
    }, 30_000);
  },
);

if (!provider || !writesAllowed) {
  describe.skip("Lead-arrival notification @live @provider @destructive — SKIPPED (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured, or QA_ALLOW_WRITES_OVERRIDE!=='true'; this destructive test is opt-in only)", () => {});
}
