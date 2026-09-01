// Phase 5.2E — shared Videos manager UI, extracted from
// src/routes/dashboard.videos.tsx so both the beautician's own
// /dashboard/videos page and the Master Admin Console's
// /admin/beauticians/$slug Videos section render the identical
// presentational component. Nothing here knows whether it's being driven
// by the beautician's own session or an admin's explicit-target session —
// it only receives data and calls the onCreate/onUpdate/onDelete callbacks
// it's given, matching the exact "context/config/loader" pattern already
// established for ServicesManager (5.2A), ProfileManager (5.2B),
// GalleryManager (5.2C), and BeforeAfterManager (5.2D). No behavior change
// from the original dashboard.videos.tsx — this is a mechanical
// extraction. The URL-safety allow-list (isSafeExternalVideoUrl, from
// src/lib/video-embed.ts) is reused completely unmodified — this file
// must never loosen it to a generic z.string().url().
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Film, ImagePlus, UploadCloud } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  uploadPortfolioMedia,
  uploadPortfolioVideo,
  buildPublicMediaUrl,
  deletePortfolioMedia,
  UPLOAD_HINT,
  VIDEO_UPLOAD_HINT,
} from "@/lib/storage-upload";
import { extractStoragePathFromPublicUrl } from "@/lib/storage-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import type { Database, Tables } from "@/integrations/supabase/types";
import type { DeletedVideoStoragePaths, VideoInput } from "@/data/dashboard/videos.server";
import { isSafeExternalVideoUrl } from "@/lib/video-embed";

const PLATFORMS: Database["public"]["Enums"]["video_platform"][] = [
  "instagram",
  "youtube",
  "uploaded",
  "other",
];

const videoSchema = z
  .object({
    title: z.string().min(1, "Required"),
    description: z.string(),
    category: z.string(),
    platform: z.enum(["youtube", "instagram", "uploaded", "other"]),
    video_url: z.string(),
    storage_path: z.string(),
    thumbnail_url: z.string().url("Upload a thumbnail image"),
    duration_seconds: z.string(),
    is_published: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.platform === "uploaded") {
      if (!values.storage_path) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["storage_path"],
          message: "Upload a video file",
        });
      }
    } else if (!isSafeExternalVideoUrl(values.video_url, values.platform)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["video_url"],
        message: "Enter a valid HTTPS video URL.",
      });
    }
  });
type VideoFormValues = z.infer<typeof videoSchema>;

const EMPTY: VideoFormValues = {
  title: "",
  description: "",
  category: "",
  platform: "instagram",
  video_url: "",
  storage_path: "",
  thumbnail_url: "",
  duration_seconds: "",
  is_published: true,
};

/** Strips the profiles/{slug}/videos/ prefix and the collision-safe
 * timestamp prefix, leaving the original filename for display. */
function videoFileNameFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/^\d+-/, "");
}

function toVideoInput(values: VideoFormValues): VideoInput {
  const seconds = values.duration_seconds.trim() ? Number(values.duration_seconds) : null;
  const isUploaded = values.platform === "uploaded";
  return {
    title: values.title,
    description: values.description || null,
    category: values.category || null,
    platform: values.platform,
    video_url: isUploaded ? null : values.video_url,
    storage_path: isUploaded ? values.storage_path || null : null,
    thumbnail_url: values.thumbnail_url,
    duration_seconds: Number.isFinite(seconds) ? seconds : null,
    is_published: values.is_published,
  };
}

