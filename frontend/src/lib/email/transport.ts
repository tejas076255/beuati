// Server-only. Minimal transactional-email transport abstraction for the
// lead-arrival notification. Exactly two implementations, per this phase's
// explicit narrow scope — no queue, no notification centre, no other
// channel (WhatsApp/SMS/push).
export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSendResult {
  ok: boolean;
  provider: "mock" | "resend";
  error?: string;
}

export interface EmailTransport {
  send(payload: EmailPayload): Promise<EmailSendResult>;
}

/** Bounded wait for the Resend network call — provider slowness/outage must
 * never materially delay the public enquiry response. Deliberately well
 * under typical serverless/edge request budgets. */
const RESEND_TIMEOUT_MS = 5_000;

/**
 * Sends nothing externally — only logs a sanitized one-line summary
 * (subject only; the recipient address is deliberately never logged here —
 * see capture note below). Used automatically whenever RESEND_API_KEY /
 * LEAD_NOTIFICATION_FROM_EMAIL aren't both configured, i.e. every local and
 * QA environment today with zero setup required.
 *
 * Tests that need to assert on the recipient/payload construct their own
 * EmailTransport implementation (a small in-test recording object) and
 * inject it via submitPortfolioLead()'s deps — that capture seam, not this
 * shared production default, is where the recipient address is ever held
 * in memory/logs.
 */
export function createMockTransport(): EmailTransport {
  return {
    async send(payload) {
      console.log(
        `[lead-notification] provider=mock (unconfigured) subject=${JSON.stringify(payload.subject)}`,
      );
      return { ok: true, provider: "mock" };
    },
  };
}

/**
 * Production-ready adapter — plain fetch against Resend's REST API, no SDK
 * dependency required. Only ever constructed by resolveEmailTransport()
 * once both required env vars are present server-side; never given a
 * hardcoded/example key. Bounded by RESEND_TIMEOUT_MS via AbortController
 * so a slow/hanging provider can never stall the caller — a timeout is
 * just another failed EmailSendResult, handled by the same swallow-and-log
 * path as any other delivery failure. `timeoutMs` defaults to
 * RESEND_TIMEOUT_MS and is overridable only so tests can prove the abort
 * fires without waiting out the real production timeout.
 */
export function createResendTransport(
  apiKey: string,
  fromEmail: string,
  timeoutMs: number = RESEND_TIMEOUT_MS,
): EmailTransport {
  return {
    async send(payload) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [payload.to],
            subject: payload.subject,
            text: payload.text,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          return { ok: false, provider: "resend", error: `Resend responded ${response.status}` };
        }
        return { ok: true, provider: "resend" };
      } catch (err) {
        const timedOut = err instanceof Error && err.name === "AbortError";
        return {
          ok: false,
          provider: "resend",
          error: timedOut
            ? `Resend request timed out after ${timeoutMs}ms`
            : err instanceof Error
              ? err.message
              : "Unknown Resend transport error",
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/**
 * Selects the transport for the current environment. No Resend credentials
 * are required locally or in QA — absent config safely falls back to the
 * mock transport rather than failing or requiring setup: lead creation
 * always works, and the notification attempt is simply reported (via the
 * mock's own log line) as unconfigured/skipped-for-real-delivery.
 */
export function resolveEmailTransport(): EmailTransport {
  const apiKey = process.env["RESEND_API_KEY"];
  const fromEmail = process.env["LEAD_NOTIFICATION_FROM_EMAIL"];
  if (apiKey && fromEmail) {
    return createResendTransport(apiKey, fromEmail);
  }
  return createMockTransport();
}
