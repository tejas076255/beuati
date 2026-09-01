// Server-only. Master Admin Console — Videos Manager (Phase 5.2E).
//
// Admin never impersonates the beautician: every function here runs under
// the ADMIN's own authenticated session (assertIsAdmin checks the real
// caller), operating on an explicitly-supplied target beautician_profile_id
// resolved from the URL slug via the SAME resolveAdminTargetProfile already
// established in Phase 5.2A. RLS already permits this —
// portfolio_videos' owner policy already includes an
// `OR has_role(auth.uid(),'admin')` clause (via owns_beautician_profile(),
// re-confirmed live for this phase) — so no RLS change was needed.
//
// Query/mutation logic itself is never duplicated: every read/write below
// delegates to the exact same bpId-parameterized core functions in
// src/data/dashboard/videos.server.ts that the beautician's own
// /dashboard/videos page uses — this file only adds the admin
// authorization gate, explicit target resolution reuse, and audit logging
// on top. Those core functions now also carry an explicit
// video-belongs-to-bpId check (added this phase, mirroring the Gallery/
// Before & After hardening from 5.2C/5.2D) that RLS alone didn't
// previously enforce at the application layer, AND still run the exact
// same isSafeExternalVideoUrl() allow-list (src/lib/video-embed.ts) on
// every create/update — this file does not, and must never, weaken or
// bypass that check.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import type { DeletedVideoStoragePaths, VideoInput } from "@/data/dashboard/videos.server";

export async function listVideosAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
): Promise<Tables<"portfolio_videos">[]> {
  await assertIsAdmin(supabase, adminUserId);
  const { listVideosForProfile } = await import("@/data/dashboard/videos.server");
  return listVideosForProfile(supabase, targetProfileId);
}

export async function createVideoAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  input: VideoInput,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);
  const { createVideoForProfile } = await import("@/data/dashboard/videos.server");
  const newId = await createVideoForProfile(supabase, targetProfileId, input);

  await logAdminAction(supabase, "video_created", "video", newId, null, {
    title: input.title,
    platform: input.platform,
    beautician_profile_id: targetProfileId,
  } as Json);
}

export async function updateVideoAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  videoId: string,
  updates: Partial<VideoInput>,
): Promise<void> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("portfolio_videos")
    .select("title, platform, video_url, is_published")
    .eq("id", videoId)
    .maybeSingle();

  const { updateVideoForProfile } = await import("@/data/dashboard/videos.server");
  await updateVideoForProfile(supabase, targetProfileId, videoId, updates);

  await logAdminAction(
    supabase,
    "video_updated",
    "video",
    videoId,
    (before as Json | null) ?? null,
    { ...updates, beautician_profile_id: targetProfileId } as Json,
  );
}

export async function deleteVideoAdmin(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
  targetProfileId: string,
  videoId: string,
): Promise<DeletedVideoStoragePaths> {
  await assertIsAdmin(supabase, adminUserId);

  const { data: before } = await supabase
    .from("portfolio_videos")
    .select("title, platform, beautician_profile_id")
    .eq("id", videoId)
    .maybeSingle();

  const { deleteVideoForProfile } = await import("@/data/dashboard/videos.server");
  const storagePaths = await deleteVideoForProfile(supabase, targetProfileId, videoId);

  await logAdminAction(
    supabase,
    "video_deleted",
    "video",
    videoId,
    (before as Json | null) ?? null,
    null,
  );
  return storagePaths;
}
