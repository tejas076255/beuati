// QA-1I — generic storage-object check helpers, extracted from the QA-1H
// Gallery pilot because Before & After (and any future storage-backed
// module) needs the exact same two primitives: parsing the ownership key
// out of a `profiles/{slug}/...` path, and a plain HTTP GET check against a
// public storage URL. No BeautyFolio-specific behavior lives here — the
// path convention and bucket name are always supplied by the caller.

/** Second path segment of `profiles/{slug}/{category}/{file}` — the exact
 * ownership key the storage RLS policy itself keys off
 * ((storage.foldername(name))[2] in Postgres, 1-indexed). */
export function ownerSlugFromStoragePath(storagePath: string): string {
  return storagePath.split("/")[1] ?? "";
}

export interface HttpCheckResult {
  ok: boolean;
  status: number;
  contentType: string | null;
}

export async function httpCheck(url: string): Promise<HttpCheckResult> {
  const res = await fetch(url, { method: "GET" });
  return { ok: res.ok, status: res.status, contentType: res.headers.get("content-type") };
}
