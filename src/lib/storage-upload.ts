// Client-side helper for uploading portfolio media directly to Supabase
// Storage, using the browser client's own authenticated session. This is
// the standard Supabase pattern — Storage has its own REST API, no server
// function proxy needed. The owner-scoped write RLS policy on
// storage.objects (path prefix profiles/{slug}/...) is what actually
// secures this, not anything in this file.
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "portfolio-media";

// Phase 5.2E1 — "video-thumbnails" added as its own semantic namespace so
// a video's thumbnail is never mixed into the Gallery's own media
// (profiles/{slug}/gallery/...). Existing thumbnails already persisted
// under /gallery/ (from before this fix) are untouched and keep rendering
// — thumbnail_url is a full public URL, not derived from this category at
// read time, so nothing needs to migrate.
export type MediaCategory = "profile" | "gallery" | "before-after" | "video-thumbnails";

export const MAX_UPLOAD_SIZE_MB = 5;
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Recommended dimensions per upload slot — every image on the public page
 * renders with object-cover, so any image works, but matching these avoids
 * awkward crops. Shown as helper text next to each upload input.
 */
export const IMAGE_GUIDELINES: Record<MediaCategory, string> = {
  profile: "Portrait, ideally 1000×1250px (4:5 ratio)",
  gallery: "Square or near-square, ideally 1200×1200px",
  "before-after": "Portrait, ideally 1000×1250px (4:5 ratio), matching for both images",
  "video-thumbnails": "Widescreen, ideally 1280×720px (16:9 ratio)",
};

export const UPLOAD_HINT = `JPG, PNG or WebP · up to ${MAX_UPLOAD_SIZE_MB}MB`;

function assertValidImageFile(file: File): void {
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    throw new Error("Please upload a JPG, PNG or WebP image.");
  }
  if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
    throw new Error(`Image is too large — please keep it under ${MAX_UPLOAD_SIZE_MB}MB.`);
  }
}

/**
 * Uploads a file to profiles/{slug}/{category}/{timestamp}-{filename} and
 * returns the storage_path to save on the corresponding database row.
 */
export async function uploadPortfolioMedia(
  slug: string,
  category: MediaCategory,
  file: File,
): Promise<string> {
  assertValidImageFile(file);

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `profiles/${slug}/${category}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  return path;
}

export function buildPublicMediaUrl(storagePath: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function deletePortfolioMedia(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

export const MAX_VIDEO_UPLOAD_SIZE_MB = 50;
const ACCEPTED_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export const VIDEO_UPLOAD_HINT = `MP4, MOV or WebM · up to ${MAX_VIDEO_UPLOAD_SIZE_MB}MB`;

function assertValidVideoFile(file: File): void {
  if (!ACCEPTED_VIDEO_MIME_TYPES.includes(file.type)) {
    throw new Error("Please upload an MP4, MOV or WebM video.");
  }
  if (file.size > MAX_VIDEO_UPLOAD_SIZE_MB * 1024 * 1024) {
    throw new Error(`Video is too large — please keep it under ${MAX_VIDEO_UPLOAD_SIZE_MB}MB.`);
  }
}

/**
 * Uploads a video to profiles/{slug}/videos/{timestamp}-{filename} and
 * returns the storage_path to save on the corresponding portfolio_videos
 * row. Same bucket, same owner-scoped RLS (category-agnostic), same path
 * convention as uploadPortfolioMedia — kept as a separate function so the
 * existing image validation/behavior is untouched.
 */
export async function uploadPortfolioVideo(slug: string, file: File): Promise<string> {
  assertValidVideoFile(file);

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `profiles/${slug}/videos/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload video: ${error.message}`);
  }

  return path;
}
