import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VideoManager } from "@/components/videos/video-manager";
import type { VideoInput } from "@/data/dashboard/videos.server";

export const Route = createFileRoute("/dashboard/videos")({
  component: VideosPage,
});

const getProfileSlugFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnProfile } = await import("@/data/dashboard/profile.server");
    const profile = await getOwnProfile(context.supabase, context.userId);
    return { slug: profile.slug };
  });

const listVideosFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnVideos } = await import("@/data/dashboard/videos.server");
    return listOwnVideos(context.supabase, context.userId);
  });

const createVideoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: VideoInput) => data)
  .handler(async ({ context, data }) => {
    const { createVideo } = await import("@/data/dashboard/videos.server");
    await createVideo(context.supabase, context.userId, data);
  });

const updateVideoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & Partial<VideoInput>) => data)
  .handler(async ({ context, data }) => {
    const { updateVideo } = await import("@/data/dashboard/videos.server");
    const { id, ...updates } = data;
    await updateVideo(context.supabase, context.userId, id, updates);
  });

const deleteVideoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteVideo } = await import("@/data/dashboard/videos.server");
    return deleteVideo(context.supabase, context.userId, data.id);
  });

const OWN_VIDEOS_QUERY_KEY = ["own-videos"];

function VideosPage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["own-profile-slug"],
    queryFn: () => getProfileSlugFn(),
  });
  const videosQuery = useQuery({ queryKey: OWN_VIDEOS_QUERY_KEY, queryFn: () => listVideosFn() });

  const onSaved = () => queryClient.invalidateQueries({ queryKey: OWN_VIDEOS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: VideoInput) => createVideoFn({ data: input }),
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; updates: Partial<VideoInput> }) =>
      updateVideoFn({ data: { id: vars.id, ...vars.updates } }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVideoFn({ data: { id } }),
  });

  const slug = profileQuery.data?.slug;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <VideoManager
        videos={videosQuery.data ?? []}
        isLoading={videosQuery.isLoading}
        uploadSlug={slug ?? ""}
        onCreate={(input) => createMutation.mutateAsync(input)}
        onUpdate={(id, updates) => updateMutation.mutateAsync({ id, updates })}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        onSaved={onSaved}
      />
    </div>
  );
}
