// Deterministic image/video-thumbnail alt-text generation — pure functions,
// no I/O, safe to import from server-only mapper code. This is the single
// place that decides "what alt text does this piece of media get," so the
// dashboard preview and the public page can never diverge and so no two
// unrelated images collapse onto the exact same generic string.
//
// Priority, per docs/BEAUTYFOLIO-PHASE3F2B-MEDIA-SEO.md §3-4:
//   1. Real, manually-authored text (alt_text/caption) — used AS-IS, never
//      further wrapped or suffixed.
//   2. Item title + category
//   3. Item title + professional/service context (role)
//   4. Category + portfolio owner + city
//   5. A safe, still-specific-enough generic fallback
//
// Never keyword-stuffed: each tier uses only the fields that are actually
// present, so two images with different titles/categories naturally get
// different text — nothing here repeats a single canned phrase for every
// image on a profile.

export interface MediaAltContext {
  professionalName: string;
  role: string;
  city: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Gallery / general portfolio photo alt text. */
export function buildGalleryImageAlt(
  ctx: MediaAltContext,
  input: {
    altText: string | null;
    caption: string | null;
    title: string | null;
    category: string | null;
  },
): string {
  const manual = clean(input.caption) ?? clean(input.altText);
  if (manual) return manual;

  const title = clean(input.title);
  const category = clean(input.category);
  const city = clean(ctx.city);

  if (title && category) return `${title} — ${category} by ${ctx.professionalName}`;
  if (title) return `${title} by ${ctx.professionalName}${city ? ` in ${city}` : ""}`;
  if (category && city) return `${category} work by ${ctx.professionalName} in ${city}`;
  if (category) return `${category} work by ${ctx.professionalName}`;
  return `Portfolio photo by ${ctx.professionalName}${city ? ` in ${city}` : ""}`;
}

/** Before/After — the two sides of one pair must never read identically. */
export function buildBeforeAfterAlt(
  ctx: MediaAltContext,
  input: {
    side: "before" | "after";
    altText: string | null;
    title: string | null;
    eventType: string | null;
  },
): string {
  const manual = clean(input.altText);
  if (manual) return manual;

  const title = clean(input.title);
  const eventType = clean(input.eventType);
  const subject = title ?? eventType ?? "makeup";

  if (input.side === "before") {
    return `Before ${subject.toLowerCase()} transformation`;
  }
  return `After ${subject.toLowerCase()} transformation by ${ctx.professionalName}`;
}

/** Video thumbnail — no manual override field exists (see §7 of the phase
 * doc for why), so this is always generated. */
export function buildVideoThumbnailAlt(
  ctx: MediaAltContext,
  input: { title: string | null; category: string | null },
): string {
  const title = clean(input.title);
  const category = clean(input.category);
  const city = clean(ctx.city);

  if (title) return `${title} — video by ${ctx.professionalName}`;
  if (category)
    return `${category} transformation video by ${ctx.professionalName}${city ? ` in ${city}` : ""}`;
  return `Makeup transformation video by ${ctx.professionalName}`;
}
