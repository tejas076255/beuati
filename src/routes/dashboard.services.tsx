import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ServicesManager } from "@/components/services/services-manager";
import type { ServiceInput, ServiceReadinessContext } from "@/data/dashboard/services.server";

export const Route = createFileRoute("/dashboard/services")({
  component: ServicesPage,
});

const listServicesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnServicesWithReadiness } = await import("@/data/dashboard/services.server");
    return listOwnServicesWithReadiness(context.supabase, context.userId);
  });

const createServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ServiceInput) => data)
  .handler(async ({ context, data }) => {
    const { createService } = await import("@/data/dashboard/services.server");
    await createService(context.supabase, context.userId, data);
  });

const updateServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & Partial<ServiceInput>) => data)
  .handler(async ({ context, data }) => {
    const { updateService } = await import("@/data/dashboard/services.server");
    const { id, ...updates } = data;
    await updateService(context.supabase, context.userId, id, updates);
  });

const deleteServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteService } = await import("@/data/dashboard/services.server");
    await deleteService(context.supabase, context.userId, data.id);
  });

// Phase 3F.8A.1 — dedicated key, never shared with Gallery/Before & After's
// flat Tables<"services">[] cache slot for the same reason documented
// there: this page's query returns a differently-shaped
// { services, readinessContext } object.
const OWN_SERVICES_QUERY_KEY = ["own-services-with-readiness"];

function ServicesPage() {
  const queryClient = useQueryClient();
  const servicesQuery = useQuery({
    queryKey: OWN_SERVICES_QUERY_KEY,
    queryFn: () => listServicesFn(),
  });

  const createMutation = useMutation({
    mutationFn: (input: ServiceInput) => createServiceFn({ data: input }),
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; updates: Partial<ServiceInput> }) =>
      updateServiceFn({ data: { id: vars.id, ...vars.updates } }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteServiceFn({ data: { id } }),
  });

  const services = servicesQuery.data?.services ?? [];
  // Safe, all-pass-by-default placeholder used only while the page is
  // still loading — the Add-service trigger needs *some* context to pass
  // down, but nothing is actually saveable until the real query resolves.
  const readinessContext: ServiceReadinessContext = servicesQuery.data?.readinessContext ?? {
    profileIsPublished: true,
    profileRobotsIndex: true,
    primaryCity: null,
    publishedReviewCount: 0,
    serviceAreaCount: 0,
  };
  const onSaved = () => queryClient.invalidateQueries({ queryKey: OWN_SERVICES_QUERY_KEY });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <ServicesManager
        services={services}
        readinessContext={readinessContext}
        isLoading={servicesQuery.isLoading}
        onCreate={(input) => createMutation.mutateAsync(input)}
        onUpdate={(id, updates) => updateMutation.mutateAsync({ id, updates })}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        onSaved={onSaved}
      />
    </div>
  );
}
