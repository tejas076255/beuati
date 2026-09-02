// Generic, project-agnostic QA provider contract — no BeautyFolio table
// names, column names, or business concepts belong here. A concrete backend
// (Supabase today; Postgres/S3/AWS later) implements this interface in its
// own adapter module; project-specific test code calls through the
// interface, never through a vendor SDK directly.
//
// Read-only through QA-1C. QA-1D Step 3B adds the first destructive
// methods (insertRow, ensureAuthUser), designed alongside
// assertDestructiveQaAllowed() (../safety-gate.ts) as that phase requires.
// CONTRACT: every implementation's destructive methods trust the caller to
// have already called assertDestructiveQaAllowed() and thrown/aborted on
// denial — these methods do not re-check the gate themselves, so nothing
// in generic QA infrastructure may call them directly; only a project's
// own guarded provisioning entrypoint may (e.g.
// tests/projects/beautyfolio/qa-identity-provisioner.ts).
export interface ProviderIdentity {
  /** e.g. "supabase" */
  providerType: string;
  /** Backend project/account identifier, if derivable — never a secret. */
  backendRef: string | null;
}

export interface ProviderHealth {
  identity: ProviderIdentity;
  connected: boolean;
  /** Present only on failure; never contains secret material. */
  error?: string;
}

export interface BucketInfo {
  id: string;
  public: boolean;
}

export interface QaProvider {
  readonly type: string;

  /** Synchronous, local — never makes a network call. */
  identity(): ProviderIdentity;

  /** Read-only connectivity + identity check. Never mutates anything. */
  healthCheck(): Promise<ProviderHealth>;

  /** Read-only single-row lookup. Table/match are caller-supplied — this
   * interface has no opinion on schema. Errors if more than one row
   * matches (use rowExists for a reachability/existence probe against a
   * table that may legitimately hold more than one matching row). */
  getRow(table: string, match: Record<string, unknown>): Promise<Record<string, unknown> | null>;

  /** Read-only existence probe — true if at least one row matches, false
   * otherwise. Unlike getRow, never errors when more than one row
   * matches, so this is the right choice both for "does this table have
   * any row at all" and for reachability checks against tables that may
   * hold multiple rows. */
  rowExists(table: string, match: Record<string, unknown>): Promise<boolean>;

  /** Read-only storage object existence check. */
  storageObjectExists(bucket: string, path: string): Promise<boolean>;

  /** Read-only bucket metadata lookup. Returns null if the bucket doesn't exist. */
  getBucketInfo(bucket: string): Promise<BucketInfo | null>;

  /** Read-only listing of object names directly under `path` in `bucket`
   * (non-recursive). Used to confirm a bucket is empty, never to browse
   * or copy content. */
  listStorageObjects(bucket: string, path?: string): Promise<string[]>;

  /** DESTRUCTIVE — see file header contract. Generic single-row insert;
   * table/values are caller-supplied. Returns the inserted row. */
  insertRow(table: string, values: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** DESTRUCTIVE — see file header contract. Idempotently ensures an auth
   * user with this email exists (admin API — never sends email). Returns
   * the existing user unchanged if the email is already registered, so
   * this is safe to call repeatedly. */
  ensureAuthUser(input: QaAuthUserInput): Promise<QaAuthUser>;
}

export interface QaAuthUserInput {
  email: string;
  password: string;
  emailConfirm: boolean;
  userMetadata: Record<string, unknown>;
}

export interface QaAuthUser {
  id: string;
  email: string | null;
  /** true if this call created the user; false if one already existed. */
  created: boolean;
}
