import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ProfileManager } from "@/components/profile/profile-manager";
import type { OwnProfileUpdate } from "@/data/dashboard/profile.server";

export const Route = createFileRoute("/dashboard/profile")({
  component: ProfilePage,
});

const getProfileFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnProfile } = await import("@/data/dashboard/profile.server");
    return getOwnProfile(context.supabase, context.userId);
  });

// Phase 3F.9 §19/§20 — the "external" readiness signals (services, gallery,
// reviews, etc.) this page doesn't itself edit. A dedicated key so it can
// never collide with any other route's differently-shaped query.
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

function ProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["own-profile"], queryFn: () => getProfileFn() });
  const readinessContextQuery = useQuery({
    queryKey: ["own-portfolio-readiness-context"],
    queryFn: () => getReadinessContextFn(),
  });

  const saveMutation = useMutation({
    mutationFn: (updates: OwnProfileUpdate) => updateProfileFn({ data: updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["own-profile"] });
    },
  });

  if (profileQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        {(profileQuery.error as Error).message || "Failed to load profile."}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <ProfileManager
        profile={profileQuery.data}
        readinessContext={readinessContextQuery.data}
        isLoading={profileQuery.isLoading}
        uploadSlug={profileQuery.data?.slug}
        publicPortfolioSlug={profileQuery.data?.slug}
        onSave={(updates) => saveMutation.mutateAsync(updates)}
      />
    </div>
  );
}
