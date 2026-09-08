import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BeforeAfterManager } from "@/components/before-after/before-after-manager";
import type {
  BeforeAfterItemUpdate,
  BeforeAfterItemWithImages,
  BeforeAfterPairInput,
} from "@/data/dashboard/before-after.server";
import { getPlanCapacity } from "@/lib/plan-limits";

export const Route = createFileRoute("/dashboard/before-after")({
  component: BeforeAfterPage,
});

const getSlugFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnProfile } = await import("@/data/dashboard/profile.server");
    const profile = await getOwnProfile(context.supabase, context.userId);
    return profile.slug;
  });

const listItemsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnBeforeAfterItems } = await import("@/data/dashboard/before-after.server");
    return listOwnBeforeAfterItems(context.supabase, context.userId);
  });

// Reused as the "Related service" dropdown source (Phase 3F.5) — same list
// the Services dashboard manages, so it always shows exactly this
// beautician's own real services.
const listServicesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnServices } = await import("@/data/dashboard/services.server");
    return listOwnServices(context.supabase, context.userId);
  });

const createPairFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: BeforeAfterPairInput) => data)
  .handler(async ({ context, data }) => {
    const { createBeforeAfterPair } = await import("@/data/dashboard/before-after.server");
    await createBeforeAfterPair(context.supabase, context.userId, data);
  });

const updateItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & BeforeAfterItemUpdate) => data)
  .handler(async ({ context, data }) => {
    const { updateBeforeAfterItem } = await import("@/data/dashboard/before-after.server");
    const { id, ...updates } = data;
    await updateBeforeAfterItem(context.supabase, context.userId, id, updates);
  });

const replaceImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { imageId: string; storagePath: string }) => data)
  .handler(async ({ context, data }) => {
    const { replaceBeforeAfterImage } = await import("@/data/dashboard/before-after.server");
    return replaceBeforeAfterImage(
      context.supabase,
      context.userId,
      data.imageId,
      data.storagePath,
    );
  });

const deleteItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteBeforeAfterItem } = await import("@/data/dashboard/before-after.server");
    return deleteBeforeAfterItem(context.supabase, context.userId, data.id);
  });

const updateImageAltFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; altText: string }) => data)
  .handler(async ({ context, data }) => {
    const { updateImageAltText } = await import("@/data/dashboard/before-after.server");
    await updateImageAltText(context.supabase, context.userId, data.id, data.altText);
  });

const getOwnPlanFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnPortfolioPlan } = await import("@/data/dashboard/plan-enforcement.server");
    return getOwnPortfolioPlan(context.supabase, context.userId);
  });

const OWN_BEFORE_AFTER_QUERY_KEY = ["own-before-after"];

function BeforeAfterPage() {
  const queryClient = useQueryClient();
  const slugQuery = useQuery({ queryKey: ["own-slug"], queryFn: () => getSlugFn() });
  const planQuery = useQuery({ queryKey: ["own-plan"], queryFn: () => getOwnPlanFn() });
  const itemsQuery = useQuery({
    queryKey: OWN_BEFORE_AFTER_QUERY_KEY,
    queryFn: () => listItemsFn(),
    enabled: !!slugQuery.data,
  });
  // Phase 3F.8A.1 — see the identical comment in dashboard.gallery.tsx.
  // Shares this key with Gallery on purpose (same shape, same data).
  const servicesQuery = useQuery({
    queryKey: ["own-services-for-linking"],
    queryFn: () => listServicesFn(),
  });
  const services = Array.isArray(servicesQuery.data) ? servicesQuery.data : [];

  const onSaved = () => queryClient.invalidateQueries({ queryKey: OWN_BEFORE_AFTER_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: BeforeAfterPairInput) => createPairFn({ data: input }),
  });
  const updateItemMutation = useMutation({
    mutationFn: (vars: { id: string; updates: BeforeAfterItemUpdate }) =>
      updateItemFn({ data: { id: vars.id, ...vars.updates } }),
  });
  const replaceImageMutation = useMutation({
    mutationFn: (vars: { imageId: string; storagePath: string }) => replaceImageFn({ data: vars }),
  });
  const updateImageAltMutation = useMutation({
    mutationFn: (vars: { id: string; altText: string }) => updateImageAltFn({ data: vars }),
  });
  const deleteItemMutation = useMutation({
    mutationFn: (item: BeforeAfterItemWithImages) => deleteItemFn({ data: { id: item.id } }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <BeforeAfterManager
        items={itemsQuery.data ?? []}
        services={services}
        isLoading={itemsQuery.isLoading}
        uploadSlug={slugQuery.data ?? ""}
        onCreate={(input) => createMutation.mutateAsync(input)}
        onUpdateItem={(id, updates) => updateItemMutation.mutateAsync({ id, updates })}
        onReplaceImage={(imageId, storagePath) =>
          replaceImageMutation.mutateAsync({ imageId, storagePath })
        }
        onUpdateImageAlt={(id, altText) => updateImageAltMutation.mutateAsync({ id, altText })}
        onDeleteItem={(item) => deleteItemMutation.mutateAsync(item)}
        onSaved={onSaved}
        plan={planQuery.data}
        capacity={
          planQuery.data
            ? getPlanCapacity(planQuery.data, "before_after_items", (itemsQuery.data ?? []).length)
            : undefined
        }
      />
    </div>
  );
}
