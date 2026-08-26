// Pure, client-safe helper that turns a stored portfolio video (platform +
// link + optional Storage path) into something a <VideoPlayerModal> can
// actually render. No network calls, no side effects — safe to call from
// both the server-side mapper and the client-side player component.

export type VideoPlatform = "youtube" | "instagram" | "uploaded" | "other";

export interface EmbeddableVideo {
  platform: VideoPlatform;
  videoUrl: string | null;
  /** Resolved public URL for an "uploaded" video, if any. */
  resolvedStorageUrl?: string | null;
}

export type VideoEmbedSource =
  | { type: "iframe"; src: string }
  | { type: "video"; src: string }
  | { type: "link"; src: string }
  | null;

/** Platforms that store a user-supplied external link (as opposed to
 * "uploaded", whose video_url is always null — see toVideoInput /
 * portfolio-mapper.ts). */
export type ExternalVideoPlatform = "youtube" | "instagram" | "other";

// Phase 3H.2C — the ONE allow-list every external video URL must pass,
// both at write time (dashboard form + server create/update) and at
// render time (getVideoEmbedSource's "link" fallback below), so a
// javascript:/data:/vbscript:/file:/ftp: URL can never reach a rendered
// <a href> or get persisted in the first place.
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

/**
 * HTTPS-only protocol allow-list plus a per-platform host allow-list for
 * youtube/instagram; "other" accepts any hostname as long as the protocol
 * is https:. Uses the URL constructor (never startsWith("http") or a bare
 * z.string().url(), neither of which express a scheme policy) so a value
 * like "javascript:alert(1)" or "javascript://example.com/%0Aalert(1)"
 * is rejected by protocol, not by string-matching a decoy hostname.
 */
export function isSafeExternalVideoUrl(url: string, platform: ExternalVideoPlatform): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (platform === "youtube") return YOUTUBE_HOSTS.has(host);
  if (platform === "instagram") return INSTAGRAM_HOSTS.has(host);
  return true;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractInstagramEmbedUrl(url: string): string | null {
  const match = url.match(/instagram\.com\/(reel|p|tv)\/([\w-]+)/);
  if (!match) return null;
  const [, kind, code] = match;
  return `https://www.instagram.com/${kind}/${code}/embed/`;
}

/** Determines how a portfolio video should be rendered in the player modal. */
export function getVideoEmbedSource(video: EmbeddableVideo): VideoEmbedSource {
  if (video.platform === "uploaded") {
    if (video.resolvedStorageUrl) return { type: "video", src: video.resolvedStorageUrl };
    if (video.videoUrl) return { type: "video", src: video.videoUrl };
    return null;
  }

  if (!video.videoUrl) return null;

  if (video.platform === "youtube") {
    const id = extractYouTubeId(video.videoUrl);
    if (id)
      return {
        type: "iframe",
        src: `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`,
      };
    // Fallback "watch on original site" link — render-time defense in
    // depth (Phase 3H.2C §7) in case a legacy/malformed value slipped past
    // write-time validation: never emit an href for an unsafe scheme.
    return isSafeExternalVideoUrl(video.videoUrl, "youtube")
      ? { type: "link", src: video.videoUrl }
      : null;
  }

  if (video.platform === "instagram") {
    const embedUrl = extractInstagramEmbedUrl(video.videoUrl);
    if (embedUrl) return { type: "iframe", src: embedUrl };
    return isSafeExternalVideoUrl(video.videoUrl, "instagram")
      ? { type: "link", src: video.videoUrl }
      : null;
  }

  return isSafeExternalVideoUrl(video.videoUrl, "other")
    ? { type: "link", src: video.videoUrl }
    : null;
}
