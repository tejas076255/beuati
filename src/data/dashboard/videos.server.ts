// Server-only. Owner-scoped `portfolio_videos` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation —
// already correct and unchanged, confirmed in the Phase 2 Step 2A audit.
// video_url/thumbnail_url are plain URL fields for youtube/instagram/other;
// storage_path holds the Storage object path for platform "uploaded"
// (populated via uploadPortfolioVideo, see src/lib/storage-upload.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";
import { isSafeExternalVideoUrl, type ExternalVideoPlatform } from "@/lib/video-embed";
import { extractStoragePathFromPublicUrl } from "@/lib/storage-path";

const EXTERNAL_PLATFORMS: readonly ExternalVideoPlatform[] = ["youtube", "instagram", "other"];

function isExternalPlatform(
  platform: Database["public"]["Enums"]["video_platform"],
): platform is ExternalVideoPlatform {
  return (EXTERNAL_PLATFORMS as readonly string[]).includes(platform);
}

/**
 * Phase 3H.2C — authoritative server-side gate on portfolio_videos.video_url.
 * Client validation (dashboard.videos.tsx / VideoManager) is UX only; a
 * crafted request bypassing the React form must still be unable to persist
 * a javascript:/data:/vbscript:/file:/ftp: URL, so this re-applies the same
 * isSafeExternalVideoUrl() allow-list here, using DB-fetched platform when
 * an update doesn't resend it (see updateVideoForProfile below). Phase
 * 5.2E — this is the one security-critical function every admin write must
 * still pass through unmodified; never replace with z.string().url() or a
 * looser check.
 */
function assertSafeVideoUrl(
  platform: Database["public"]["Enums"]["video_platform"] | undefined,
  videoUrl: string | null | undefined,
): void {
  if (!platform || !isExternalPlatform(platform)) {
    // "uploaded" videos never carry an external video_url.
    if (videoUrl) throw new Error("Video link is not allowed for this platform.");
    return;
  }
  if (!videoUrl || !isSafeExternalVideoUrl(videoUrl, platform)) {
    throw new Error("Enter a valid HTTPS video URL.");
  }
}

// Phase 5.2E — bpId-parameterized core query, shared by both the
// beautician's own-profile path (listOwnVideos, below) and the Master
// Admin Console's explicit-target path (src/data/admin/videos.server.ts).
// This is the ONE query both callers use — never a duplicated/forked copy.
export async function listVideosForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<Tables<"portfolio_videos">[]> {
  const { data, error } = await supabase
    .from("portfolio_videos")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load videos: ${error.message}`);
  return data ?? [];
}

export async function listOwnVideos(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"portfolio_videos">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return listVideosForProfile(supabase, bpId);
}

export type VideoInput = Pick<
  TablesInsert<"portfolio_videos">,
  | "title"
  | "description"
  | "category"
  | "platform"
  | "video_url"
  | "thumbnail_url"
  | "duration_seconds"
  | "is_published"
  | "storage_path"
>;

// Phase 5.2E — bpId-parameterized core, shared with the admin path.
// Returns the new row's id so admin callers can attach it to an audit-log
// entity_id; the beautician's own path (createVideo, below) ignores it.
export async function createVideoForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  input: VideoInput,
): Promise<string> {
  assertSafeVideoUrl(input.platform, input.video_url);
  const { data, error } = await supabase
    .from("portfolio_videos")
    .insert({ ...input, beautician_profile_id: bpId })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to add video: ${error?.message}`);
  return data.id;
}

export async function createVideo(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: VideoInput,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await createVideoForProfile(supabase, bpId, input);
}

/**
 * Confirms `videoId` actually belongs to `bpId` before any mutation — the
 * previous version of this file had NO application-layer ownership check
 * at all on update/delete, relying purely on RLS
 * (owns_beautician_profile(), which already includes an admin-OR clause).
 * Correct for the beautician's own path (RLS alone fully secures it), but
 * insufficient for the admin path — same defense-in-depth pattern already
 * applied to Services (5.2A), Gallery (5.2C), and Before & After (5.2D).
 * Also returns the row's persisted platform, reused by
 * updateVideoForProfile below so the URL-safety re-check (assertSafeVideoUrl)
 * doesn't need a second fetch.
 */
