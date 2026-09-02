// Generic, project-agnostic QA provider contract — no BeautyFolio table
// names, column names, or business concepts belong here. A concrete backend
// (Supabase today; Postgres/S3/AWS later) implements this interface in its
// own adapter module; project-specific test code calls through the
// interface, never through a vendor SDK directly.
//
// Deliberately read-only for QA-1C — no create/update/delete methods are
// declared yet. Every future destructive method must be designed alongside
// assertDestructiveQaAllowed() (../safety-gate.ts), not before it.
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
   * interface has no opinion on schema. */
  getRow(table: string, match: Record<string, unknown>): Promise<Record<string, unknown> | null>;

  /** Read-only storage object existence check. */
  storageObjectExists(bucket: string, path: string): Promise<boolean>;

  /** Read-only bucket metadata lookup. Returns null if the bucket doesn't exist. */
  getBucketInfo(bucket: string): Promise<BucketInfo | null>;

  /** Read-only listing of object names directly under `path` in `bucket`
   * (non-recursive). Used to confirm a bucket is empty, never to browse
   * or copy content. */
  listStorageObjects(bucket: string, path?: string): Promise<string[]>;
}
