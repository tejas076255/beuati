// The ONE place @supabase/supabase-js may be imported from generic QA
// infrastructure. Node-only (uses process.env directly) — never import this
// module from a Playwright spec that runs inside a browser context, and
// never from tests/e2e/**, so the service-role key can never reach a page.
// Generic on purpose: no BeautyFolio table/column names appear here —
// project-specific test code passes those in as arguments.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProviderHealth, ProviderIdentity, QaProvider } from "./provider";

export interface SupabaseProviderConfig {
  url: string;
  serviceRoleKey: string;
}

/** Supabase project URLs are "https://<ref>.supabase.co" — the ref is the
 * project identity, not a secret. Returns null for an unexpected shape
 * rather than guessing. */
export function projectRefFromSupabaseUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    const [ref] = hostname.split(".");
    return ref || null;
  } catch {
    return null;
  }
}

export class SupabaseQaProvider implements QaProvider {
  readonly type = "supabase";
  private readonly client: SupabaseClient;
  private readonly backendRef: string | null;

  constructor(config: SupabaseProviderConfig) {
    this.client = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.backendRef = projectRefFromSupabaseUrl(config.url);
  }

  identity(): ProviderIdentity {
    return { providerType: this.type, backendRef: this.backendRef };
  }

  /** Infra-level only (Storage bucket listing) — deliberately queries no
   * application table, so this adapter stays free of business schema. */
  async healthCheck(): Promise<ProviderHealth> {
    const identity = this.identity();
    try {
      const { error } = await this.client.storage.listBuckets();
      if (error) return { identity, connected: false, error: error.message };
      return { identity, connected: true };
    } catch (err) {
      return {
        identity,
        connected: false,
        error: err instanceof Error ? err.message : "unknown error",
      };
    }
  }

  async getRow(
    table: string,
    match: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    let query = this.client.from(table).select("*");
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value as never);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`getRow(${table}) failed: ${error.message}`);
    return (data as Record<string, unknown> | null) ?? null;
  }

  async storageObjectExists(bucket: string, path: string): Promise<boolean> {
    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash === -1 ? "" : path.slice(0, lastSlash);
    const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
    const { data, error } = await this.client.storage.from(bucket).list(dir, { search: filename });
    if (error) throw new Error(`storageObjectExists(${bucket}) failed: ${error.message}`);
    return !!data?.some((entry) => entry.name === filename);
  }
}

/** Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from process.env — the
 * same names the app's own server-side client already uses (see
 * src/integrations/supabase/client.server.ts). Returns null (never throws)
 * when either is absent, so callers can gracefully skip live-only tests
 * instead of requiring credentials to exist. */
export function createSupabaseProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseQaProvider | null {
  const url = env["SUPABASE_URL"];
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) return null;
  return new SupabaseQaProvider({ url, serviceRoleKey });
}
