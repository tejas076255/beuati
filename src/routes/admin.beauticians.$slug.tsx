import { useMemo, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { ReviewsManager } from "@/components/reviews/reviews-manager";
import { LeadsManager } from "@/components/leads/leads-manager";
import { LeadInsightsView } from "@/components/leads/lead-insights-view";
import { LeadPerformanceSummaryView } from "@/components/leads/lead-performance-summary";
import { ReadinessChecklist } from "@/components/profile/readiness-checklist";
import { VerificationPanel } from "@/components/profile/verification-panel";
import { ActivityPanel } from "@/components/profile/activity-panel";
import { AvailabilityManager } from "@/components/availability/availability-manager";
import { ServiceAreasManager } from "@/components/service-areas/service-areas-manager";
import { TrackingSettingsManager } from "@/components/tracking/tracking-settings-manager";
import { evaluatePortfolioContentReadiness } from "@/lib/seo-helpers";
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
import type { AvailabilityInput } from "@/data/dashboard/availability.server";
import type { InsightFilter, InsightsDateRange } from "@/data/lead-insights.server";
import { computeLeadPerformanceSummary, buildRecentActivityFeed } from "@/lib/lead-performance";
import type { ServiceAreaInput } from "@/data/dashboard/service-areas.server";
import type { Database } from "@/integrations/supabase/types";

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

// Reuses the SAME platform-wide updateProfileFlags() authority already
// used by /admin/profiles (admin-checked, DB-guard-backed via
// guard_beautician_profile_flags(), audit-logged as "verification_changed")
// — no new verification logic, just a thin wrapper scoped to this
// workspace's target profile.
const updateVerificationAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; is_verified: boolean }) => data)
  .handler(async ({ context, data }) => {
    const { updateProfileFlags } = await import("@/data/admin/profiles.server");
    await updateProfileFlags(context.supabase, context.userId, data.targetProfileId, {
      is_verified: data.is_verified,
    });
  });

// Reuses the SAME audit_logs table + actor-join pattern as the
// platform-wide /admin/audit-logs page, scoped server-side to this one
// profile's own admin actions — see listAuditLogsForBeautician in
// src/data/admin/audit.server.ts.
const listActivityAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listAuditLogsForBeautician } = await import("@/data/admin/audit.server");
    return listAuditLogsForBeautician(context.supabase, context.userId, targetProfileId);
  });

// Reuses the SAME bpId-parameterized core reads the beautician's own
// /dashboard/availability and /dashboard/areas pages use — see
// src/data/admin/availability.server.ts.
const getAvailabilityAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { getAvailabilityAdmin } = await import("@/data/admin/availability.server");
    return getAvailabilityAdmin(context.supabase, context.userId, targetProfileId);
  });

const updateAvailabilityAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; input: AvailabilityInput }) => data)
  .handler(async ({ context, data }) => {
    const { updateAvailabilityAdmin } = await import("@/data/admin/availability.server");
    await updateAvailabilityAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.input,
    );
  });

const listBlockedDatesAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listBlockedDatesAdmin } = await import("@/data/admin/availability.server");
    return listBlockedDatesAdmin(context.supabase, context.userId, targetProfileId);
  });

const addBlockedDateAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { targetProfileId: string; input: { blocked_date: string; reason: string | null } }) =>
      data,
  )
  .handler(async ({ context, data }) => {
    const { addBlockedDateAdmin } = await import("@/data/admin/availability.server");
    await addBlockedDateAdmin(context.supabase, context.userId, data.targetProfileId, data.input);
  });

const deleteBlockedDateAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; blockedDateId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteBlockedDateAdmin } = await import("@/data/admin/availability.server");
    await deleteBlockedDateAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.blockedDateId,
    );
  });

const listServiceAreasAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listServiceAreasAdmin } = await import("@/data/admin/availability.server");
    return listServiceAreasAdmin(context.supabase, context.userId, targetProfileId);
  });

const createServiceAreaAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; input: ServiceAreaInput }) => data)
  .handler(async ({ context, data }) => {
    const { createServiceAreaAdmin } = await import("@/data/admin/availability.server");
    await createServiceAreaAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.input,
    );
  });

const updateServiceAreaAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { targetProfileId: string; areaId: string; updates: Partial<ServiceAreaInput> }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updateServiceAreaAdmin } = await import("@/data/admin/availability.server");
    await updateServiceAreaAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.areaId,
      data.updates,
    );
  });

const deleteServiceAreaAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; areaId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteServiceAreaAdmin } = await import("@/data/admin/availability.server");
    await deleteServiceAreaAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.areaId,
    );
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

const listReviewsAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listReviewsForBeautician } = await import("@/data/admin/reviews.server");
    return listReviewsForBeautician(context.supabase, context.userId, targetProfileId);
  });

const updateReviewModerationAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      targetProfileId: string;
      reviewId: string;
      updates: { is_published?: boolean; is_verified?: boolean };
    }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updateReviewModerationForBeautician } = await import("@/data/admin/reviews.server");
    await updateReviewModerationForBeautician(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.reviewId,
      data.updates,
    );
  });

const deleteReviewAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; reviewId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteReviewForBeautician } = await import("@/data/admin/reviews.server");
    await deleteReviewForBeautician(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.reviewId,
    );
  });

const listLeadsAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listLeadsForBeautician } = await import("@/data/admin/leads.server");
    return listLeadsForBeautician(context.supabase, context.userId, targetProfileId);
  });

const updateLeadStatusAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      targetProfileId: string;
      leadId: string;
      status: Database["public"]["Enums"]["lead_status"];
    }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updateLeadStatusForBeautician } = await import("@/data/admin/leads.server");
    await updateLeadStatusForBeautician(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.leadId,
      data.status,
    );
  });

// Lead Performance Dashboard — reuses the SAME bpId-parameterized insights/
// activity core functions the professional's own /dashboard/leads page
// uses (see src/data/admin/leads.server.ts).
const getLeadInsightsAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; range: InsightsDateRange }) => data)
  .handler(async ({ context, data }) => {
    const { getLeadInsightsAdmin } = await import("@/data/admin/leads.server");
    return getLeadInsightsAdmin(context.supabase, context.userId, data.targetProfileId, data.range);
  });

const getLeadDrilldownAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { targetProfileId: string; range: InsightsDateRange; filter: InsightFilter }) => data,
  )
  .handler(async ({ context, data }) => {
    const { getLeadDrilldownAdmin } = await import("@/data/admin/leads.server");
    return getLeadDrilldownAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.range,
      data.filter,
    );
  });

const listLeadActivitiesAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { listLeadActivitiesAdmin } = await import("@/data/admin/leads.server");
    return listLeadActivitiesAdmin(context.supabase, context.userId, targetProfileId);
  });

const getTrackingSettingsAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { getTrackingSettingsAdmin } = await import("@/data/admin/tracking.server");
    return getTrackingSettingsAdmin(context.supabase, context.userId, targetProfileId);
  });

const saveTrackingSettingsAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetProfileId: string; gtmContainerId: string }) => data)
  .handler(async ({ context, data }) => {
    const { saveTrackingSettingsAdmin } = await import("@/data/admin/tracking.server");
    return saveTrackingSettingsAdmin(
      context.supabase,
      context.userId,
      data.targetProfileId,
      data.gtmContainerId,
    );
  });

const removeTrackingSettingsAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((targetProfileId: string) => targetProfileId)
  .handler(async ({ context, data: targetProfileId }) => {
    const { removeTrackingSettingsAdmin } = await import("@/data/admin/tracking.server");
    await removeTrackingSettingsAdmin(context.supabase, context.userId, targetProfileId);
  });

type TabId =
  | "overview"
  | "profile"
  | "services"
  | "gallery"
  | "before-after"
  | "videos"
  | "packages"
  | "faqs"
  | "reviews"
  | "leads"
  | "readiness"
  | "verification"
  | "activity"
  | "availability"
  | "tracking";

