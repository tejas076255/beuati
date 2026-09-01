import { describe, expect, it } from "vitest";
import { isSafeExternalVideoUrl } from "@/lib/video-embed";

describe("isSafeExternalVideoUrl", () => {
  const unsafeUrls = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com/video",
    "http://example.com/video.mp4",
  ];

  for (const url of unsafeUrls) {
    it(`rejects unsafe URL: ${url}`, () => {
      expect(isSafeExternalVideoUrl(url, "other")).toBe(false);
    });
  }

  it("rejects a non-https youtube-hostname URL served over plain http", () => {
    expect(isSafeExternalVideoUrl("http://www.youtube.com/watch?v=abc12345678", "youtube")).toBe(
      false,
    );
  });

  it("accepts a safe HTTPS YouTube URL", () => {
    expect(isSafeExternalVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube")).toBe(
      true,
    );
  });

  it("accepts a safe HTTPS youtu.be URL", () => {
    expect(isSafeExternalVideoUrl("https://youtu.be/dQw4w9WgXcQ", "youtube")).toBe(true);
  });

  it("rejects a youtube-labeled URL on an unrelated host", () => {
    expect(isSafeExternalVideoUrl("https://evil.example.com/watch?v=abc", "youtube")).toBe(false);
  });

  it("accepts a safe HTTPS Instagram URL", () => {
    expect(isSafeExternalVideoUrl("https://www.instagram.com/reel/Cabc123/", "instagram")).toBe(
      true,
    );
  });

  it("rejects an instagram-labeled URL on an unrelated host", () => {
    expect(isSafeExternalVideoUrl("https://evil.example.com/reel/Cabc123/", "instagram")).toBe(
      false,
    );
  });
});
