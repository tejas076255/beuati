// The ONE place @supabase/supabase-js may be imported from generic QA
// infrastructure. Node-only (uses process.env directly). Safe to import at
// the top of a Playwright *spec file* (which executes in Node, as the test
// runner) — the constraint is that the client/key must never be handed to
// `page.evaluate`/`page.addInitScript` or otherwise reach code that runs
// inside the browser page itself. tests/e2e-qa/crud/** is the trusted
// Node-side exception this applies to (QA-1E); tests/e2e/** (the normal,
// non-QA smoke suite) still must never import this. Generic on purpose: no
// BeautyFolio table/column names appear here — project-specific test code
// passes those in as arguments.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  BucketInfo,
  ProviderHealth,
  ProviderIdentity,
  QaAuthUser,
  QaAuthUserInput,
  QaProvider,
} from "./provider";

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

  async rowExists(table: string, match: Record<string, unknown>): Promise<boolean> {
    let query = this.client.from(table).select("*", { count: "exact", head: true });
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value as never);
    }
    const { count, error } = await query;
    if (error) throw new Error(`rowExists(${table}) failed: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async countRows(table: string, match: Record<string, unknown>): Promise<number> {
    let query = this.client.from(table).select("*", { count: "exact", head: true });
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value as never);
    }
    const { count, error } = await query;
    if (error) throw new Error(`countRows(${table}) failed: ${error.message}`);
    return count ?? 0;
  }

  async storageObjectExists(bucket: string, path: string): Promise<boolean> {
    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash === -1 ? "" : path.slice(0, lastSlash);
    const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
    const { data, error } = await this.client.storage.from(bucket).list(dir, { search: filename });
    if (error) throw new Error(`storageObjectExists(${bucket}) failed: ${error.message}`);
    return !!data?.some((entry) => entry.name === filename);
  }

  async getBucketInfo(bucket: string): Promise<BucketInfo | null> {
    const { data, error } = await this.client.storage.getBucket(bucket);
    if (error) return null;
    return { id: data.id, public: data.public };
  }

  async listStorageObjects(bucket: string, path = ""): Promise<string[]> {
    const { data, error } = await this.client.storage.from(bucket).list(path);
    if (error) throw new Error(`listStorageObjects(${bucket}) failed: ${error.message}`);
    return (data ?? []).map((entry) => entry.name);
  }

  // ---- destructive methods — see provider.ts's file-header contract:
  // callers must have already passed assertDestructiveQaAllowed(). ----

  async insertRow(
    table: string,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await this.client.from(table).insert(values).select().single();
    if (error) throw new Error(`insertRow(${table}) failed: ${error.message}`);
    return data as Record<string, unknown>;
  }

  async ensureAuthUser(input: QaAuthUserInput): Promise<QaAuthUser> {
    const created = await this.client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: input.emailConfirm,
      user_metadata: input.userMetadata,
    });

    if (!created.error && created.data.user) {
      return { id: created.data.user.id, email: created.data.user.email ?? null, created: true };
    }

    // Idempotency: "already registered" is expected on a second run —
    // look the existing user up by email instead of treating it as fatal.
    const existing = await this.findAuthUserByEmail(input.email);
    if (existing) return { ...existing, created: false };

    throw new Error(`ensureAuthUser(${input.email}) failed: ${created.error?.message}`);
  }

  async updateRow(
    table: string,
    match: Record<string, unknown>,
    values: Record<string, unknown>,
  ): Promise<number> {
    let query = this.client.from(table).update(values);
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value as never);
    }
    const { data, error } = await query.select("id");
    if (error) throw new Error(`updateRow(${table}) failed: ${error.message}`);
    return data?.length ?? 0;
  }

  async deleteRow(table: string, match: Record<string, unknown>): Promise<number> {
    let query = this.client.from(table).delete();
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value as never);
    }
    const { data, error } = await query.select("id");
    if (error) throw new Error(`deleteRow(${table}) failed: ${error.message}`);
    return data?.length ?? 0;
  }

  private async findAuthUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string | null } | null> {
    const normalized = email.toLowerCase();
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await this.client.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`findAuthUserByEmail failed: ${error.message}`);
      const match = data.users.find((u) => (u.email ?? "").toLowerCase() === normalized);
      if (match) return { id: match.id, email: match.email ?? null };
      if (data.users.length === 0) return null;
    }
    return null;
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
