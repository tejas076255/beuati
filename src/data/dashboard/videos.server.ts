// Server-only. Owner-scoped `portfolio_videos` CRUD for the Portfolio Builder.
// RLS (owns_beautician_profile()) enforces ownership on every operation —
// already correct and unchanged, confirmed in the Phase 2 Step 2A audit.
// video_url/thumbnail_url are plain URL fields for youtube/instagram/other;
// storage_path holds the Storage object path for platform "uploaded"
// (populated via uploadPortfolioVideo, see src/lib/storage-upload.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./shared.server";

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
