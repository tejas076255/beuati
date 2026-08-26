import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import {
  Briefcase,
  Camera,
  Eye,
  ExternalLink,
  MapPin,
  Phone,
  Share2,
  User as UserIcon,
} from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  uploadPortfolioMedia,
  buildPublicMediaUrl,
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
import type { OwnProfileUpdate } from "@/data/dashboard/profile.server";

export const Route = createFileRoute("/dashboard/profile")({
  component: ProfileEditor,
});

const getProfileFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnProfile } = await import("@/data/dashboard/profile.server");
    return getOwnProfile(context.supabase, context.userId);
  });

// Phase 3F.9 §19/§20 — the "external" readiness signals (services, gallery,
// reviews, etc.) this page doesn't itself edit. A dedicated key so it can
// never collide with any other route's differently-shaped query (Phase
// 3F.8A.1 §27).
const getReadinessContextFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnPortfolioReadinessContext } = await import("@/data/dashboard/profile.server");
    return getOwnPortfolioReadinessContext(context.supabase, context.userId);
  });

const updateProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: OwnProfileUpdate) => data)
  .handler(async ({ context, data }) => {
    const { updateOwnProfile } = await import("@/data/dashboard/profile.server");
    await updateOwnProfile(context.supabase, context.userId, data);
  });

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

/** Compact "PORTFOLIO READINESS" panel (Phase 3F.9 §19/§20) — replaces the
 * old purely-presentational completeness percentage with the one
 * authoritative deterministic readiness model, computed live from unsaved
 * draft form state. Required and Recommended are always visually
 * separated so an optional item never looks mandatory. */
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
          Preview based on unsaved changes — save to apply these to your public portfolio.
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

