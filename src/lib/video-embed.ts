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
    return { type: "link", src: video.videoUrl };
  }

  if (video.platform === "instagram") {
    const embedUrl = extractInstagramEmbedUrl(video.videoUrl);
    if (embedUrl) return { type: "iframe", src: embedUrl };
    return { type: "link", src: video.videoUrl };
  }

  return { type: "link", src: video.videoUrl };
}
