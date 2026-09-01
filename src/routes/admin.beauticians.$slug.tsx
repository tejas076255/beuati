import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ServicesManager } from "@/components/services/services-manager";
import { ProfileManager } from "@/components/profile/profile-manager";
import { GalleryManager } from "@/components/gallery/gallery-manager";
import { BeforeAfterManager } from "@/components/before-after/before-after-manager";
import { VideoManager } from "@/components/videos/video-manager";
import { PackageManager } from "@/components/packages/package-manager";
import { FaqManager } from "@/components/faqs/faq-manager";
import type { ServiceInput, ServiceReadinessContext } from "@/data/dashboard/services.server";
import type { AdminTargetProfile } from "@/data/admin/services.server";
import type { OwnProfileUpdate } from "@/data/dashboard/profile.server";
import type {
  GalleryItemInput,
  NewGalleryImage,
  PortfolioItemUpdate,
  PortfolioItemWithImages,
} from "@/data/dashboard/gallery.server";
import type {
  BeforeAfterItemUpdate,
  BeforeAfterItemWithImages,
  BeforeAfterPairInput,
} from "@/data/dashboard/before-after.server";
import type { VideoInput } from "@/data/dashboard/videos.server";
import type { PackageInput } from "@/data/dashboard/packages.server";
import type { FaqInput } from "@/data/dashboard/faqs.server";

export const Route = createFileRoute("/admin/beauticians/$slug")({
  component: AdminBeauticianWorkspace,
});

const resolveTargetProfileFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((slug: string) => slug)
  .handler(async ({ context, data: slug }) => {
    const { resolveAdminTargetProfile } = await import("@/data/admin/services.server");
    try {
      return await resolveAdminTargetProfile(context.supabase, context.userId, slug);
    } catch {
      // Never distinguish "admin access denied" from "slug not found" to an
      // unauthorized caller — both surface as a plain 404 here. A genuinely
      // authorized admin hitting a real error will still see the message
      // via the query's own error state on the profiles list page; this
      // route only needs to decide "show the workspace or not."
      return null;
    }
  });

const listServicesAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listServicesAdmin } = await import("@/data/admin/services.server");
    return listServicesAdmin(context.supabase, context.userId, targetProfileId);
  });

const createServiceAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; input: ServiceInput }) => data)
  .handler(async ({ context, data }) => {
    const { createServiceAdmin } = await import("@/data/admin/services.server");
    await createServiceAdmin(context.supabase, context.userId, data.targetProfileId, data.input);
  });

const updateServiceAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { targetProfileId: string; serviceId: string; updates: Partial<ServiceInput> }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updateServiceAdmin } = await import("@/data/admin/services.server");
    await updateServiceAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.serviceId,
      data.updates,
    );
  });

const deleteServiceAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; serviceId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteServiceAdmin } = await import("@/data/admin/services.server");
    await deleteServiceAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.serviceId,
    );
  });

const getProfileAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { getProfileAdmin } = await import("@/data/admin/profile.server");
    return getProfileAdmin(context.supabase, context.userId, targetProfileId);
  });

const getProfileReadinessContextAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { getProfileReadinessContextAdmin } = await import("@/data/admin/profile.server");
    return getProfileReadinessContextAdmin(context.supabase, context.userId, targetProfileId);
  });

const updateProfileAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; updates: OwnProfileUpdate }) => data)
  .handler(async ({ context, data }) => {
    const { updateProfileAdmin } = await import("@/data/admin/profile.server");
    await updateProfileAdmin(context.supabase, context.userId, data.targetProfileId, data.updates);
  });

const listGalleryAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listGalleryAdmin } = await import("@/data/admin/gallery.server");
    return listGalleryAdmin(context.supabase, context.userId, targetProfileId);
  });

const createGalleryItemAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; input: GalleryItemInput }) => data)
  .handler(async ({ context, data }) => {
    const { createGalleryItemAdmin } = await import("@/data/admin/gallery.server");
    await createGalleryItemAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.input,
    );
  });

const updateGalleryItemAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { targetProfileId: string; itemId: string; updates: PortfolioItemUpdate }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updateGalleryItemAdmin } = await import("@/data/admin/gallery.server");
    await updateGalleryItemAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.itemId,
      data.updates,
    );
  });

const addGalleryImagesAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; itemId: string; images: NewGalleryImage[] }) => data)
  .handler(async ({ context, data }) => {
    const { addGalleryImagesAdmin } = await import("@/data/admin/gallery.server");
    await addGalleryImagesAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.itemId,
      data.images,
    );
  });

const updateGalleryImageAltAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; imageId: string; altText: string }) => data)
  .handler(async ({ context, data }) => {
    const { updateGalleryImageAltAdmin } = await import("@/data/admin/gallery.server");
    await updateGalleryImageAltAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.imageId,
      data.altText,
    );
  });

const deleteGalleryImageAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; imageId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteGalleryImageAdmin } = await import("@/data/admin/gallery.server");
    return deleteGalleryImageAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.imageId,
    );
  });

const deleteGalleryItemAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; itemId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteGalleryItemAdmin } = await import("@/data/admin/gallery.server");
    return deleteGalleryItemAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.itemId,
    );
  });

const listBeforeAfterAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listBeforeAfterAdmin } = await import("@/data/admin/before-after.server");
    return listBeforeAfterAdmin(context.supabase, context.userId, targetProfileId);
  });

const createBeforeAfterPairAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; input: BeforeAfterPairInput }) => data)
  .handler(async ({ context, data }) => {
    const { createBeforeAfterPairAdmin } = await import("@/data/admin/before-after.server");
    await createBeforeAfterPairAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.input,
    );
  });

const updateBeforeAfterItemAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { targetProfileId: string; itemId: string; updates: BeforeAfterItemUpdate }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updateBeforeAfterItemAdmin } = await import("@/data/admin/before-after.server");
    await updateBeforeAfterItemAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.itemId,
      data.updates,
    );
  });

const replaceBeforeAfterImageAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; imageId: string; storagePath: string }) => data)
  .handler(async ({ context, data }) => {
    const { replaceBeforeAfterImageAdmin } = await import("@/data/admin/before-after.server");
    return replaceBeforeAfterImageAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.imageId,
      data.storagePath,
    );
  });

const updateBeforeAfterImageAltAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; imageId: string; altText: string }) => data)
  .handler(async ({ context, data }) => {
    const { updateBeforeAfterImageAltAdmin } = await import("@/data/admin/before-after.server");
    await updateBeforeAfterImageAltAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.imageId,
      data.altText,
    );
  });

const deleteBeforeAfterItemAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; itemId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteBeforeAfterItemAdmin } = await import("@/data/admin/before-after.server");
    return deleteBeforeAfterItemAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.itemId,
    );
  });

const listVideosAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listVideosAdmin } = await import("@/data/admin/videos.server");
    return listVideosAdmin(context.supabase, context.userId, targetProfileId);
  });

const createVideoAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; input: VideoInput }) => data)
  .handler(async ({ context, data }) => {
    const { createVideoAdmin } = await import("@/data/admin/videos.server");
    await createVideoAdmin(context.supabase, context.userId, data.targetProfileId, data.input);
  });

const updateVideoAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { targetProfileId: string; videoId: string; updates: Partial<VideoInput> }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updateVideoAdmin } = await import("@/data/admin/videos.server");
    await updateVideoAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.videoId,
      data.updates,
    );
  });

const deleteVideoAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; videoId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteVideoAdmin } = await import("@/data/admin/videos.server");
    return deleteVideoAdmin(context.supabase, context.userId, data.targetProfileId, data.videoId);
  });

const listPackagesAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listPackagesAdmin } = await import("@/data/admin/packages.server");
    return listPackagesAdmin(context.supabase, context.userId, targetProfileId);
  });

const createPackageAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; input: PackageInput }) => data)
  .handler(async ({ context, data }) => {
    const { createPackageAdmin } = await import("@/data/admin/packages.server");
    await createPackageAdmin(context.supabase, context.userId, data.targetProfileId, data.input);
  });

const updatePackageAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { targetProfileId: string; packageId: string; updates: Partial<PackageInput> }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updatePackageAdmin } = await import("@/data/admin/packages.server");
    await updatePackageAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.packageId,
      data.updates,
    );
  });

const deletePackageAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; packageId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deletePackageAdmin } = await import("@/data/admin/packages.server");
    await deletePackageAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.packageId,
    );
  });

const listFaqsAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listFaqsAdmin } = await import("@/data/admin/faqs.server");
    return listFaqsAdmin(context.supabase, context.userId, targetProfileId);
  });

const createFaqAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; input: FaqInput }) => data)
  .handler(async ({ context, data }) => {
    const { createFaqAdmin } = await import("@/data/admin/faqs.server");
    await createFaqAdmin(context.supabase, context.userId, data.targetProfileId, data.input);
  });

const updateFaqAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; faqId: string; updates: Partial<FaqInput> }) => data)
  .handler(async ({ context, data }) => {
    const { updateFaqAdmin } = await import("@/data/admin/faqs.server");
    await updateFaqAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.faqId,
      data.updates,
    );
  });

const deleteFaqAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; faqId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteFaqAdmin } = await import("@/data/admin/faqs.server");
    await deleteFaqAdmin(context.supabase, context.userId, data.targetProfileId, data.faqId);
  });

type TabId =
  "overview" | "profile" | "services" | "gallery" | "before-after" | "videos" | "packages" | "faqs";

// Phase 5.2A §6 / Phase 5.2B / Phase 5.2C / Phase 5.2D / Phase 5.2E / Phase
// 5.2F / Phase 5.2G — the full future workspace nav; "services" (5.2A),
// "profile" (5.2B), "gallery" (5.2C), "before-after" (5.2D), "videos"
// (5.2E), "packages" (5.2F), and "faqs" (5.2G) are wired to real
// implementations. Every other section is visibly present (so the
// eventual shape is clear) but explicitly marked unavailable rather than
// rendering a fake/empty screen.
const TABS: { id: TabId | string; label: string; enabled: boolean }[] = [
  { id: "overview", label: "Overview", enabled: true },
  { id: "profile", label: "Profile", enabled: true },
  { id: "services", label: "Services", enabled: true },
  { id: "gallery", label: "Gallery", enabled: true },
  { id: "before-after", label: "Before & After", enabled: true },
  { id: "videos", label: "Videos", enabled: true },
  { id: "packages", label: "Packages", enabled: true },
  { id: "faqs", label: "FAQs", enabled: true },
  { id: "portfolio", label: "Portfolio", enabled: false },
  { id: "media", label: "Media", enabled: false },
  { id: "reviews", label: "Reviews", enabled: false },
  { id: "leads", label: "Leads", enabled: false },
  { id: "readiness", label: "Readiness", enabled: false },
  { id: "verification", label: "Verification", enabled: false },
  { id: "activity", label: "Activity", enabled: false },
];

