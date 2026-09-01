// Phase 5.2E1 — pure, framework-agnostic helper. No Supabase client import,
// no side effects — safe to call from both server-only files
// (src/data/dashboard/videos.server.ts) and client components
// (VideoManager). Reverses buildPublicMediaUrl(): given a public Storage
// URL for the portfolio-media bucket, returns the raw storage_path
// (profiles/{slug}/{category}/{file}) it was built from, or null if the
// URL doesn't match the expected Supabase public-object shape for this
// bucket — e.g. an external/malformed URL that must never be treated as
// something safe to pass to a Storage delete call.
const PUBLIC_OBJECT_MARKER = "/storage/v1/object/public/";

export function extractStoragePathFromPublicUrl(
  url: string,
  bucket = "portfolio-media",
): string | null {
  const markerIndex = url.indexOf(PUBLIC_OBJECT_MARKER);
  if (markerIndex === -1) return null;
  const afterMarker = url.slice(markerIndex + PUBLIC_OBJECT_MARKER.length);
  const prefix = `${bucket}/`;
  if (!afterMarker.startsWith(prefix)) return null;
  const path = afterMarker.slice(prefix.length);
  if (!path || !path.startsWith("profiles/")) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