async function assertVideoBelongsToProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  videoId: string,
): Promise<{ platform: Database["public"]["Enums"]["video_platform"] }> {
  const { data: existing, error } = await supabase
    .from("portfolio_videos")
    .select("beautician_profile_id, platform")
    .eq("id", videoId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error(`Failed to load video: ${error?.message ?? "not found"}`);
  }
  if (existing.beautician_profile_id !== bpId) {
    throw new Error("This video does not belong to the selected profile.");
  }
  return { platform: existing.platform };
}

export async function updateVideoForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  videoId: string,
  updates: Partial<VideoInput>,
): Promise<void> {
  const { platform: persistedPlatform } = await assertVideoBelongsToProfile(
    supabase,
    bpId,
    videoId,
  );

  if (updates.video_url !== undefined) {
    assertSafeVideoUrl(updates.platform ?? persistedPlatform, updates.video_url);
  }

  const { error } = await supabase.from("portfolio_videos").update(updates).eq("id", videoId);
  if (error) throw new Error(`Failed to update video: ${error.message}`);
}

export async function updateVideo(
  supabase: SupabaseClient<Database>,
  userId: string,
  videoId: string,
  updates: Partial<VideoInput>,
): Promise<void> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  await updateVideoForProfile(supabase, bpId, videoId, updates);
}

export interface DeletedVideoStoragePaths {
  /** Raw storage_path of an "uploaded" platform video file, if any. */
  videoPath: string | null;
  /** Storage path derived from thumbnail_url, if any. */
  thumbnailPath: string | null;
}

/**
 * Phase 5.2E1 — deletes the video row and returns whatever storage objects
 * this specific row owned, for the caller to remove client-side (same
 * "server confirms the DB mutation, caller cleans up storage with its own
 * session" split already used by Gallery/Before & After). Every returned
 * path is independently re-validated to start with `profiles/{this
 * profile's own slug}/` before being handed back — ownership of the ROW
 * was already proven by assertVideoBelongsToProfile, but this is an
 * additional, literal belt-and-suspenders check against ever handing back
 * a path outside the target beautician's own namespace (e.g. if a row's
 * thumbnail_url were somehow a URL for a different bucket/host, or a
 * legacy value that doesn't parse as this bucket's public-object shape at
 * all) — such a path is silently excluded rather than deleted or thrown.
 */
export async function deleteVideoForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
  videoId: string,
): Promise<DeletedVideoStoragePaths> {
  await assertVideoBelongsToProfile(supabase, bpId, videoId);

  const [{ data: video }, { data: profile }] = await Promise.all([
    supabase
      .from("portfolio_videos")
      .select("storage_path, thumbnail_url")
      .eq("id", videoId)
      .maybeSingle(),
    supabase.from("beautician_profiles").select("slug").eq("id", bpId).single(),
  ]);

  const { error } = await supabase.from("portfolio_videos").delete().eq("id", videoId);
  if (error) throw new Error(`Failed to delete video: ${error.message}`);

  const ownedPrefix = `profiles/${profile?.slug ?? ""}/`;
  const videoPath =
    video?.storage_path && video.storage_path.startsWith(ownedPrefix) ? video.storage_path : null;
  const thumbnailPath = video?.thumbnail_url
    ? extractStoragePathFromPublicUrl(video.thumbnail_url)
    : null;

  return {
    videoPath,
    thumbnailPath: thumbnailPath && thumbnailPath.startsWith(ownedPrefix) ? thumbnailPath : null,
  };
}

export async function deleteVideo(
  supabase: SupabaseClient<Database>,
  userId: string,
  videoId: string,
): Promise<DeletedVideoStoragePaths> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return deleteVideoForProfile(supabase, bpId, videoId);
}
