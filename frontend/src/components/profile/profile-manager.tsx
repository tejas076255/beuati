// Phase 5.2B — shared Profile manager UI, extracted from
// src/routes/dashboard.profile.tsx so both the beautician's own
// /dashboard/profile page and the Master Admin Console's
// /admin/beauticians/$slug Profile section render the identical
// presentational component. Nothing here knows whether it's being driven
// by the beautician's own session or an admin's explicit-target session —
// it only receives data and calls the onSave callback it's given, matching
// the exact "context/config/loader" pattern already established for
// ServicesManager in Phase 5.2A. No behavior change from the original
// dashboard.profile.tsx — this is a mechanical extraction, with one
// deliberate hardening applied (see the photoUrl/coverUrl lazy-init note
// below, added per Phase 5.2B's explicit form-state-integrity audit
// requirement after the Phase 5.2A.1 shared-form state bug).
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Briefcase,
  Camera,
  Eye,
  ExternalLink,
  MapPin,
  Phone,
  Share2,
  User as UserIcon,
  Link2,
  Upload,
  Clipboard,
  Check,
  Image as ImageIcon,
} from "lucide-react";

import {
  uploadPortfolioMedia,
  uploadPortfolioMediaFromUrl,
  buildPublicMediaUrl,
  deletePortfolioMedia,
  resolveOwnedMediaPath,
  IMAGE_GUIDELINES,
  UPLOAD_HINT,
} from "@/lib/storage-upload";
import { cn } from "@/lib/utils";
import {
  evaluatePortfolioContentReadiness,
  portfolioReadinessMessage,
  portfolioReadinessStateLabel,
  type PortfolioReadinessCheck,
  type PortfolioReadinessState,
} from "@/lib/seo-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import type { Tables } from "@/integrations/supabase/types";
import type {
  OwnProfileUpdate,
  OwnPortfolioReadinessContext,
} from "@/data/dashboard/profile.server";

const profileSchema = z.object({
  display_name: z.string().min(1, "Required"),
  professional_title: z.string(),
  short_tagline: z.string(),
  bio: z.string(),
  bio_secondary: z.string(),
  years_experience: z.string(),
  primary_city: z.string(),
  locality: z.string(),
  state: z.string(),
  map_query: z.string(),
  phone: z.string(),
  whatsapp_number: z.string(),
  email: z.string(),
  address: z.string(),
  working_hours: z.string(),
  travel_note: z.string(),
  status: z.enum(["draft", "published", "unpublished"]),
  about_highlights: z.string(),
  why_choose_points: z.string(),
  business_name: z.string(),
  website_url: z.string().url("Enter a valid URL").or(z.literal("")),
  facebook_url: z.string().url("Enter a valid URL").or(z.literal("")),
  instagram_url: z.string().url("Enter a valid URL").or(z.literal("")),
  youtube_url: z.string().url("Enter a valid URL").or(z.literal("")),
});

/** Accepts either a bare embed URL or the full <iframe> snippet Google's
 * "Share → Embed a map" panel gives people to copy, and normalizes to just
 * the URL — that's what actually gets stored and rendered. */
function extractMapEmbedUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.includes("<iframe")) return trimmed;
  const match = trimmed.match(/src="([^"]+)"/);
  return match?.[1] ?? trimmed;
}

function toLineArray(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

type ProfileFormValues = z.infer<typeof profileSchema>;

const EMPTY_VALUES: ProfileFormValues = {
  display_name: "",
  professional_title: "",
  short_tagline: "",
  bio: "",
  bio_secondary: "",
  years_experience: "",
  primary_city: "",
  locality: "",
  state: "",
  map_query: "",
  phone: "",
  whatsapp_number: "",
  email: "",
  address: "",
  working_hours: "",
  travel_note: "",
  status: "draft",
  about_highlights: "",
  why_choose_points: "",
  business_name: "",
  website_url: "",
  facebook_url: "",
  instagram_url: "",
  youtube_url: "",
};

function toFormValues(p: Tables<"beautician_profiles">): ProfileFormValues {
  return {
    display_name: p.display_name ?? "",
    professional_title: p.professional_title ?? "",
    short_tagline: p.short_tagline ?? "",
    bio: p.bio ?? "",
    bio_secondary: p.bio_secondary ?? "",
    years_experience: p.years_experience?.toString() ?? "",
    primary_city: p.primary_city ?? "",
    locality: p.locality ?? "",
    state: p.state ?? "",
    map_query: p.map_query ?? "",
    phone: p.phone ?? "",
    whatsapp_number: p.whatsapp_number ?? "",
    email: p.email ?? "",
    address: p.address ?? "",
    working_hours: p.working_hours ?? "",
    travel_note: p.travel_note ?? "",
    status: (p.status === "suspended" ? "unpublished" : p.status) as ProfileFormValues["status"],
    about_highlights: (p.about_highlights ?? []).join("\n"),
    why_choose_points: (p.why_choose_points ?? []).join("\n"),
    business_name: p.business_name ?? "",
    website_url: p.website_url ?? "",
    facebook_url: p.facebook_url ?? "",
    instagram_url: p.instagram_url ?? "",
    youtube_url: p.youtube_url ?? "",
  };
}

const STATUS_LABEL: Record<ProfileFormValues["status"], string> = {
  draft: "Draft — only you can see this",
  published: "Published — visible on your public portfolio",
  unpublished: "Unpublished — hidden from search and direct links",
};

const STATUS_BADGE: Record<
  ProfileFormValues["status"],
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  published: { label: "Published", variant: "default" },
  unpublished: { label: "Unpublished", variant: "outline" },
};

