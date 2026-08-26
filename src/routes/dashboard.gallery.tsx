import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  uploadPortfolioMedia,
  buildPublicMediaUrl,
  deletePortfolioMedia,
  IMAGE_GUIDELINES,
  UPLOAD_HINT,
} from "@/lib/storage-upload";
import type { NewGalleryImage, PortfolioItemWithImages } from "@/data/dashboard/gallery.server";
import type { Tables } from "@/integrations/supabase/types";

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
  .validator(
    (data: {
      title: string;
      category: string;
      images: NewGalleryImage[];
      isPublished: boolean;
      serviceId: string | null;
    }) => data,
  )
  .handler(async ({ context, data }) => {
    const { createPortfolioItemWithImages } = await import("@/data/dashboard/gallery.server");
    await createPortfolioItemWithImages(context.supabase, context.userId, data);
  });

const updateItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      id: string;
      title: string;
      category: string;
      isPublished: boolean;
      serviceId: string | null;
    }) => data,
  )
  .handler(async ({ context, data }) => {
    const { updatePortfolioItem } = await import("@/data/dashboard/gallery.server");
    await updatePortfolioItem(context.supabase, data.id, {
      title: data.title,
      category: data.category,
      isPublished: data.isPublished,
      serviceId: data.serviceId,
    });
  });

const addImagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { itemId: string; images: NewGalleryImage[] }) => data)
  .handler(async ({ context, data }) => {
    const { addPortfolioImages } = await import("@/data/dashboard/gallery.server");
    await addPortfolioImages(context.supabase, data.itemId, data.images);
  });

const deleteImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deletePortfolioImage } = await import("@/data/dashboard/gallery.server");
    return deletePortfolioImage(context.supabase, data.id);
  });

const updateImageAltFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; altText: string }) => data)
  .handler(async ({ context, data }) => {
    const { updateImageAltText } = await import("@/data/dashboard/gallery.server");
    await updateImageAltText(context.supabase, data.id, data.altText);
  });

const deleteItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deletePortfolioItem } = await import("@/data/dashboard/gallery.server");
    return deletePortfolioItem(context.supabase, data.id);
  });

const CATEGORIES = [
  { value: "bridal", label: "Bridal" },
  { value: "party", label: "Party" },
  { value: "hd", label: "HD" },
  { value: "hair", label: "Hair" },
  { value: "nails", label: "Nails" },
];

function ImageDropzone({
  files,
  onFilesChange,
  label,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  label: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = useRef(`gallery-images-${Math.random().toString(36).slice(2)}`).current;

  const syncFromInput = () => {
    onFilesChange(fileRef.current?.files ? Array.from(fileRef.current.files) : []);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (!fileRef.current || e.dataTransfer.files.length === 0) return;
    fileRef.current.files = e.dataTransfer.files;
    syncFromInput();
  };

  const handleRemove = () => {
    if (fileRef.current) fileRef.current.value = "";
    onFilesChange([]);
  };

  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-1 space-y-2">
        {files.length > 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <ImagePlus className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {files.length} image{files.length === 1 ? "" : "s"} selected
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {files.map((f) => f.name).join(", ")}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="softline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                Change
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={cn(
              "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-secondary/30",
            )}
          >
            <ImagePlus className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold">Choose images or drag &amp; drop</span>
            <span className="text-xs text-muted-foreground">
              {IMAGE_GUIDELINES.gallery} · {UPLOAD_HINT}
            </span>
          </label>
        )}
        <input
          id={inputId}
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={syncFromInput}
          className={files.length > 0 ? "hidden" : "sr-only"}
        />
      </div>
    </div>
  );
}

function ImageDescriptionField({ image }: { image: Tables<"portfolio_images"> }) {
  const [value, setValue] = useState(image.alt_text ?? "");
  const dirty = value !== (image.alt_text ?? "");

  const save = useMutation({
    mutationFn: () => updateImageAltFn({ data: { id: image.id, altText: value } }),
    onSuccess: () => toast.success("Photo description saved"),
    onError: (error: Error) => toast.error(error.message || "Failed to save description"),
  });

  return (
    <div className="mt-1.5 space-y-1">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Describe this photo…"
        className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1 text-xs"
      />
      {dirty && (
        <Button
          type="button"
          variant="softline"
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save description"}
        </Button>
      )}
    </div>
  );
}