// Phase 5.2A §6 / Phase 5.2B / Phase 5.2C / Phase 5.2D / Phase 5.2E / Phase
// 5.2F / Phase 5.2G / QA-1O / QA-1P / QA-1Q — the full future workspace
// nav; "services" (5.2A), "profile" (5.2B), "gallery" (5.2C),
// "before-after" (5.2D), "videos" (5.2E), "packages" (5.2F), "faqs"
// (5.2G), "reviews" (QA-1O), "leads" (QA-1P), and "readiness" (QA-1Q) are
// wired to real implementations. Every other section is visibly present
// (so the eventual shape is clear) but explicitly marked unavailable
// rather than rendering a fake/empty screen.
const TABS: { id: TabId | string; label: string; enabled: boolean }[] = [
  { id: "overview", label: "Overview", enabled: true },
  { id: "profile", label: "Profile", enabled: true },
  { id: "services", label: "Services", enabled: true },
  { id: "gallery", label: "Gallery", enabled: true },
  { id: "before-after", label: "Before & After", enabled: true },
  { id: "videos", label: "Videos", enabled: true },
  { id: "packages", label: "Packages", enabled: true },
  { id: "faqs", label: "FAQs", enabled: true },
  { id: "reviews", label: "Reviews", enabled: true },
  { id: "leads", label: "Leads", enabled: true },
  { id: "readiness", label: "Readiness", enabled: true },
  { id: "portfolio", label: "Portfolio", enabled: false },
  { id: "media", label: "Media", enabled: false },
  { id: "verification", label: "Verification", enabled: true },
  { id: "activity", label: "Activity", enabled: true },
  { id: "availability", label: "Availability", enabled: true },
  { id: "tracking", label: "Tracking", enabled: true },
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
    // QA-1Q — also needed by "readiness" (persisted-state checklist); now
    // also by "verification" (same is_verified field, no separate fetch).
    enabled:
      !!targetProfileId &&
      (activeTab === "profile" || activeTab === "readiness" || activeTab === "verification"),
  });
  const profileReadinessQuery = useQuery({
    queryKey: ["admin-profile-readiness", targetProfileId],
    queryFn: () => getProfileReadinessContextAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && (activeTab === "profile" || activeTab === "readiness"),
  });
  const updateProfileMutation = useMutation({
    mutationFn: (updates: OwnProfileUpdate) =>
      updateProfileAdminFn({ data: { targetProfileId: targetProfileId!, updates } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileQueryKey });
      queryClient.invalidateQueries({ queryKey: ["admin-target-profile", slug] });
    },
  });
  const activityQueryKey = ["admin-activity", targetProfileId];
  const activityQuery = useQuery({
    queryKey: activityQueryKey,
    queryFn: () => listActivityAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "activity",
  });

  const updateVerificationMutation = useMutation({
    mutationFn: (is_verified: boolean) =>
      updateVerificationAdminFn({ data: { targetProfileId: targetProfileId!, is_verified } }),
    onSuccess: () => {
      toast.success("Verification updated");
      queryClient.invalidateQueries({ queryKey: profileQueryKey });
      queryClient.invalidateQueries({ queryKey: ["admin-target-profile", slug] });
      queryClient.invalidateQueries({ queryKey: activityQueryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update verification"),
  });

  const availabilityQueryKey = ["admin-availability", targetProfileId];
  const availabilityQuery = useQuery({
    queryKey: availabilityQueryKey,
    queryFn: () => getAvailabilityAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "availability",
  });
  const updateAvailabilityMutation = useMutation({
    mutationFn: (input: AvailabilityInput) =>
      updateAvailabilityAdminFn({ data: { targetProfileId: targetProfileId!, input } }),
    onSuccess: () => {
      toast.success("Availability updated");
      queryClient.invalidateQueries({ queryKey: availabilityQueryKey });
      queryClient.invalidateQueries({ queryKey: activityQueryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update availability"),
  });

  const blockedDatesQueryKey = ["admin-blocked-dates", targetProfileId];
  const blockedDatesQuery = useQuery({
    queryKey: blockedDatesQueryKey,
    queryFn: () => listBlockedDatesAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "availability",
  });
  const addBlockedDateMutation = useMutation({
    mutationFn: (input: { blocked_date: string; reason: string | null }) =>
      addBlockedDateAdminFn({ data: { targetProfileId: targetProfileId!, input } }),
    onSuccess: () => {
      toast.success("Date blocked");
      queryClient.invalidateQueries({ queryKey: blockedDatesQueryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to block date"),
  });
  const deleteBlockedDateMutation = useMutation({
    mutationFn: (blockedDateId: string) =>
      deleteBlockedDateAdminFn({ data: { targetProfileId: targetProfileId!, blockedDateId } }),
    onSuccess: () => {
      toast.success("Blocked date removed");
      queryClient.invalidateQueries({ queryKey: blockedDatesQueryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to remove blocked date"),
  });

  const serviceAreasQueryKey = ["admin-service-areas", targetProfileId];
  const serviceAreasQuery = useQuery({
    queryKey: serviceAreasQueryKey,
    queryFn: () => listServiceAreasAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "availability",
  });
  const createServiceAreaMutation = useMutation({
    mutationFn: (input: ServiceAreaInput) =>
      createServiceAreaAdminFn({ data: { targetProfileId: targetProfileId!, input } }),
    onSuccess: () => {
      toast.success("Service area added.");
      queryClient.invalidateQueries({ queryKey: serviceAreasQueryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to add service area"),
  });
  const updateServiceAreaMutation = useMutation({
    mutationFn: (vars: { areaId: string; updates: Partial<ServiceAreaInput> }) =>
      updateServiceAreaAdminFn({
        data: { targetProfileId: targetProfileId!, areaId: vars.areaId, updates: vars.updates },
      }),
    onSuccess: () => {
      toast.success("Service area updated.");
      queryClient.invalidateQueries({ queryKey: serviceAreasQueryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update service area"),
  });
  const deleteServiceAreaMutation = useMutation({
    mutationFn: (areaId: string) =>
      deleteServiceAreaAdminFn({ data: { targetProfileId: targetProfileId!, areaId } }),
    onSuccess: () => {
      toast.success("Service area removed.");
      queryClient.invalidateQueries({ queryKey: serviceAreasQueryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to remove service area"),
  });

  const trackingSettingsQueryKey = ["admin-tracking-settings", targetProfileId];
  const trackingSettingsQuery = useQuery({
    queryKey: trackingSettingsQueryKey,
    queryFn: () => getTrackingSettingsAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "tracking",
  });
  const saveTrackingSettingsMutation = useMutation({
    mutationFn: (gtmContainerId: string) =>
      saveTrackingSettingsAdminFn({ data: { targetProfileId: targetProfileId!, gtmContainerId } }),
    onSuccess: () => {
      toast.success("GTM container ID saved");
      queryClient.invalidateQueries({ queryKey: trackingSettingsQueryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save GTM container ID"),
  });
  const removeTrackingSettingsMutation = useMutation({
    mutationFn: () => removeTrackingSettingsAdminFn({ data: targetProfileId! }),
    onSuccess: () => {
      toast.success("GTM container ID removed");
      queryClient.invalidateQueries({ queryKey: trackingSettingsQueryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to remove GTM container ID"),
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

  const reviewsQueryKey = ["admin-reviews", targetProfileId];
  const reviewsQuery = useQuery({
    queryKey: reviewsQueryKey,
    queryFn: () => listReviewsAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "reviews",
  });
  const onReviewsSaved = () => queryClient.invalidateQueries({ queryKey: reviewsQueryKey });

  const moderateReviewMutation = useMutation({
    mutationFn: (vars: {
      reviewId: string;
      updates: { is_published?: boolean; is_verified?: boolean };
    }) =>
      updateReviewModerationAdminFn({
        data: { targetProfileId: targetProfileId!, reviewId: vars.reviewId, updates: vars.updates },
      }),
  });
  const deleteReviewMutation = useMutation({
    mutationFn: (id: string) =>
      deleteReviewAdminFn({ data: { targetProfileId: targetProfileId!, reviewId: id } }),
  });

  const leadsQueryKey = ["admin-leads", targetProfileId];
  const leadsQuery = useQuery({
    queryKey: leadsQueryKey,
    queryFn: () => listLeadsAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "leads",
  });

  const updateLeadStatusMutation = useMutation({
    mutationFn: (vars: { leadId: string; status: Database["public"]["Enums"]["lead_status"] }) =>
      updateLeadStatusAdminFn({
        data: { targetProfileId: targetProfileId!, leadId: vars.leadId, status: vars.status },
      }),
    onSuccess: () => {
      toast.success("Lead status updated");
      queryClient.invalidateQueries({ queryKey: leadsQueryKey });
    },
  });

  // ---- Lead Performance Dashboard ----
  const [insightsRange, setInsightsRange] = useState<InsightsDateRange>("30d");
  const [insightFilter, setInsightFilter] = useState<InsightFilter | null>(null);

  const leadInsightsQuery = useQuery({
    queryKey: ["admin-lead-insights", targetProfileId, insightsRange],
    queryFn: () =>
      getLeadInsightsAdminFn({ data: { targetProfileId: targetProfileId!, range: insightsRange } }),
    enabled: !!targetProfileId && activeTab === "leads",
  });
  const leadDrilldownQuery = useQuery({
    queryKey: ["admin-lead-drilldown", targetProfileId, insightsRange, insightFilter],
    queryFn: () =>
      getLeadDrilldownAdminFn({
        data: { targetProfileId: targetProfileId!, range: insightsRange, filter: insightFilter! },
      }),
    enabled: !!targetProfileId && activeTab === "leads" && !!insightFilter,
  });
  const leadActivitiesQuery = useQuery({
    queryKey: ["admin-lead-activities", targetProfileId],
    queryFn: () => listLeadActivitiesAdminFn({ data: targetProfileId! }),
    enabled: !!targetProfileId && activeTab === "leads",
  });

  const performanceSummary = useMemo(() => {
    if (!leadsQuery.data || !leadActivitiesQuery.data) return null;
    return computeLeadPerformanceSummary(leadsQuery.data, leadActivitiesQuery.data);
  }, [leadsQuery.data, leadActivitiesQuery.data]);

  const recentLeadActivity = useMemo(
    () => buildRecentActivityFeed(leadActivitiesQuery.data ?? []),
    [leadActivitiesQuery.data],
  );

  // Same-shape drill-down filtering as the professional's own /dashboard/
  // leads page — matches the clicked insight row's customers against the
  // already-fetched admin leads list, no separate CRM view needed.
  const drilldownMatchedIds = useMemo(
    () => (insightFilter ? new Set((leadDrilldownQuery.data ?? []).map((m) => m.leadId)) : null),
    [insightFilter, leadDrilldownQuery.data],
  );
  const visibleLeads = useMemo(
    () =>
      drilldownMatchedIds
        ? (leadsQuery.data ?? []).filter((l) => drilldownMatchedIds.has(l.id))
        : (leadsQuery.data ?? []),
    [leadsQuery.data, drilldownMatchedIds],
  );

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

  // QA-1Q — the dedicated Readiness tab's persisted-state checklist:
  // reuses the exact same evaluatePortfolioContentReadiness() and
  // already-fetched admin readiness context that ProfileManager's inline
  // panel uses for its own LIVE-DRAFT preview (profile-manager.tsx's
  // `liveReadiness`) — but computed from the PERSISTED profile row
  // (adminProfileQuery.data) instead of unsaved form state, matching how
  // the professional's own /dashboard/seo full checklist is computed
  // (persisted, not draft). No new business logic, no new percentage.
  const portfolioReadiness =
    adminProfileQuery.data && profileReadinessQuery.data
      ? evaluatePortfolioContentReadiness({
          isPublished: adminProfileQuery.data.status === "published",
          robotsIndex: profileReadinessQuery.data.robotsIndex,
          professionalName: adminProfileQuery.data.display_name,
          professionalTitle: adminProfileQuery.data.professional_title,
          primaryCity: adminProfileQuery.data.primary_city,
          bio: adminProfileQuery.data.bio,
          hasProfileImage: !!adminProfileQuery.data.profile_image_url,
          activeServiceCount: profileReadinessQuery.data.activeServiceCount,
          locality: adminProfileQuery.data.locality,
          serviceAreaCount: profileReadinessQuery.data.serviceAreaCount,
          isVerified: adminProfileQuery.data.is_verified ?? false,
          yearsExperience: adminProfileQuery.data.years_experience,
          publishedGalleryImageCount: profileReadinessQuery.data.publishedGalleryImageCount,
          galleryImagesWithAltCount: profileReadinessQuery.data.galleryImagesWithAltCount,
          publishedBeforeAfterCount: profileReadinessQuery.data.publishedBeforeAfterCount,
          publishedReviewCount: profileReadinessQuery.data.publishedReviewCount,
          publishedFaqCount: profileReadinessQuery.data.publishedFaqCount,
          publishedVideoCount: profileReadinessQuery.data.publishedVideoCount,
          hasValidSocialLink: !!(
            adminProfileQuery.data.instagram_url ||
            adminProfileQuery.data.facebook_url ||
            adminProfileQuery.data.youtube_url ||
            adminProfileQuery.data.website_url
          ),
          hasContactInfo: !!(
            adminProfileQuery.data.phone ||
            adminProfileQuery.data.email ||
            adminProfileQuery.data.whatsapp_number
          ),
          availabilityConfigured: profileReadinessQuery.data.availabilityConfigured,
          seoTitle: profileReadinessQuery.data.seoTitle,
          metaDescription: profileReadinessQuery.data.metaDescription,
          canonicalUrl: profileReadinessQuery.data.canonicalUrl,
        })
      : null;

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

      {activeTab === "reviews" && targetProfileId && (
        <ReviewsManager
          title="Reviews"
          subtitle={`Moderating testimonials for ${profile.display_name}.`}
          reviews={reviewsQuery.data ?? []}
          isLoading={reviewsQuery.isLoading}
          onModerate={(reviewId, updates) =>
            moderateReviewMutation.mutateAsync({ reviewId, updates })
          }
          onDelete={(id) => deleteReviewMutation.mutateAsync(id)}
          onSaved={onReviewsSaved}
        />
      )}

      {activeTab === "leads" && targetProfileId && (
        <div className="space-y-8">
          <div>
            <h2 className="font-display text-2xl font-semibold">Lead Performance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Whether {profile.display_name} is receiving and following up enquiries.
            </p>
            <LeadPerformanceSummaryView
              summary={performanceSummary}
              recentActivity={recentLeadActivity}
              isLoading={leadsQuery.isLoading || leadActivitiesQuery.isLoading}
            />
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold">Attribution</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Where {profile.display_name}'s enquiries come from.
            </p>
            <LeadInsightsView
              insights={leadInsightsQuery.data}
              isLoading={leadInsightsQuery.isLoading}
              isError={leadInsightsQuery.isError}
              range={insightsRange}
              onRangeChange={setInsightsRange}
              onDrilldown={setInsightFilter}
            />
          </div>

          <LeadsManager
            title="Leads"
            subtitle={`Enquiries submitted through ${profile.display_name}'s public page.`}
            leads={visibleLeads}
            isLoading={leadsQuery.isLoading}
            onUpdateStatus={(leadId, status) =>
              updateLeadStatusMutation.mutateAsync({ leadId, status })
            }
            filterBanner={
              insightFilter
                ? {
                    text: leadDrilldownQuery.isLoading
                      ? "Loading matches…"
                      : `${visibleLeads.length} matching customer${visibleLeads.length === 1 ? "" : "s"}`,
                    onClear: () => setInsightFilter(null),
                  }
                : null
            }
          />
        </div>
      )}

      {activeTab === "readiness" && targetProfileId && (
        <ReadinessChecklist
          title="Readiness"
          subtitle={`Whether ${profile.display_name}'s portfolio is currently complete and valid for search.`}
          readiness={portfolioReadiness}
          isLoading={adminProfileQuery.isLoading || profileReadinessQuery.isLoading}
        />
      )}

      {activeTab === "verification" && targetProfileId && (
        <VerificationPanel
          profileDisplayName={profile.display_name}
          isVerified={adminProfileQuery.data?.is_verified ?? null}
          isLoading={adminProfileQuery.isLoading}
          isSaving={updateVerificationMutation.isPending}
          onToggle={(next) => updateVerificationMutation.mutate(next)}
        />
      )}

      {activeTab === "activity" && targetProfileId && (
        <ActivityPanel
          profileDisplayName={profile.display_name}
          entries={activityQuery.data ?? []}
          isLoading={activityQuery.isLoading}
        />
      )}

      {activeTab === "availability" && targetProfileId && (
        <div className="space-y-8">
          <AvailabilityManager
            availability={availabilityQuery.data ?? null}
            isLoading={availabilityQuery.isLoading}
            onSave={(input) => updateAvailabilityMutation.mutate(input)}
            isSaving={updateAvailabilityMutation.isPending}
            blockedDates={blockedDatesQuery.data ?? []}
            blockedDatesLoading={blockedDatesQuery.isLoading}
            onAddBlockedDate={(input) => addBlockedDateMutation.mutate(input)}
            onRemoveBlockedDate={(id) => deleteBlockedDateMutation.mutate(id)}
            blockedDateSaving={
              addBlockedDateMutation.isPending || deleteBlockedDateMutation.isPending
            }
            showFunnelHint={false}
          />
          <ServiceAreasManager
            areas={serviceAreasQuery.data ?? []}
            isLoading={serviceAreasQuery.isLoading}
            isSaving={createServiceAreaMutation.isPending || updateServiceAreaMutation.isPending}
            onCreate={(input) => createServiceAreaMutation.mutateAsync(input)}
            onUpdate={(id, input) =>
              updateServiceAreaMutation.mutateAsync({ areaId: id, updates: input })
            }
            onDelete={(id) => deleteServiceAreaMutation.mutate(id)}
          />
        </div>
      )}

      {activeTab === "tracking" && targetProfileId && (
        <div className="space-y-8">
          <TrackingSettingsManager
            gtmContainerId={trackingSettingsQuery.data ?? null}
            isLoading={trackingSettingsQuery.isLoading}
            isSaving={saveTrackingSettingsMutation.isPending}
            onSave={(value) => saveTrackingSettingsMutation.mutateAsync(value).then(() => {})}
            onRemove={() => removeTrackingSettingsMutation.mutate()}
          />
        </div>
      )}
    </div>
  );
}
