// Server-only. New seam for the public "Check availability" form. Was
// previously a direct browser -> supabase.rpc("submit_lead") call; now
// browser -> submitPortfolioLeadFn (portfolio-sections.tsx) -> this core
// function -> the SAME submit_lead() RPC. The RPC remains the sole
// authority for validation/phone-normalization/deduplication/creation —
// nothing here reproduces that logic. A best-effort email notification is
// attempted only after the RPC already reports success, and can never turn
// that success into a customer-visible failure (LEAD SUCCESS != EMAIL
// SUCCESS).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildLeadNotificationEmail,
  shouldNotifyForInquiry,
  type LeadNotificationLead,
} from "@/lib/email/lead-notification";
import { resolveEmailTransport, type EmailTransport } from "@/lib/email/transport";

type SubmitLeadArgs = Database["public"]["Functions"]["submit_lead"]["Args"];

export interface SubmitLeadResult {
  error: string | null;
  leadId?: string;
}

export interface SubmitPortfolioLeadDeps {
  /** Anon-privileged client used for the submit_lead RPC call itself —
   * same trust level as the browser call this replaces. Defaults to the
   * existing portfolio read client (an anon-key client; the RPC's own
   * SECURITY DEFINER body — not caller privilege — governs what it does). */
  readOnlyClient?: SupabaseClient<Database>;
  /** Service-role client used ONLY for the notification's own read-only
   * lookups (lead snapshot, latest inquiry timestamp, professional's
   * account email) — never for the lead-creation RPC itself. Defaults to
   * the app's existing supabaseAdmin (src/integrations/supabase/
   * client.server.ts), the established "trusted server-side reads" client
   * already used by admin server functions; not a new privileged
   * mechanism introduced for this phase. */
  adminClient?: SupabaseClient<Database>;
  transport?: EmailTransport;
  now?: () => Date;
}

/**
 * Core, DB-touching orchestration — exported separately from the
 * createServerFn wrapper (portfolio-sections.tsx) so tests can call it
 * directly with injected clients/transport, without going through the
 * HTTP/server-fn boundary. Same *Core() split already used elsewhere in
 * this codebase (e.g. moderateReviewCore).
 */
export async function submitPortfolioLead(
  args: SubmitLeadArgs,
  deps: SubmitPortfolioLeadDeps = {},
): Promise<SubmitLeadResult> {
  const now = deps.now ?? (() => new Date());
  const requestStartedAt = now().toISOString();

  const readOnlyClient =
    deps.readOnlyClient ?? (await import("@/data/portfolio-query.server")).createReadOnlyClient();

  const { data: leadId, error: rpcError } = await readOnlyClient.rpc("submit_lead", args);
  if (rpcError || !leadId) {
    return { error: rpcError?.message ?? "Failed to submit enquiry." };
  }

  // Awaited, not fire-and-forget: this app's deploy target (Nitro on
  // Cloudflare) does not guarantee work started after a response is
  // returned actually runs to completion. Every failure path inside is
  // caught here so it can never turn this already-successful lead into a
  // customer-visible failure, and never triggers a retry of the RPC above.
  try {
    await attemptLeadNotification(leadId, requestStartedAt, deps);
  } catch (err) {
    console.error("[lead-notification] unexpected failure, lead unaffected:", err);
  }

  return { error: null, leadId };
}

async function attemptLeadNotification(
  leadId: string,
  requestStartedAt: string,
  deps: SubmitPortfolioLeadDeps,
): Promise<void> {
  const adminClient =
    deps.adminClient ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const transport = deps.transport ?? resolveEmailTransport();

  // Latency fix (public-lead-form-reload investigation) — this whole chain
  // is awaited before the client can render its success state (see the
  // "Awaited, not fire-and-forget" note above), so each extra sequential
  // round trip directly delays the user-visible confirmation. The lead
  // lookup and the latest-inquiry lookup have no data dependency on each
  // other (both only need leadId), so they run in parallel; the profile ->
  // account-email chain is then fetched as a single embedded query instead
  // of two sequential ones, via the existing beautician_profiles.profile_id
  // -> profiles.id foreign key. Same checks, same log intent, same
  // early-return behavior — fewer round trips only.
  const [leadResult, latestInquiryResult] = await Promise.all([
    adminClient
      .from("leads")
      .select(
        "beautician_profile_id, name, phone, location, event_date, message, service_requested, source",
      )
      .eq("id", leadId)
      .maybeSingle(),
    adminClient
      .from("lead_inquiries")
      .select("created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const { data: lead, error: leadError } = leadResult;
  if (leadError || !lead) {
    console.error("[lead-notification] could not load lead for notification:", leadError?.message);
    return;
  }
  const { data: latestInquiry } = latestInquiryResult;

  if (!shouldNotifyForInquiry(requestStartedAt, latestInquiry?.created_at ?? null)) {
    // Idempotent replay (submit_lead()'s own 5-minute duplicate guard) —
    // the original submission already triggered a notification; sending
    // another one here would be a duplicate for the same enquiry.
    return;
  }

  // Canonical professional recipient: the auth-account email (profiles.email
  // via beautician_profiles.profile_id), not beautician_profiles.email — the
  // latter is an optional, public-facing business-contact field, not
  // guaranteed to exist and not the account the professional actually logs
  // in with. profiles!inner requires the related account row to exist,
  // matching the original two-step "profile, then account email" check.
  const { data: profileWithAccount, error: profileError } = await adminClient
    .from("beautician_profiles")
    .select("display_name, profiles!inner(email)")
    .eq("id", lead.beautician_profile_id)
    .maybeSingle();
  if (profileError || !profileWithAccount || !profileWithAccount.profiles?.email) {
    console.error(
      "[lead-notification] could not resolve beautician profile or account email:",
      profileError?.message,
    );
    return;
  }
  const profile = { display_name: profileWithAccount.display_name };
  const account = { email: profileWithAccount.profiles.email };

  const leadContext: LeadNotificationLead = {
    name: lead.name,
    phone: lead.phone,
    location: lead.location,
    event_date: lead.event_date,
    message: lead.message,
    service_requested: lead.service_requested,
    source: lead.source,
  };
  const email = buildLeadNotificationEmail(leadContext, profile.display_name);

  const result = await transport.send({
    to: account.email,
    subject: email.subject,
    text: email.text,
  });
  if (!result.ok) {
    console.error(
      `[lead-notification] delivery failed provider=${result.provider} error=${result.error}`,
    );
  }
}