function ItemFormDialog({
  slug,
  item,
  services,
  onSaved,
}: {
  slug: string;
  item?: PortfolioItemWithImages;
  services: Tables<"services">[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("bridal");
  const [isPublished, setIsPublished] = useState(true);
  const [serviceId, setServiceId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<Tables<"portfolio_images">[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setCategory(item?.category ?? "bridal");
    setIsPublished(item?.is_published ?? true);
    setServiceId(item?.service_id ?? "");
    setExistingImages(item?.images ?? []);
    setNewFiles([]);
  }, [open, item]);

  const removeExistingImage = useMutation({
    mutationFn: async (image: Tables<"portfolio_images">) => {
      setRemovingId(image.id);
      const storagePath = await deleteImageFn({ data: { id: image.id } });
      if (storagePath) await deletePortfolioMedia(storagePath);
    },
    onSuccess: (_, image) => {
      setExistingImages((prev) => prev.filter((img) => img.id !== image.id));
    },
    onError: (error: Error) => toast.error(error.message || "Failed to remove image"),
    onSettled: () => setRemovingId(null),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!item && newFiles.length === 0) throw new Error("Select at least one image.");
      setUploading(true);
      try {
        if (item) {
          await updateItemFn({
            data: { id: item.id, title, category, isPublished, serviceId: serviceId || null },
          });
          if (newFiles.length > 0) {
            const images: NewGalleryImage[] = [];
            for (const file of newFiles) {
              const storagePath = await uploadPortfolioMedia(slug, "gallery", file);
              // No default alt text on upload — leaving it unset lets the
              // public page's title+category fallback (src/lib/media-alt-text.ts)
              // generate a more useful description than the bare title until
              // the beautician writes a real "Photo description".
              images.push({ storagePath });
            }
            await addImagesFn({ data: { itemId: item.id, images } });
          }
        } else {
          const images: NewGalleryImage[] = [];
          for (const file of newFiles) {
            const storagePath = await uploadPortfolioMedia(slug, "gallery", file);
            images.push({ storagePath, altText: title });
          }
          await createItemFn({
            data: { title, category, images, isPublished, serviceId: serviceId || null },
          });
        }
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      toast.success(item ? "Gallery item updated" : "Gallery item added");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save gallery item"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {item ? (
          <Button variant="softline" size="sm">
            Edit
          </Button>
        ) : (
          <Button variant="hero" size="sm">
            Add item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit gallery item" : "Add gallery item"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="block text-sm font-medium">
            Title
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1"
            />
          </label>
          <label className="block text-sm font-medium">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Related service
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">No specific service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Link this work to a service so it can appear on that service page.
            </span>
          </label>

          {item && existingImages.length > 0 && (
            <div>
              <p className="text-sm font-medium">Current images</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Describe what is visible in the photo. This helps accessibility and search engines
                understand your work.
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {existingImages.map((img) => (
                  <div key={img.id} className="group relative">
                    <img
                      src={buildPublicMediaUrl(img.storage_path)}
                      alt={img.alt_text ?? ""}
                      className="aspect-square w-full rounded-lg border border-border object-cover"
                    />
                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                      Photo description
                    </p>
                    <ImageDescriptionField image={img} />
                    <button
                      type="button"
                      onClick={() => removeExistingImage.mutate(img)}
                      disabled={removingId === img.id}
                      aria-label="Remove image"
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-destructive disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ImageDropzone
            files={newFiles}
            onFilesChange={setNewFiles}
            label={item ? "Add more images (optional)" : "Images"}
          />

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Show on my portfolio</p>
              <p className="text-xs text-muted-foreground">
                {isPublished
                  ? "Visible to visitors on your public page."
                  : "Hidden from your public page. Still saved and editable here."}
              </p>
            </div>
            <Switch
              checked={isPublished}
              onCheckedChange={setIsPublished}
              aria-label="Show on my portfolio"
            />
          </div>

          <Button
            type="submit"
            variant="hero"
            className="w-full"
            disabled={uploading || save.isPending}
          >
            {uploading || save.isPending ? "Saving…" : item ? "Save changes" : "Add item"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const VISIBILITY_FILTERS = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
] as const;
type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number]["value"];

function GalleryPage() {
  const queryClient = useQueryClient();
  const slugQuery = useQuery({ queryKey: ["own-slug"], queryFn: () => getSlugFn() });
  const itemsQuery = useQuery({
    queryKey: ["own-gallery"],
    queryFn: () => listItemsFn(),
    enabled: !!slugQuery.data,
  });
  // Phase 3F.8A.1 — a dedicated key, not "own-services": that key is also
  // used by /dashboard/services, which (since Phase 3F.8) returns a
  // differently-shaped { services, readinessContext } object rather than a
  // flat array. React Query's cache is global for the whole SPA session
  // (one QueryClient — see router.tsx), so sharing a key across
  // differently-shaped queries let this route's `services.map(...)` crash
  // whenever the Services page had populated the cache first. Before &
  // After intentionally shares THIS key (same shape, same data) so the two
  // routes' dropdowns cheaply reuse one fetch — the bug was never that
  // sharing, only sharing with a shape that had since diverged.
  const servicesQuery = useQuery({
    queryKey: ["own-services-for-linking"],
    queryFn: () => listServicesFn(),
  });
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  // Phase 3F.8A.1 §5/§9 — Related service is optional supporting data; a
  // malformed/unexpected response must degrade the dropdown, never crash
  // the whole route. Array.isArray guards against any non-array shape, not
  // just null/undefined.
  const services = Array.isArray(servicesQuery.data) ? servicesQuery.data : [];
  const serviceNameById = new Map(services.map((s) => [s.id, s.name]));

  const remove = useMutation({
    mutationFn: async (item: PortfolioItemWithImages) => {
      const images = await deleteItemFn({ data: { id: item.id } });
      await Promise.all(images.map((img) => deletePortfolioMedia(img.storage_path)));
    },
    onSuccess: () => {
      toast.success("Gallery item deleted");
      queryClient.invalidateQueries({ queryKey: ["own-gallery"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete gallery item"),
  });

  const items = itemsQuery.data ?? [];
  const filteredItems = items.filter((item) => {
    if (visibilityFilter === "published") return item.is_published;
    if (visibilityFilter === "hidden") return !item.is_published;
    return true;
  });
  const onSaved = () => queryClient.invalidateQueries({ queryKey: ["own-gallery"] });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Gallery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Portfolio images shown on your public page.
          </p>
        </div>
        {slugQuery.data && (
          <ItemFormDialog slug={slugQuery.data} services={services} onSaved={onSaved} />
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-4 flex gap-1.5">
          {VISIBILITY_FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              variant={visibilityFilter === f.value ? "softline" : "ghost"}
              size="sm"
              onClick={() => setVisibilityFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {itemsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-soft">
            No gallery items yet — add your first one above.
          </p>
        ) : filteredItems.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-soft">
            No {visibilityFilter} items.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
              >
                <div className="relative">
                  {item.images[0] && (
                    <img
                      src={buildPublicMediaUrl(item.images[0].storage_path)}
                      alt={item.title ?? ""}
                      className="aspect-square w-full object-cover"
                    />
                  )}
                  {!item.is_published && (
                    <Badge variant="secondary" className="absolute left-2 top-2">
                      Hidden
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.category} · {item.images.length} image
                      {item.images.length === 1 ? "" : "s"}
                    </p>
                    {item.service_id && serviceNameById.get(item.service_id) && (
                      <p className="mt-0.5 text-[11px] font-medium text-primary">
                        Linked: {serviceNameById.get(item.service_id)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {slugQuery.data && (
                      <ItemFormDialog
                        slug={slugQuery.data}
                        item={item}
                        services={services}
                        onSaved={onSaved}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Delete "${item.title}"?`)) remove.mutate(item);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
