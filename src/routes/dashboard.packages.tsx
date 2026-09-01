import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PackageManager } from "@/components/packages/package-manager";
import type { PackageInput } from "@/data/dashboard/packages.server";

export const Route = createFileRoute("/dashboard/packages")({
  component: PackagesPage,
});

const listPackagesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnPackages } = await import("@/data/dashboard/packages.server");
    return listOwnPackages(context.supabase, context.userId);
  });

const createPackageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: PackageInput) => data)
  .handler(async ({ context, data }) => {
    const { createPackage } = await import("@/data/dashboard/packages.server");
    await createPackage(context.supabase, context.userId, data);
  });

const updatePackageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & Partial<PackageInput>) => data)
  .handler(async ({ context, data }) => {
    const { updatePackage } = await import("@/data/dashboard/packages.server");
    const { id, ...updates } = data;
    await updatePackage(context.supabase, context.userId, id, updates);
  });

const deletePackageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deletePackage } = await import("@/data/dashboard/packages.server");
    await deletePackage(context.supabase, context.userId, data.id);
  });

const OWN_PACKAGES_QUERY_KEY = ["own-packages"];

function PackagesPage() {
  const queryClient = useQueryClient();
  const packagesQuery = useQuery({
    queryKey: OWN_PACKAGES_QUERY_KEY,
    queryFn: () => listPackagesFn(),
  });

  const onSaved = () => queryClient.invalidateQueries({ queryKey: OWN_PACKAGES_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: PackageInput) => createPackageFn({ data: input }),
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; updates: Partial<PackageInput> }) =>
      updatePackageFn({ data: { id: vars.id, ...vars.updates } }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePackageFn({ data: { id } }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <PackageManager
        packages={packagesQuery.data ?? []}
        isLoading={packagesQuery.isLoading}
        onCreate={(input) => createMutation.mutateAsync(input)}
        onUpdate={(id, updates) => updateMutation.mutateAsync({ id, updates })}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        onSaved={onSaved}
      />
    </div>
  );
}
