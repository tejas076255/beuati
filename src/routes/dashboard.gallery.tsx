import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GalleryManager } from "@/components/gallery/gallery-manager";
import type {
  GalleryItemInput,
  NewGalleryImage,
  PortfolioItemUpdate,
  PortfolioItemWithImages,
} from "@/data/dashboard/gallery.server";

export const Route = createFileRoute("/dashboard/gallery")({
  component: GalleryPage,
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
    const { listOwnPortfolioItems } = await import("@/data/dashboard/gallery.server");
    return listOwnPortfolioItems(context.supabase, context.userId);
  });

// Reused as the "Related service" dropdown source (Phase 3F.5) — the same
// list the Services dashboard itself manages, so the dropdown always shows
// exactly this beautician's own real services, never another profile's.
const listServicesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnServices } = await import("@/data/dashboard/services.server");
    return listOwnServices(context.supabase, context.userId);
  });

const createItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GalleryItemInput) => data)
  .handler(async ({ context, data }) => {
    const { createPortfolioItemWithImages } = await import("@/data/dashboard/gallery.server");
    await createPortfolioItemWithImages(context.supabase, context.userId, data);
  });

const updateItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & PortfolioItemUpdate) => data)
  .handler(async ({ context, data }) => {
    const { updatePortfolioItem } = await import("@/data/dashboard/gallery.server");
    const { id, ...updates } = data;
    await updatePortfolioItem(context.supabase, context.userId, id, updates);
  });

const addImagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { itemId: string; images: NewGalleryImage[] }) => data)
  .handler(async ({ context, data }) => {
    const { addPortfolioImages } = await import("@/data/dashboard/gallery.server");
    await addPortfolioImages(context.supabase, context.userId, data.itemId, data.images);
  });

const deleteImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deletePortfolioImage } = await import("@/data/dashboard/gallery.server");
    return deletePortfolioImage(context.supabase, context.userId, data.id);
  });

const updateImageAltFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; altText: string }) => data)
  .handler(async ({ context, data }) => {
    const { updateImageAltText } = await import("@/data/dashboard/gallery.server");
    await updateImageAltText(context.supabase, context.userId, data.id, data.altText);
  });

const deleteItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deletePortfolioItem } = await import("@/data/dashboard/gallery.server");
    return deletePortfolioItem(context.supabase, context.userId, data.id);
  });

const OWN_GALLERY_QUERY_KEY = ["own-gallery"];

function GalleryPage() {
  const queryClient = useQueryClient();
  const slugQuery = useQuery({ queryKey: ["own-slug"], queryFn: () => getSlugFn() });
  const itemsQuery = useQuery({
    queryKey: OWN_GALLERY_QUERY_KEY,
    queryFn: () => listItemsFn(),
    enabled: !!slugQuery.data,
  });
  // Phase 3F.8A.1 — a dedicated key, not "own-services": that key is also
  // used by /dashboard/services, which (since Phase 3F.8) returns a
  // differently-shaped { services, readinessContext } object rather than a
  // flat array.
  const servicesQuery = useQuery({
    queryKey: ["own-services-for-linking"],
    queryFn: () => listServicesFn(),
  });
  const services = Array.isArray(servicesQuery.data) ? servicesQuery.data : [];

  const onSaved = () => queryClient.invalidateQueries({ queryKey: OWN_GALLERY_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: GalleryItemInput) => createItemFn({ data: input }),
  });
  const updateItemMutation = useMutation({
    mutationFn: (vars: { id: string; updates: PortfolioItemUpdate }) =>
      updateItemFn({ data: { id: vars.id, ...vars.updates } }),
  });
  const addImagesMutation = useMutation({
    mutationFn: (vars: { itemId: string; images: NewGalleryImage[] }) =>
      addImagesFn({ data: vars }),
  });
  const deleteImageMutation = useMutation({
    mutationFn: (id: string) => deleteImageFn({ data: { id } }),
  });
  const updateImageAltMutation = useMutation({
    mutationFn: (vars: { id: string; altText: string }) => updateImageAltFn({ data: vars }),
  });
  const deleteItemMutation = useMutation({
    mutationFn: (item: PortfolioItemWithImages) => deleteItemFn({ data: { id: item.id } }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <GalleryManager
        items={itemsQuery.data ?? []}
        services={services}
        isLoading={itemsQuery.isLoading}
        uploadSlug={slugQuery.data ?? ""}
        onCreate={(input) => createMutation.mutateAsync(input)}
        onUpdateItem={(id, updates) => updateItemMutation.mutateAsync({ id, updates })}
        onAddImages={(itemId, images) => addImagesMutation.mutateAsync({ itemId, images })}
        onDeleteImage={(id) => deleteImageMutation.mutateAsync(id)}
        onUpdateImageAlt={(id, altText) => updateImageAltMutation.mutateAsync({ id, altText })}
        onDeleteItem={(item) => deleteItemMutation.mutateAsync(item)}
        onSaved={onSaved}
      />
    </div>
  );
}