function statusBadgeVariant(status: string) {
  switch (status) {
    case "published":
      return "default" as const;
    case "suspended":
      return "destructive" as const;
    case "unpublished":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function TargetProfileHeader({ profile }: { profile: AdminTargetProfile }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex min-w-0 items-center gap-4">
        {profile.profile_image_url ? (
          <img
            src={profile.profile_image_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-semibold text-muted-foreground">
            {profile.display_name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-display text-xl font-semibold">
              {profile.business_name || profile.display_name}
            </p>
            {profile.is_verified && (
              <span title="Verified">
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {profile.professional_title || "—"}
            {profile.primary_city ? ` · ${profile.primary_city}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(profile.status)}>{profile.status}</Badge>
            <Badge variant={profile.is_verified ? "default" : "outline"}>
              {profile.is_verified ? "Verified" : "Unverified"}
            </Badge>
          </div>
        </div>
      </div>
      <a
        href={`/portfolio/${profile.slug}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        View public portfolio
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

function AdminBeauticianWorkspace() {
  const { slug } = Route.useParams();
  const [activeTab, setActiveTab] = useState<TabId | string>("overview");
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["admin-target-profile", slug],
    queryFn: () => resolveTargetProfileFn({ data: slug }),
  });

  const targetProfileId = profileQuery.data?.id;
  const servicesQueryKey = ["admin-services", targetProfileId];

  const servicesQuery = useQuery({
    queryKey: servicesQueryKey,
    queryFn: () => listServicesAdminFn({ data: targetProfileId! }),
    // Also enabled for "gallery"/"before-after" — their "Related service"
    // dropdowns reuse this same admin services list, same as the
    // beautician's own Gallery/Before & After pages reuse their own
    // services query.
    enabled:
      !!targetProfileId &&
      (activeTab === "services" || activeTab === "gallery" || activeTab === "before-after"),
  });

  const createMutation = useMutation({
    mutationFn: (input: ServiceInput) =>
      createServiceAdminFn({ data: { targetProfileId: targetProfileId!, input } }),
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; updates: Partial<ServiceInput> }) =>
      updateServiceAdminFn({
        data: { targetProfileId: targetProfileId!, serviceId: vars.id, updates: vars.updates },
      }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteServiceAdminFn({ data: { targetProfileId: targetProfileId!, serviceId: id } }),
  });

  const profileQueryKey = ["admin-profile-full", targetProfileId];
  const adminProfileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: () => getProfileAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "profile",
  });
  const profileReadinessQuery = useQuery({
    queryKey: ["admin-profile-readiness", targetProfileId],
    queryFn: () => getProfileReadinessContextAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "profile",
  });
  const updateProfileMutation = useMutation({
    mutationFn: (updates: OwnProfileUpdate) =>
      updateProfileAdminFn({ data: { targetProfileId: targetProfileId!, updates } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileQueryKey });
      queryClient.invalidateQueries({ queryKey: ["admin-target-profile", slug] });
    },
  });

  const galleryQueryKey = ["admin-gallery", targetProfileId];
  const galleryQuery = useQuery({
    queryKey: galleryQueryKey,
    queryFn: () => listGalleryAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "gallery",
  });
  const onGallerySaved = () => queryClient.invalidateQueries({ queryKey: galleryQueryKey });

  const beforeAfterQueryKey = ["admin-before-after", targetProfileId];
  const beforeAfterQuery = useQuery({
    queryKey: beforeAfterQueryKey,
    queryFn: () => listBeforeAfterAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "before-after",
  });
  const onBeforeAfterSaved = () => queryClient.invalidateQueries({ queryKey: beforeAfterQueryKey });

  const createBeforeAfterMutation = useMutation({
    mutationFn: (input: BeforeAfterPairInput) =>
      createBeforeAfterPairAdminFn({ data: { targetProfileId: targetProfileId!, input } }),
  });
  const updateBeforeAfterItemMutation = useMutation({
    mutationFn: (vars: { id: string; updates: BeforeAfterItemUpdate }) =>
      updateBeforeAfterItemAdminFn({
        data: { targetProfileId: targetProfileId!, itemId: vars.id, updates: vars.updates },
      }),
  });
  const replaceBeforeAfterImageMutation = useMutation({
    mutationFn: (vars: { imageId: string; storagePath: string }) =>
      replaceBeforeAfterImageAdminFn({
        data: {
          targetProfileId: targetProfileId!,
          imageId: vars.imageId,
          storagePath: vars.storagePath,
        },
      }),
  });
  const updateBeforeAfterImageAltMutation = useMutation({
    mutationFn: (vars: { id: string; altText: string }) =>
      updateBeforeAfterImageAltAdminFn({
        data: { targetProfileId: targetProfileId!, imageId: vars.id, altText: vars.altText },
      }),
  });
  const deleteBeforeAfterItemMutation = useMutation({
    mutationFn: (item: BeforeAfterItemWithImages) =>
      deleteBeforeAfterItemAdminFn({
        data: { targetProfileId: targetProfileId!, itemId: item.id },
      }),
  });

  const videosQueryKey = ["admin-videos", targetProfileId];
  const videosQuery = useQuery({
    queryKey: videosQueryKey,
    queryFn: () => listVideosAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "videos",
  });
  const onVideosSaved = () => queryClient.invalidateQueries({ queryKey: videosQueryKey });

  const createVideoMutation = useMutation({
    mutationFn: (input: VideoInput) =>
      createVideoAdminFn({ data: { targetProfileId: targetProfileId!, input } }),
  });
  const updateVideoMutation = useMutation({
    mutationFn: (vars: { id: string; updates: Partial<VideoInput> }) =>
      updateVideoAdminFn({
        data: { targetProfileId: targetProfileId!, videoId: vars.id, updates: vars.updates },
      }),
  });
  const deleteVideoMutation = useMutation({
    mutationFn: (id: string) =>
      deleteVideoAdminFn({ data: { targetProfileId: targetProfileId!, videoId: id } }),
  });

  const packagesQueryKey = ["admin-packages", targetProfileId];
  const packagesQuery = useQuery({
    queryKey: packagesQueryKey,
    queryFn: () => listPackagesAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "packages",
  });
  const onPackagesSaved = () => queryClient.invalidateQueries({ queryKey: packagesQueryKey });

  const createPackageMutation = useMutation({
    mutationFn: (input: PackageInput) =>
      createPackageAdminFn({ data: { targetProfileId: targetProfileId!, input } }),
  });
  const updatePackageMutation = useMutation({
    mutationFn: (vars: { id: string; updates: Partial<PackageInput> }) =>
      updatePackageAdminFn({
        data: { targetProfileId: targetProfileId!, packageId: vars.id, updates: vars.updates },
      }),
  });
  const deletePackageMutation = useMutation({
    mutationFn: (id: string) =>
      deletePackageAdminFn({ data: { targetProfileId: targetProfileId!, packageId: id } }),
  });

  const faqsQueryKey = ["admin-faqs", targetProfileId];
  const faqsQuery = useQuery({
    queryKey: faqsQueryKey,
    queryFn: () => listFaqsAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "faqs",
  });
  const onFaqsSaved = () => queryClient.invalidateQueries({ queryKey: faqsQueryKey });

  const createFaqMutation = useMutation({
    mutationFn: (input: FaqInput) =>
      createFaqAdminFn({ data: { targetProfileId: targetProfileId!, input } }),
  });
  const updateFaqMutation = useMutation({
    mutationFn: (vars: { id: string; updates: Partial<FaqInput> }) =>
      updateFaqAdminFn({
        data: { targetProfileId: targetProfileId!, faqId: vars.id, updates: vars.updates },
      }),
  });
  const deleteFaqMutation = useMutation({
    mutationFn: (id: string) =>
      deleteFaqAdminFn({ data: { targetProfileId: targetProfileId!, faqId: id } }),
  });

  const createGalleryItemMutation = useMutation({
    mutationFn: (input: GalleryItemInput) =>
      createGalleryItemAdminFn({ data: { targetProfileId: targetProfileId!, input } }),
  });
  const updateGalleryItemMutation = useMutation({
    mutationFn: (vars: { id: string; updates: PortfolioItemUpdate }) =>
      updateGalleryItemAdminFn({
        data: { targetProfileId: targetProfileId!, itemId: vars.id, updates: vars.updates },
      }),
  });
  const addGalleryImagesMutation = useMutation({
    mutationFn: (vars: { itemId: string; images: NewGalleryImage[] }) =>
      addGalleryImagesAdminFn({
        data: { targetProfileId: targetProfileId!, itemId: vars.itemId, images: vars.images },
      }),
  });
  const deleteGalleryImageMutation = useMutation({
    mutationFn: (id: string) =>
      deleteGalleryImageAdminFn({ data: { targetProfileId: targetProfileId!, imageId: id } }),
  });
  const updateGalleryImageAltMutation = useMutation({
    mutationFn: (vars: { id: string; altText: string }) =>
      updateGalleryImageAltAdminFn({
        data: { targetProfileId: targetProfileId!, imageId: vars.id, altText: vars.altText },
      }),
  });
  const deleteGalleryItemMutation = useMutation({
    mutationFn: (item: PortfolioItemWithImages) =>
      deleteGalleryItemAdminFn({ data: { targetProfileId: targetProfileId!, itemId: item.id } }),
  });

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    throw notFound();
  }

  const profile = profileQuery.data;
  const services = servicesQuery.data?.services ?? [];
  const readinessContext: ServiceReadinessContext = servicesQuery.data?.readinessContext ?? {
    profileIsPublished: profile.status === "published",
    profileRobotsIndex: true,
    primaryCity: profile.primary_city,
    publishedReviewCount: 0,
    serviceAreaCount: 0,
  };
  const onServicesSaved = () => queryClient.invalidateQueries({ queryKey: servicesQueryKey });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/profiles" className="text-xs text-muted-foreground hover:text-foreground">
          ← Back to Professionals
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold">Manage professional</h1>
      </div>

      <TargetProfileHeader profile={profile} />

      <div className="border-b border-border">
        <nav className="-mb-px flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              disabled={!tab.enabled}
              onClick={() => tab.enabled && setActiveTab(tab.id)}
              className={cn(
                "rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                !tab.enabled && "cursor-not-allowed text-muted-foreground/50",
                tab.enabled && activeTab === tab.id
                  ? "border-primary text-foreground"
                  : tab.enabled
                    ? "border-transparent text-muted-foreground hover:text-foreground"
                    : "border-transparent",
              )}
              title={tab.enabled ? undefined : "Not available yet"}
            >
              {tab.label}
              {!tab.enabled && (
                <span className="ml-1.5 text-[10px] text-muted-foreground/60">soon</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "overview" && (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-soft">
          Overview details beyond what's shown in the header above will be added in a future phase.
        </div>
      )}

      {activeTab === "profile" && targetProfileId && (
        <ProfileManager
          title="Profile"
          subtitle={`Managing ${profile.display_name}'s professional identity and public information.`}
          profile={adminProfileQuery.data}
          readinessContext={profileReadinessQuery.data}
          isLoading={adminProfileQuery.isLoading}
          uploadSlug={profile.slug}
          publicPortfolioSlug={profile.slug}
          onSave={(updates) => updateProfileMutation.mutateAsync(updates)}
        />
      )}

      {activeTab === "services" && targetProfileId && (
        <ServicesManager
          title="Services"
          subtitle={`Managing ${profile.display_name}'s priced offerings.`}
          services={services}
          readinessContext={readinessContext}
          isLoading={servicesQuery.isLoading}
          onCreate={(input) => createMutation.mutateAsync(input)}
          onUpdate={(id, updates) => updateMutation.mutateAsync({ id, updates })}
          onDelete={(id) => deleteMutation.mutateAsync(id)}
          onSaved={onServicesSaved}
        />
      )}

      {activeTab === "gallery" && targetProfileId && (
        <GalleryManager
          title="Gallery"
          subtitle={`Managing ${profile.display_name}'s portfolio images.`}
          items={galleryQuery.data ?? []}
          services={services.map((s) => s.service)}
          isLoading={galleryQuery.isLoading}
          uploadSlug={profile.slug}
          onCreate={(input) => createGalleryItemMutation.mutateAsync(input)}
          onUpdateItem={(id, updates) => updateGalleryItemMutation.mutateAsync({ id, updates })}
          onAddImages={(itemId, images) => addGalleryImagesMutation.mutateAsync({ itemId, images })}
          onDeleteImage={(id) => deleteGalleryImageMutation.mutateAsync(id)}
          onUpdateImageAlt={(id, altText) =>
            updateGalleryImageAltMutation.mutateAsync({ id, altText })
          }
          onDeleteItem={(item) => deleteGalleryItemMutation.mutateAsync(item)}
          onSaved={onGallerySaved}
        />
      )}

      {activeTab === "before-after" && targetProfileId && (
        <BeforeAfterManager
          title="Before & After"
          subtitle={`Managing ${profile.display_name}'s transformation results.`}
          items={beforeAfterQuery.data ?? []}
          services={services.map((s) => s.service)}
          isLoading={beforeAfterQuery.isLoading}
          uploadSlug={profile.slug}
          onCreate={(input) => createBeforeAfterMutation.mutateAsync(input)}
          onUpdateItem={(id, updates) => updateBeforeAfterItemMutation.mutateAsync({ id, updates })}
          onReplaceImage={(imageId, storagePath) =>
            replaceBeforeAfterImageMutation.mutateAsync({ imageId, storagePath })
          }
          onUpdateImageAlt={(id, altText) =>
            updateBeforeAfterImageAltMutation.mutateAsync({ id, altText })
          }
          onDeleteItem={(item) => deleteBeforeAfterItemMutation.mutateAsync(item)}
          onSaved={onBeforeAfterSaved}
        />
      )}

      {activeTab === "videos" && targetProfileId && (
        <VideoManager
          title="Videos"
          subtitle={`Managing ${profile.display_name}'s portfolio videos.`}
          videos={videosQuery.data ?? []}
          isLoading={videosQuery.isLoading}
          uploadSlug={profile.slug}
          onCreate={(input) => createVideoMutation.mutateAsync(input)}
          onUpdate={(id, updates) => updateVideoMutation.mutateAsync({ id, updates })}
          onDelete={(id) => deleteVideoMutation.mutateAsync(id)}
          onSaved={onVideosSaved}
        />
      )}

      {activeTab === "packages" && targetProfileId && (
        <PackageManager
          title="Packages"
          subtitle={`Managing ${profile.display_name}'s bundled offerings.`}
          packages={packagesQuery.data ?? []}
          isLoading={packagesQuery.isLoading}
          onCreate={(input) => createPackageMutation.mutateAsync(input)}
          onUpdate={(id, updates) => updatePackageMutation.mutateAsync({ id, updates })}
          onDelete={(id) => deletePackageMutation.mutateAsync(id)}
          onSaved={onPackagesSaved}
        />
      )}

      {activeTab === "faqs" && targetProfileId && (
        <FaqManager
          title="FAQs"
          subtitle={`Managing ${profile.display_name}'s portfolio questions.`}
          faqs={faqsQuery.data ?? []}
          isLoading={faqsQuery.isLoading}
          onCreate={(input) => createFaqMutation.mutateAsync(input)}
          onUpdate={(id, updates) => updateFaqMutation.mutateAsync({ id, updates })}
          onDelete={(id) => deleteFaqMutation.mutateAsync(id)}
          onSaved={onFaqsSaved}
        />
      )}
    </div>
  );
}
