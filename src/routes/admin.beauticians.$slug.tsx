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
import type { ServiceInput, ServiceReadinessContext } from "@/data/dashboard/services.server";
import type { AdminTargetProfile } from "@/data/admin/services.server";
import type { OwnProfileUpdate } from "@/data/dashboard/profile.server";

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

type TabId = "overview" | "profile" | "services";

// Phase 5.2A §6 / Phase 5.2B — the full future workspace nav; "services"
// (5.2A) and "profile" (5.2B) are wired to real implementations. Every
// other section is visibly present (so the eventual shape is clear) but
// explicitly marked unavailable rather than rendering a fake/empty screen.
const TABS: { id: TabId | string; label: string; enabled: boolean }[] = [
  { id: "overview", label: "Overview", enabled: true },
  { id: "profile", label: "Profile", enabled: true },
  { id: "services", label: "Services", enabled: true },
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
    enabled: !!targetProfileId && activeTab === "services",
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
    </div>
  );
}