const PORTFOLIO_STATE_CLASS: Record<PortfolioReadinessState, string> = {
  ready: "text-emerald-600",
  needs_improvement: "text-amber-600",
  not_eligible: "text-muted-foreground",
};

/** Compact "PORTFOLIO READINESS" panel — the one authoritative deterministic
 * readiness model, computed live from unsaved draft form state. Required
 * and Recommended are always visually separated so an optional item never
 * looks mandatory. */
function PortfolioReadinessPanel({
  readiness,
  isPreview,
}: {
  readiness: ReturnType<typeof evaluatePortfolioContentReadiness> | null;
  isPreview: boolean;
}) {
  if (!readiness) {
    return <p className="mt-5 text-xs text-muted-foreground">Loading portfolio readiness…</p>;
  }
  const required = readiness.checks.filter((c) => c.required);
  const recommended = readiness.checks.filter((c) => !c.required);

  return (
    <div className="mt-5 space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">Portfolio readiness</span>
        <span className={cn("text-xs font-semibold", PORTFOLIO_STATE_CLASS[readiness.state])}>
          {portfolioReadinessStateLabel(readiness.state)}
          {readiness.state === "needs_improvement" &&
            ` — ${readiness.requiredFailedCount} required`}
        </span>
      </div>
      {isPreview && (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
          Preview based on unsaved changes — save to apply these to the public portfolio.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {portfolioReadinessMessage(readiness.state, isPreview)}
      </p>
      <ReadinessMiniList label="Required" checks={required} />
      <ReadinessMiniList label="Recommended" checks={recommended} />
    </div>
  );
}

function ReadinessMiniList({
  label,
  checks,
}: {
  label: string;
  checks: PortfolioReadinessCheck[];
}) {
  return (
    <div>
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-1.5 text-xs">
            <span
              className={cn(
                "mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                check.status === "pass"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-secondary text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {check.status === "pass" ? "✓" : "○"}
            </span>
            <span className={check.status === "pass" ? "text-foreground" : "text-muted-foreground"}>
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/**
 * Shared Profile manager — the ONE component both /dashboard/profile and
 * the admin workspace's Profile section render. Receives its data and save
 * callback as props; has no idea whether it's driven by the beautician's
 * own session or an admin's explicit-target session. `uploadSlug` is the
 * slug new photo/cover uploads are stored under
 * (profiles/{uploadSlug}/profile/...) — the admin route passes the
 * SELECTED professional's own slug here, never the admin's own, so an
 * admin editing Dharti's profile always uploads into Dharti's storage
 * path, never the admin's.
 */
export function ProfileManager({
  title = "Profile",
  subtitle = "Manage your professional identity and the information customers see on your BeautyFolio profile.",
  profile,
  readinessContext,
  isLoading,
  uploadSlug,
  publicPortfolioSlug,
  onSave,
}: {
  title?: string;
  subtitle?: string;
  profile: Tables<"beautician_profiles"> | undefined;
  readinessContext: OwnPortfolioReadinessContext | undefined;
  isLoading: boolean;
  uploadSlug: string | undefined;
  publicPortfolioSlug: string | undefined;
  onSave: (updates: OwnProfileUpdate) => Promise<void>;
}) {
  // Phase 5.2B — lazily seeded from `profile` at mount, not a bare `null`
  // literal: the Phase 5.2A.1 shared-form-state bug (an unconditional
  // default corrected only by a later effect, leaving a first-paint race
  // window) is the same class of risk here, so both draft image states
  // seed directly from whatever `profile` is already available at mount
  // instead of relying solely on the effect below.
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => profile?.profile_image_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(() => profile?.cover_image_url ?? null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Modal for pasting image URL or direct link
  const [pasteModalTarget, setPasteModalTarget] = useState<"photo" | "cover" | null>(null);
  const [pastedUrlInput, setPastedUrlInput] = useState("");
  const [processingUrl, setProcessingUrl] = useState(false);

  // QA-1N-D2 — independent pending-upload tracking for Profile and Cover.
  const pendingPhotoPathRef = useRef<string | null>(null);
  const pendingCoverPathRef = useRef<string | null>(null);
  const photoUploadTokenRef = useRef(0);
  const coverUploadTokenRef = useRef(0);
  const originalPhotoUrlRef = useRef<string | null>(profile?.profile_image_url ?? null);
  const originalCoverUrlRef = useRef<string | null>(profile?.cover_image_url ?? null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!profile) return;
    setPhotoUrl(profile.profile_image_url);
    setCoverUrl(profile.cover_image_url);
    pendingPhotoPathRef.current = null;
    pendingCoverPathRef.current = null;
    originalPhotoUrlRef.current = profile.profile_image_url;
    originalCoverUrlRef.current = profile.cover_image_url;
    form.reset(toFormValues(profile));
    setFormReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Best-effort protection against losing unsaved edits on an accidental tab close/refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form.formState.isDirty]);

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: ProfileFormValues) => {
    const years = values.years_experience.trim() ? Number(values.years_experience) : null;
    setSaving(true);
    try {
      await onSave({
        ...values,
        years_experience: years != null && Number.isFinite(years) ? years : null,
        map_query: extractMapEmbedUrl(values.map_query),
        profile_image_url: photoUrl,
        cover_image_url: coverUrl,
        about_highlights: toLineArray(values.about_highlights),
        why_choose_points: toLineArray(values.why_choose_points),
      } as OwnProfileUpdate);

      pendingPhotoPathRef.current = null;
      pendingCoverPathRef.current = null;

      const previousPhotoUrl = originalPhotoUrlRef.current;
      const previousCoverUrl = originalCoverUrlRef.current;
      if (previousPhotoUrl && previousPhotoUrl !== photoUrl && uploadSlug) {
        const oldPath = resolveOwnedMediaPath(previousPhotoUrl, uploadSlug);
        if (oldPath) void deletePortfolioMedia(oldPath).catch(() => {});
      }
      if (previousCoverUrl && previousCoverUrl !== coverUrl && uploadSlug) {
        const oldPath = resolveOwnedMediaPath(previousCoverUrl, uploadSlug);
        if (oldPath) void deletePortfolioMedia(oldPath).catch(() => {});
      }
      originalPhotoUrlRef.current = photoUrl;
      originalCoverUrlRef.current = coverUrl;

      toast.success("Profile saved — image synced across all devices!");
      form.reset(values);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const uploadPhotoFile = async (file: File) => {
    if (!uploadSlug) {
      toast.error("Profile not loaded yet — please wait a moment and try again.");
      return;
    }
    setUploadingPhoto(true);
    const token = ++photoUploadTokenRef.current;
    try {
      const path = await uploadPortfolioMedia(uploadSlug, "profile", file);
      if (token !== photoUploadTokenRef.current) {
        void deletePortfolioMedia(path).catch(() => {});
        return;
      }
      const previousPending = pendingPhotoPathRef.current;
      pendingPhotoPathRef.current = path;
      if (previousPending && previousPending !== path) {
        void deletePortfolioMedia(previousPending).catch(() => {});
      }
      setPhotoUrl(buildPublicMediaUrl(path));
      toast.success("Photo uploaded! Click Save changes to apply across all devices.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const uploadCoverFile = async (file: File) => {
    if (!uploadSlug) {
      toast.error("Profile not loaded yet — please wait a moment and try again.");
      return;
    }
    setUploadingCover(true);
    const token = ++coverUploadTokenRef.current;
    try {
      const path = await uploadPortfolioMedia(uploadSlug, "profile", file);
      if (token !== coverUploadTokenRef.current) {
        void deletePortfolioMedia(path).catch(() => {});
        return;
      }
      const previousPending = pendingCoverPathRef.current;
      pendingCoverPathRef.current = path;
      if (previousPending && previousPending !== path) {
        void deletePortfolioMedia(previousPending).catch(() => {});
      }
      setCoverUrl(buildPublicMediaUrl(path));
      toast.success("Cover photo uploaded! Click Save changes to apply across all devices.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload cover photo");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPhotoFile(file);
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadCoverFile(file);
  };

  const handleUrlSubmit = async () => {
    if (!pastedUrlInput.trim()) {
      toast.error("Please enter a valid image URL");
      return;
    }
    if (!uploadSlug) {
      toast.error("Profile not loaded yet — please wait a moment.");
      return;
    }
    setProcessingUrl(true);
    try {
      const path = await uploadPortfolioMediaFromUrl(
        uploadSlug,
        "profile",
        pastedUrlInput.trim(),
      );
      const publicUrl = buildPublicMediaUrl(path);
      if (pasteModalTarget === "photo") {
        setPhotoUrl(publicUrl);
        toast.success("Profile photo updated from URL! Click Save changes to apply.");
      } else if (pasteModalTarget === "cover") {
        setCoverUrl(publicUrl);
        toast.success("Cover photo updated from URL! Click Save changes to apply.");
      }
      setPasteModalTarget(null);
      setPastedUrlInput("");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to download image from URL. Make sure the URL is a direct link to an image.",
      );
    } finally {
      setProcessingUrl(false);
    }
  };

  // Global Clipboard Paste listener (Ctrl+V)
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith("image/")) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              await uploadPhotoFile(file);
              return;
            }
          }
        }
      }

      if (!isTyping && uploadSlug) {
        const text = e.clipboardData?.getData("text")?.trim();
        if (text && /^https?:\/\/.+\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i.test(text)) {
          e.preventDefault();
          try {
            setUploadingPhoto(true);
            const path = await uploadPortfolioMediaFromUrl(uploadSlug, "profile", text);
            setPhotoUrl(buildPublicMediaUrl(path));
            toast.success("Pasted image URL uploaded as profile photo! Click Save changes to apply.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to load pasted image URL");
          } finally {
            setUploadingPhoto(false);
          }
        }
      }
    };

    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [uploadSlug]);

  const handleRemovePhoto = () => {
    if (
      !window.confirm(
        "Remove profile photo?\n\nThe portfolio will continue to work, but this profile photo will no longer appear publicly.",
      )
    ) {
      return;
    }
    const pending = pendingPhotoPathRef.current;
    if (pending) {
      pendingPhotoPathRef.current = null;
      void deletePortfolioMedia(pending).catch(() => {});
    }
    setPhotoUrl(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const liveValues = form.watch();
  const statusBadge = STATUS_BADGE[liveValues.status];
  const location = [liveValues.locality, liveValues.primary_city].filter(Boolean).join(", ");

  // Live draft readiness preview. Reuses the exact same
  // evaluatePortfolioContentReadiness() the server uses for the saved
  // state, fed the current draft form values instead. Purely local — never
  // written back, never affects the public page/robots/sitemap by itself.
  const liveReadiness = readinessContext
    ? evaluatePortfolioContentReadiness({
        isPublished: liveValues.status === "published",
        robotsIndex: readinessContext.robotsIndex,
        professionalName: liveValues.display_name,
        professionalTitle: liveValues.professional_title,
        primaryCity: liveValues.primary_city,
        bio: liveValues.bio,
        hasProfileImage: !!photoUrl,
        activeServiceCount: readinessContext.activeServiceCount,
        locality: liveValues.locality,
        serviceAreaCount: readinessContext.serviceAreaCount,
        isVerified: profile?.is_verified ?? false,
        yearsExperience: liveValues.years_experience.trim()
          ? Number(liveValues.years_experience)
          : null,
        publishedGalleryImageCount: readinessContext.publishedGalleryImageCount,
        galleryImagesWithAltCount: readinessContext.galleryImagesWithAltCount,
        publishedBeforeAfterCount: readinessContext.publishedBeforeAfterCount,
        publishedReviewCount: readinessContext.publishedReviewCount,
        publishedFaqCount: readinessContext.publishedFaqCount,
        publishedVideoCount: readinessContext.publishedVideoCount,
        hasValidSocialLink: !!(
          liveValues.instagram_url ||
          liveValues.facebook_url ||
          liveValues.youtube_url ||
          liveValues.website_url
        ),
        hasContactInfo: !!(liveValues.phone || liveValues.email || liveValues.whatsapp_number),
        availabilityConfigured: readinessContext.availabilityConfigured,
        seoTitle: readinessContext.seoTitle,
        metaDescription: readinessContext.metaDescription,
        canonicalUrl: readinessContext.canonicalUrl,
      })
    : null;
  // A brand-new/never-saved profile is always a preview; an existing one
  // is a preview only once the open form or draft photo actually differs
  // from what's persisted.
  const hasUnsavedProfileChanges =
    form.formState.isDirty || photoUrl !== (profile?.profile_image_url ?? null);

  return (
    <div>
      {isLoading || !formReady ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="sticky top-0 z-10 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background pb-4 pt-2">
              <div>
                <h2 className="font-display text-2xl font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              </div>
              <div className="flex items-center gap-3">
                {form.formState.isDirty && (
                  <span className="text-xs text-muted-foreground">Unsaved changes</span>
                )}
                <Button type="submit" variant="hero" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>

            {/* Profile identity card — editorial hero card that doubles as a
                live preview of how the identity reads. */}
            <Card className="mb-6 overflow-hidden border-border/70 shadow-sm">
              <div className="bg-gradient-brand relative h-28 sm:h-36">
                {coverUrl && (
                  <img
                    src={coverUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <div className="absolute right-3 top-3 flex items-center gap-1.5">
                  <label
                    htmlFor="cover-photo-input"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/70 shadow-sm"
                  >
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{coverUrl ? "Change cover" : "Upload cover"}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPastedUrlInput("");
                      setPasteModalTarget("cover");
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-black/50 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/70 shadow-sm"
                    title="Paste Image URL"
                  >
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Paste URL</span>
                  </button>
                </div>
                <input
                  id="cover-photo-input"
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverChange}
                  disabled={uploadingCover || !uploadSlug}
                  className="sr-only"
                />
                {uploadingCover && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
                    Uploading cover…
                  </span>
                )}
              </div>

              <CardContent className="pt-0">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex items-end gap-4">
                    <div className="-mt-10 flex shrink-0 flex-col items-center gap-1 sm:-mt-12">
                      <div className="relative group">
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt=""
                            className="h-20 w-20 rounded-full border-4 border-card object-cover shadow-md sm:h-24 sm:w-24"
                          />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-secondary text-[10px] text-muted-foreground shadow-md sm:h-24 sm:w-24">
                            No photo
                          </div>
                        )}
                        <label
                          htmlFor="profile-photo-input"
                          aria-label="Upload profile photo"
                          className="absolute -right-1 -bottom-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                          title="Upload file or take photo"
                        >
                          <Camera className="h-4 w-4" aria-hidden="true" />
                        </label>
                        <input
                          id="profile-photo-input"
                          ref={photoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handlePhotoChange}
                          disabled={uploadingPhoto || !uploadSlug}
                          className="sr-only"
                        />
                        {uploadingPhoto && (
                          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[9px] text-white">
                            Uploading…
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            setPastedUrlInput("");
                            setPasteModalTarget("photo");
                          }}
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          <Link2 className="h-3 w-3" />
                          <span>Paste URL</span>
                        </button>
                        {photoUrl && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <button
                              type="button"
                              onClick={handleRemovePhoto}
                              className="text-muted-foreground underline underline-offset-2 hover:text-destructive"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 pb-1">
                      <p className="truncate font-display text-lg font-semibold sm:text-xl text-foreground">
                        {liveValues.display_name || "Your name"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {liveValues.professional_title || "Professional title"}
                      </p>
                      {location && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {location}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pb-1">
                    <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                    {publicPortfolioSlug && (
                      <Link
                        to="/portfolio/$slug"
                        params={{ slug: publicPortfolioSlug }}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-secondary/60"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        View public portfolio
                      </Link>
                    )}
                  </div>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  {IMAGE_GUIDELINES.profile} · {UPLOAD_HINT}
                </p>

                <PortfolioReadinessPanel
                  readiness={liveReadiness}
                  isPreview={hasUnsavedProfileChanges}
                />
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Main column */}
              <div className="space-y-6 lg:col-span-2">
                <SectionCard
                  icon={UserIcon}
                  title="Basic information"
                  description="Name and the story clients read first."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="display_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Full name
                            <RequiredMark />
                          </FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="business_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business name (optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Dharti Panchal Makeovers" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="short_tagline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Short headline</FormLabel>
                        <FormControl>
                          <Input placeholder="Bridal Makeup Artist in Ahmedabad" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>About / bio</FormLabel>
                        <FormControl>
                          <Textarea rows={4} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bio_secondary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional bio detail (optional)</FormLabel>
                        <FormControl>
                          <Textarea rows={3} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SectionCard>

                <SectionCard
                  icon={Phone}
                  title="Contact information"
                  description="How clients and BeautyFolio reach this professional."
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="whatsapp_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WhatsApp number</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  icon={MapPin}
                  title="Location"
                  description="Where this professional is based and how they serve clients."
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="primary_city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="locality"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Locality</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Studio address</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="map_query"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Map embed (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://www.google.com/maps/embed?pb=…" {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          In Google Maps: search the exact location → Share → Embed a map → copy the
                          src URL from the code and paste it here for a precise pin. Leave blank to
                          show a map based on city/locality instead.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="working_hours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Working hours</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="travel_note"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Travel note</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  icon={Briefcase}
                  title="Professional information"
                  description="Experience and what makes this professional the right choice."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="professional_title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Professional title</FormLabel>
                          <FormControl>
                            <Input placeholder="Bridal Makeup Artist" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="years_experience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Years of experience</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} placeholder="8" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Specializations are managed separately and aren't part of this page yet.
                  </p>
                  <FormField
                    control={form.control}
                    name="about_highlights"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Highlights (one per line)</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder={
                              "Certified in HD & airbrush artistry\nSensitive-skin friendly kit"
                            }
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="why_choose_points"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Why clients choose them (one per line)</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder={
                              "8+ years of professional experience\nPremium products only"
                            }
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SectionCard>

                <SectionCard
                  icon={Share2}
                  title="Social & online presence"
                  description="Linked from the public portfolio."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="instagram_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instagram (optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://instagram.com/…" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="facebook_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Facebook (optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://facebook.com/…" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="youtube_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>YouTube (optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://youtube.com/…" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="website_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website (optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://…" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </SectionCard>
              </div>

              {/* Side column */}
              <div className="space-y-6">
                <SectionCard
                  icon={Eye}
                  title="Visibility"
                  description="Control whether clients can find this profile."
                >
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Profile status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">Draft (private)</SelectItem>
                            <SelectItem value="published">Published (public)</SelectItem>
                            <SelectItem value="unpublished">Unpublished (hidden)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{STATUS_LABEL[field.value]}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {publicPortfolioSlug && (
                    <Link
                      to="/portfolio/$slug"
                      params={{ slug: publicPortfolioSlug }}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-primary hover:underline",
                      )}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      View public portfolio
                    </Link>
                  )}
                </SectionCard>
              </div>
            </div>

            {/* Mobile floating save bar — ensures mobile users can easily save changes */}
            {hasUnsavedProfileChanges && (
              <div className="fixed bottom-4 left-4 right-4 z-40 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-background/95 p-3 shadow-xl backdrop-blur-md sm:hidden">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <p className="truncate text-xs font-medium text-foreground">
                    Unsaved photo / profile edits
                  </p>
                </div>
                <Button type="submit" size="sm" variant="hero" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            )}
          </form>
        </Form>
      )}

      {/* Paste Image URL Modal Dialog */}
      <Dialog
        open={pasteModalTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPasteModalTarget(null);
            setPastedUrlInput("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pasteModalTarget === "photo" ? "Paste Profile Photo URL" : "Paste Cover Photo URL"}
            </DialogTitle>
            <DialogDescription>
              Enter or paste a direct image URL (JPEG, PNG, WebP). The image will be safely downloaded and stored in your profile.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Input
                placeholder="https://example.com/image.jpg"
                value={pastedUrlInput}
                onChange={(e) => setPastedUrlInput(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Tip: You can also copy any image to your clipboard and press Ctrl+V anywhere on the page!
              </p>
            </div>

            {pastedUrlInput.trim() && (
              <div className="relative overflow-hidden rounded-lg border border-border bg-secondary/20 p-2">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Preview:</p>
                <img
                  src={pastedUrlInput.trim()}
                  alt="Preview"
                  className={cn(
                    "max-h-40 w-full object-cover rounded",
                    pasteModalTarget === "photo" && "mx-auto h-24 w-24 rounded-full aspect-square",
                  )}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                  onLoad={(e) => {
                    (e.target as HTMLElement).style.display = "block";
                  }}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPasteModalTarget(null)}
                disabled={processingUrl}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="hero"
                onClick={handleUrlSubmit}
                disabled={processingUrl || !pastedUrlInput.trim()}
              >
                {processingUrl ? "Downloading & Uploading…" : "Apply & Upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

