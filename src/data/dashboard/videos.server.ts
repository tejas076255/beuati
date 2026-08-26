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

const EXTERNAL_PLATFORMS: readonly ExternalVideoPlatform[] = ["youtube", "instagram", "other"];

function isExternalPlatform(
  platform: Database["public"]["Enums"]["video_platform"],
): platform is ExternalVideoPlatform {
  return (EXTERNAL_PLATFORMS as readonly string[]).includes(platform);
}

/**
 * Phase 3H.2C — authoritative server-side gate on portfolio_videos.video_url.
 * Client validation (dashboard.videos.tsx) is UX only; a crafted request
 * bypassing the React form must still be unable to persist a
 * javascript:/data:/vbscript:/file:/ftp: URL, so this re-applies the same
 * isSafeExternalVideoUrl() allow-list here, using DB-fetched platform when
 * an update doesn't resend it (see updateVideo below).
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

export async function listOwnVideos(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Tables<"portfolio_videos">[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { data, error } = await supabase
    .from("portfolio_videos")
    .select("*")
    .eq("beautician_profile_id", bpId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load videos: ${error.message}`);
  return data ?? [];
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

export async function createVideo(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: VideoInput,
): Promise<void> {
  assertSafeVideoUrl(input.platform, input.video_url);
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  const { error } = await supabase
    .from("portfolio_videos")
    .insert({ ...input, beautician_profile_id: bpId });
  if (error) throw new Error(`Failed to add video: ${error.message}`);
}

export async function updateVideo(
  supabase: SupabaseClient<Database>,
  videoId: string,
  updates: Partial<VideoInput>,
): Promise<void> {
  // The dashboard form always resends platform alongside video_url, but a
  // request bypassing it might send video_url alone — fall back to the
  // row's own stored platform so the allow-list is still enforced.
  if (updates.video_url !== undefined) {
    let platform = updates.platform;
    if (!platform) {
      const { data, error } = await supabase
        .from("portfolio_videos")
        .select("platform")
        .eq("id", videoId)
        .single();
      if (error) throw new Error(`Failed to verify video: ${error.message}`);
      platform = data.platform;
    }
    assertSafeVideoUrl(platform, updates.video_url);
  }

  const { error } = await supabase.from("portfolio_videos").update(updates).eq("id", videoId);
  if (error) throw new Error(`Failed to update video: ${error.message}`);
}

export async function deleteVideo(
  supabase: SupabaseClient<Database>,
  videoId: string,
): Promise<void> {
  const { error } = await supabase.from("portfolio_videos").delete().eq("id", videoId);
  if (error) throw new Error(`Failed to delete video: ${error.message}`);
}
