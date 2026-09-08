// Lead-arrival email notification — pure logic coverage. No DB, no
// network, no live backend required; runs as part of the normal
// `test:unit` chain with zero secrets.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLeadNotificationEmail,
  shouldNotifyForInquiry,
  type LeadNotificationLead,
} from "@/lib/email/lead-notification";
import {
  createMockTransport,
  createResendTransport,
  resolveEmailTransport,
} from "@/lib/email/transport";

const FULL_LEAD: LeadNotificationLead = {
  name: "Priya Sharma",
  phone: "9876543210",
  location: "Ahmedabad",
  event_date: "2026-12-05",
  message: "Looking for bridal makeup for my sister's wedding.",
  service_requested: "Bridal Makeup",
  source: "portfolio",
};

describe("shouldNotifyForInquiry", () => {
  it("returns true when the latest inquiry was created at/after the request start", () => {
    expect(shouldNotifyForInquiry("2026-01-01T10:00:00.000Z", "2026-01-01T10:00:00.500Z")).toBe(
      true,
    );
  });

  it("returns false when the latest inquiry predates the request — an idempotent replay", () => {
    // The RPC's own 5-minute duplicate guard returned early without
    // inserting a new lead_inquiries row; the found row is from the
    // ORIGINAL submission, which already triggered a notification.
    expect(shouldNotifyForInquiry("2026-01-01T10:05:00.000Z", "2026-01-01T10:01:00.000Z")).toBe(
      false,
    );
  });

  it("returns false when there is no inquiry row at all", () => {
    expect(shouldNotifyForInquiry("2026-01-01T10:00:00.000Z", null)).toBe(false);
  });
});

describe("buildLeadNotificationEmail", () => {
  it("uses the exact operational subject line", () => {
    const email = buildLeadNotificationEmail(FULL_LEAD, "QA Test Professional A");
    expect(email.subject).toBe("New BeautyFolio enquiry");
  });

  it("includes every available field", () => {
    const email = buildLeadNotificationEmail(FULL_LEAD, "QA Test Professional A");
    expect(email.text).toContain("QA Test Professional A");
    expect(email.text).toContain("Priya Sharma");
    expect(email.text).toContain("9876543210");
    expect(email.text).toContain("Ahmedabad");
    expect(email.text).toContain("Bridal Makeup");
    expect(email.text).toContain("2026-12-05");
    expect(email.text).toContain("Looking for bridal makeup");
    expect(email.text).toContain("portfolio");
    expect(email.text).toContain("/dashboard/leads");
  });

  it("omits absent optional fields instead of rendering empty labels", () => {
    const minimal: LeadNotificationLead = {
      name: "Anita",
      phone: "9000000000",
      location: null,
      event_date: null,
      message: null,
      service_requested: null,
      source: "portfolio",
    };
    const email = buildLeadNotificationEmail(minimal, "QA Test Professional A");
    expect(email.text).not.toContain("Location:");
    expect(email.text).not.toContain("Preferred date:");
    expect(email.text).not.toContain("Message:");
    expect(email.text).not.toContain("Requested service:");
  });

  it("never claims a confirmed booking/appointment/reservation", () => {
    const email = buildLeadNotificationEmail(FULL_LEAD, "QA Test Professional A");
    const lower = email.text.toLowerCase();
    // The disclaimer deliberately mirrors the public form's own success
    // copy ("This is a request, not a confirmed booking.") — a NEGATION,
    // not a positive claim. Assert no positive booking/confirmation claim
    // is present, rather than banning the word "booking" outright.
    expect(lower).not.toMatch(/booking confirmed|your booking|appointment confirmed|reservation/);
    expect(lower).toContain("enquiry");
    expect(lower).toContain("not a confirmed booking");
  });
});

describe("resolveEmailTransport", () => {
  it("falls back to the mock transport when Resend config is absent (default local/QA state)", async () => {
    const original = {
      key: process.env["RESEND_API_KEY"],
      from: process.env["LEAD_NOTIFICATION_FROM_EMAIL"],
    };
    delete process.env["RESEND_API_KEY"];
    delete process.env["LEAD_NOTIFICATION_FROM_EMAIL"];
    try {
      const transport = resolveEmailTransport();
      const result = await transport.send({ to: "pro@example.com", subject: "x", text: "y" });
      expect(result).toEqual({ ok: true, provider: "mock" });
    } finally {
      if (original.key !== undefined) process.env["RESEND_API_KEY"] = original.key;
      if (original.from !== undefined) process.env["LEAD_NOTIFICATION_FROM_EMAIL"] = original.from;
    }
  });

  it("selects the resend transport once both required env vars are present", () => {
    const original = {
      key: process.env["RESEND_API_KEY"],
      from: process.env["LEAD_NOTIFICATION_FROM_EMAIL"],
    };
    process.env["RESEND_API_KEY"] = "re_test_not_a_real_key";
    process.env["LEAD_NOTIFICATION_FROM_EMAIL"] = "notifications@example.test";
    try {
      const transport = resolveEmailTransport();
      // Selection only — never invoke .send() here, which would attempt a
      // real network call; that path is covered structurally, not
      // exercised against the live Resend API in automated tests.
      expect(transport).not.toBe(createMockTransport());
      expect(typeof transport.send).toBe("function");
    } finally {
      if (original.key === undefined) delete process.env["RESEND_API_KEY"];
      else process.env["RESEND_API_KEY"] = original.key;
      if (original.from === undefined) delete process.env["LEAD_NOTIFICATION_FROM_EMAIL"];
      else process.env["LEAD_NOTIFICATION_FROM_EMAIL"] = original.from;
    }
  });
});

describe("createMockTransport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never logs the recipient address — only the subject", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const transport = createMockTransport();
    await transport.send({
      to: "professional-account@example.com",
      subject: "New BeautyFolio enquiry",
      text: "irrelevant body",
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const loggedLine = logSpy.mock.calls[0]!.join(" ");
    expect(loggedLine).not.toContain("professional-account@example.com");
    expect(loggedLine).toContain("New BeautyFolio enquiry");
  });
});

describe("createResendTransport timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aborts and returns a failed result when the provider never responds, instead of hanging", async () => {
    // Simulates a hung/slow provider: the fetch promise only ever settles
    // in reaction to the AbortSignal firing, exactly like the real fetch
    // implementation's own abort handling.
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }),
    );

    const transport = createResendTransport(
      "re_test_not_a_real_key",
      "notifications@example.test",
      30,
    );
    const start = Date.now();
    const result = await transport.send({
      to: "professional-account@example.com",
      subject: "New BeautyFolio enquiry",
      text: "body",
    });
    const elapsedMs = Date.now() - start;

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("resend");
    expect(result.error).toContain("timed out");
    // Bounded — must resolve close to the configured timeout, never hang.
    expect(elapsedMs).toBeLessThan(1_000);
  });
});