function VideoFormDialog({
  uploadSlug,
  video,
  onCreate,
  onUpdate,
  onSaved,
}: {
  uploadSlug: string;
  video?: Tables<"portfolio_videos">;
  onCreate: (input: VideoInput) => Promise<void>;
  onUpdate: (id: string, updates: Partial<VideoInput>) => Promise<void>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [selectedVideoFileSize, setSelectedVideoFileSize] = useState<number | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const form = useForm<VideoFormValues>({
    resolver: zodResolver(videoSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setSelectedVideoFileSize(null);
    form.reset(
      video
        ? {
            title: video.title ?? "",
            description: video.description ?? "",
            category: video.category ?? "",
            platform: video.platform,
            video_url: video.video_url ?? "",
            storage_path: video.storage_path ?? "",
            thumbnail_url: video.thumbnail_url ?? "",
            duration_seconds: video.duration_seconds?.toString() ?? "",
            is_published: video.is_published,
          }
        : EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, video?.id]);

  const processThumbnailFile = async (file: File) => {
    setUploadingThumbnail(true);
    try {
      // Phase 5.2E1 — its own namespace, never mixed into Gallery's own
      // media. Existing videos with a thumbnail already persisted under
      // /gallery/ from before this fix keep rendering unchanged (the
      // thumbnail_url is a full public URL, unrelated to where a NEW
      // upload lands) — only new uploads use the corrected path.
      const path = await uploadPortfolioMedia(uploadSlug, "video-thumbnails", file);
      form.setValue("thumbnail_url", buildPublicMediaUrl(path), { shouldValidate: true });
      toast.success("Thumbnail uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload thumbnail");
    } finally {
      setUploadingThumbnail(false);
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
    }
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void processThumbnailFile(file);
  };

  const handleThumbnailDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (uploadingThumbnail) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void processThumbnailFile(file);
  };

  const processVideoFile = async (file: File) => {
    setUploadingVideo(true);
    try {
      const path = await uploadPortfolioVideo(uploadSlug, file);
      form.setValue("storage_path", path, { shouldValidate: true });
      setSelectedVideoFileSize(file.size);
      toast.success("Video uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload video");
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void processVideoFile(file);
  };

  const handleVideoDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (uploadingVideo) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void processVideoFile(file);
  };

  const handleRemoveVideoFile = () => {
    form.setValue("storage_path", "", { shouldValidate: true });
    setSelectedVideoFileSize(null);
  };

  const save = useMutation({
    mutationFn: async (values: VideoFormValues) => {
      const payload = toVideoInput(values);
      if (video) {
        await onUpdate(video.id, payload);
        // Phase 5.2E1 §4 — only after the DB update has actually
        // succeeded is the OLD thumbnail (if replaced) removed; never
        // before, so a failed save never leaves the row pointing at a
        // deleted object. The original persisted value is read from
        // `video.thumbnail_url` (captured before any edits), not from
        // form state, so this only fires on a genuine replacement.
        if (payload.thumbnail_url && payload.thumbnail_url !== video.thumbnail_url) {
          const oldPath = video.thumbnail_url
            ? extractStoragePathFromPublicUrl(video.thumbnail_url)
            : null;
          if (oldPath) await deletePortfolioMedia(oldPath);
        }
      } else {
        await onCreate(payload);
      }
    },
    onSuccess: () => {
      toast.success(video ? "Video updated" : "Video added");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save video"),
  });

  const thumbnailUrl = form.watch("thumbnail_url");
  const platform = form.watch("platform");
  const storagePath = form.watch("storage_path");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={video ? "softline" : "hero"} size="sm">
          {video ? "Edit" : "Add video"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{video ? "Edit video" : "Add video"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="platform"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Platform</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PLATFORMS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {field.value === "uploaded"
                        ? "Upload an MP4, MOV or WebM video up to 50MB."
                        : field.value === "instagram"
                          ? "Instagram reels work best — paste the reel link and match this to it."
                          : null}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="duration_seconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (seconds, optional)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {platform === "uploaded" ? (
              <FormField
                control={form.control}
                name="storage_path"
                render={() => (
                  <FormItem>
                    <FormLabel>Video file</FormLabel>
                    <div className="space-y-2">
                      {storagePath ? (
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 p-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <Film className="h-5 w-5 text-primary" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {videoFileNameFromPath(storagePath)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {selectedVideoFileSize != null
                                ? `${(selectedVideoFileSize / (1024 * 1024)).toFixed(1)} MB · Uploaded`
                                : "Uploaded"}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button
                              type="button"
                              variant="softline"
                              size="sm"
                              onClick={() => videoInputRef.current?.click()}
                              disabled={uploadingVideo}
                            >
                              Change
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleRemoveVideoFile}
                              disabled={uploadingVideo}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <FormControl>
                          <label
                            htmlFor="video-upload-input"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleVideoDrop}
                            className={cn(
                              "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-secondary/30 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
                              uploadingVideo && "pointer-events-none opacity-60",
                            )}
                          >
                            <UploadCloud className="h-6 w-6 text-primary" aria-hidden="true" />
                            <span className="text-sm font-semibold">
                              Choose video or drag &amp; drop
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {VIDEO_UPLOAD_HINT}
                            </span>
                            <input
                              id="video-upload-input"
                              ref={videoInputRef}
                              type="file"
                              accept="video/mp4,video/quicktime,video/webm"
                              onChange={handleVideoFileChange}
                              disabled={uploadingVideo}
                              className="sr-only"
                            />
                          </label>
                        </FormControl>
                      )}
                      {storagePath && (
                        <input
                          ref={videoInputRef}
                          type="file"
                          accept="video/mp4,video/quicktime,video/webm"
                          onChange={handleVideoFileChange}
                          disabled={uploadingVideo}
                          className="hidden"
                        />
                      )}
                      {uploadingVideo && (
                        <p className="text-xs text-muted-foreground">Uploading…</p>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="video_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Video link</FormLabel>
                    <FormControl>
                      <Input placeholder="https://…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="thumbnail_url"
              render={() => (
                <FormItem>
                  <FormLabel>Thumbnail image</FormLabel>
                  {thumbnailUrl ? (
                    <div className="relative w-40 overflow-hidden rounded-lg border border-border">
                      <img
                        src={thumbnailUrl}
                        alt="Thumbnail"
                        className="aspect-video w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 flex justify-end bg-black/55 px-2 py-1.5 backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => thumbnailInputRef.current?.click()}
                          disabled={uploadingThumbnail}
                          className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-foreground hover:bg-white disabled:opacity-60"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  ) : (
                    <FormControl>
                      <label
                        htmlFor="thumbnail-upload-input"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleThumbnailDrop}
                        className={cn(
                          "flex min-h-24 w-full max-w-xs cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border px-4 py-4 text-center transition-colors hover:border-primary/50 hover:bg-secondary/30 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
                          uploadingThumbnail && "pointer-events-none opacity-60",
                        )}
                      >
                        <ImagePlus className="h-5 w-5 text-primary" aria-hidden="true" />
                        <span className="text-sm font-semibold">
                          Choose thumbnail or drag &amp; drop
                        </span>
                        <span className="text-xs text-muted-foreground">{UPLOAD_HINT}</span>
                        <input
                          id="thumbnail-upload-input"
                          ref={thumbnailInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleThumbnailChange}
                          disabled={uploadingThumbnail}
                          className="sr-only"
                        />
                      </label>
                    </FormControl>
                  )}
                  {thumbnailUrl && (
                    <input
                      ref={thumbnailInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleThumbnailChange}
                      disabled={uploadingThumbnail}
                      className="hidden"
                    />
                  )}
                  {uploadingThumbnail && (
                    <p className="text-xs text-muted-foreground">Uploading…</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Bridal, Transformation, …" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_published"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Show on portfolio</FormLabel>
                </FormItem>
              )}
            />
            <Button
              type="submit"
              variant="hero"
              className="w-full"
              disabled={save.isPending || uploadingThumbnail || uploadingVideo}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shared Videos manager — the ONE component both /dashboard/videos and the
 * admin workspace's Videos section render. Receives its data and mutation
 * callbacks as props; has no idea whether it's driven by the beautician's
 * own session or an admin's explicit-target session. `uploadSlug` is the
 * slug both the video file and the thumbnail image are stored under — the
 * admin route passes the SELECTED professional's own slug, never the
 * admin's.
 */
export function VideoManager({
  title = "Videos",
  subtitle = "Videos shown on the portfolio's Videos section.",
  videos,
  isLoading,
  uploadSlug,
  onCreate,
  onUpdate,
  onDelete,
  onSaved,
}: {
  title?: string;
  subtitle?: string;
  videos: Tables<"portfolio_videos">[];
  isLoading: boolean;
  uploadSlug: string;
  onCreate: (input: VideoInput) => Promise<void>;
  onUpdate: (id: string, updates: Partial<VideoInput>) => Promise<void>;
  onDelete: (id: string) => Promise<DeletedVideoStoragePaths>;
  onSaved: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this video?")) return;
    setDeletingId(id);
    try {
      const { videoPath, thumbnailPath } = await onDelete(id);
      // Phase 5.2E1 §3 — the DB row is already gone at this point (onDelete
      // resolved); these are exactly the storage objects this row owned,
      // already re-validated server-side as belonging to the target
      // profile's own namespace. Best-effort: a storage cleanup failure
      // here doesn't resurrect the row or block the "deleted" outcome.
      await Promise.all(
        [videoPath, thumbnailPath]
          .filter((p): p is string => !!p)
          .map((p) => deletePortfolioMedia(p)),
      );
      toast.success("Video deleted");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete video");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <VideoFormDialog
          uploadSlug={uploadSlug}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onSaved={onSaved}
        />
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : videos.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-soft">
            No videos yet — add the first one above.
          </p>
        ) : (
          videos.map((video) => (
            <div
              key={video.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-soft"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{video.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{video.platform}</Badge>
                    {!video.is_published && <Badge variant="secondary">Hidden</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <VideoFormDialog
                    uploadSlug={uploadSlug}
                    video={video}
                    onCreate={onCreate}
                    onUpdate={onUpdate}
                    onSaved={onSaved}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingId === video.id}
                    onClick={() => void handleDelete(video.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {video.description && (
                <p className="mt-2 text-sm text-muted-foreground">{video.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