function ProfileEditor() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["own-profile"], queryFn: () => getProfileFn() });
  const readinessContextQuery = useQuery({
    queryKey: ["own-portfolio-readiness-context"],
    queryFn: () => getReadinessContextFn(),
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    setPhotoUrl(profileQuery.data.profile_image_url);
    setCoverUrl(profileQuery.data.cover_image_url);
    const p = profileQuery.data;
    form.reset({
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
    });
    // Only render the form (and mount the Visibility Select) once reset has
    // actually applied the real values — mounting it one render earlier,
    // while the form still holds EMPTY_VALUES, leaves the Radix Select's
    // own displayed-value state stuck even after react-hook-form's value
    // updates underneath it.
    setFormReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data]);

  // Best-effort protection against losing unsaved edits on an accidental tab
  // close/refresh — uses react-hook-form's own dirty tracking, no new state.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form.formState.isDirty]);

  const save = useMutation({
    mutationFn: (values: ProfileFormValues) => {
      const years = values.years_experience.trim() ? Number(values.years_experience) : null;
      return updateProfileFn({
        data: {
          ...values,
          years_experience: years != null && Number.isFinite(years) ? years : null,
          map_query: extractMapEmbedUrl(values.map_query),
          profile_image_url: photoUrl,
          cover_image_url: coverUrl,
          about_highlights: toLineArray(values.about_highlights),
          why_choose_points: toLineArray(values.why_choose_points),
        } as OwnProfileUpdate,
      });
    },
    onSuccess: (_, values) => {
      toast.success("Profile saved");
      form.reset(values);
      queryClient.invalidateQueries({ queryKey: ["own-profile"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save profile"),
  });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profileQuery.data) return;
    setUploadingPhoto(true);
    try {
      const path = await uploadPortfolioMedia(profileQuery.data.slug, "profile", file);
      setPhotoUrl(buildPublicMediaUrl(path));
      toast.success("Photo uploaded — click Save changes to apply");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // Phase 3F.9A — clears only the draft `photoUrl` state, exactly like a
  // fresh upload does; nothing is persisted or deleted from Storage until
  // "Save changes" is clicked (§4/§5). The existing object in the bucket is
  // deliberately left alone — see profile.server.ts's OwnProfileUpdate doc
  // comment for the storage-deletion decision.
  const handleRemovePhoto = () => {
    if (
      !window.confirm(
        "Remove profile photo?\n\nYour portfolio will continue to work, but your profile photo will no longer appear publicly.",
      )
    ) {
      return;
    }
    setPhotoUrl(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profileQuery.data) return;
    setUploadingCover(true);
    try {
      const path = await uploadPortfolioMedia(profileQuery.data.slug, "profile", file);
      setCoverUrl(buildPublicMediaUrl(path));
      toast.success("Cover photo uploaded — click Save changes to apply");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload cover photo");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const liveValues = form.watch();
  const slug = profileQuery.data?.slug;
  const statusBadge = STATUS_BADGE[liveValues.status];
  const location = [liveValues.locality, liveValues.primary_city].filter(Boolean).join(", ");

  // Phase 3F.9 §20 — live draft readiness preview. Reuses the exact same
  // evaluatePortfolioContentReadiness() the server uses for the saved
  // state (SEO dashboard, robots, sitemap), fed the current draft form
  // values instead. Purely local — never written back, never affects the
  // public page/robots/sitemap by itself (§2).
  const readinessContext = readinessContextQuery.data;
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
        isVerified: profileQuery.data?.is_verified ?? false,
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
    form.formState.isDirty || photoUrl !== (profileQuery.data?.profile_image_url ?? null);

  return (
    <div className="mx-auto max-w-5xl">
      {profileQuery.isError ? (
        <p className="text-sm text-destructive">
          {(profileQuery.error as Error).message || "Failed to load profile."}
        </p>
      ) : !formReady ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))}>
            {/* Page header — sticky so Save stays reachable while scrolling a long form,
                including on mobile. */}
            <div className="sticky top-16 z-10 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <div>
                <h1 className="font-display text-2xl font-semibold">Profile</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage your professional identity and the information customers see on your
                  BeautyFolio profile.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {form.formState.isDirty && (
                  <span className="text-xs text-muted-foreground">Unsaved changes</span>
                )}
                <Button type="submit" variant="hero" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>

            {/* Profile identity card — editorial hero card that doubles as a
                live preview of how the identity reads, and is deliberately
                visually distinct from the platform's own BeautyFolio mark in
                the sidebar so the two are never mistaken for each other. */}
            <Card className="mb-6 overflow-hidden border-border/70 shadow-sm">
              <div className="bg-gradient-brand relative h-28 sm:h-36">
                {coverUrl && (
                  <img
                    src={coverUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <label
                  htmlFor="cover-photo-input"
                  className="absolute right-3 top-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/55"
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  {coverUrl ? "Change cover" : "Add cover photo"}
                </label>
                <input
                  id="cover-photo-input"
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverChange}
                  disabled={uploadingCover}
                  className="sr-only"
                />
                {uploadingCover && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
                    Uploading…
                  </span>
                )}
              </div>

              <CardContent className="pt-0">
                <div className="-mt-10 flex flex-wrap items-end justify-between gap-4 sm:-mt-12">
                  <div className="flex items-end gap-4">
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <div className="relative">
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
                          aria-label="Change profile photo"
                          className="absolute -right-1 -bottom-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                        >
                          <Camera className="h-4 w-4" aria-hidden="true" />
                        </label>
                        <input
                          id="profile-photo-input"
                          ref={photoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handlePhotoChange}
                          disabled={uploadingPhoto}
                          className="sr-only"
                        />
                        {uploadingPhoto && (
                          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[9px] text-white">
                            Uploading…
                          </span>
                        )}
                      </div>
                      {photoUrl && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-destructive"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                    <div className="min-w-0 pb-1">
                      <p className="truncate font-display text-lg font-semibold sm:text-xl">
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
                    {slug && (
                      <Link
                        to="/portfolio/$slug"
                        params={{ slug }}
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
                  description="Your name and the story clients read first."
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
                  description="How clients and BeautyFolio reach you."
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
                  description="Where you're based and how you serve clients."
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
                          In Google Maps: search your exact location → Share → Embed a map → copy
                          the src URL from the code and paste it here for a precise pin. Leave blank
                          to show a map based on your city/locality instead.
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
                  description="Experience and what makes you the right choice."
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
                        <FormLabel>Why clients choose you (one per line)</FormLabel>
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
                  description="Linked from your public portfolio."
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
                  description="Control whether clients can find your profile."
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
                  {slug && (
                    <Link
                      to="/portfolio/$slug"
                      params={{ slug }}
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
          </form>
        </Form>
      )}
    </div>
  );
}
