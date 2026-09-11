// Phase 5.2C — shared Gallery manager UI, extracted from
// src/routes/dashboard.gallery.tsx so both the beautician's own
// /dashboard/gallery page and the Master Admin Console's
// /admin/beauticians/$slug Gallery section render the identical
// presentational component. Nothing here knows whether it's being driven
// by the beautician's own session or an admin's explicit-target session —
// it only receives data and calls the onCreate/onUpdateItem/onAddImages/
// onDeleteImage/onUpdateImageAlt/onDeleteItem callbacks it's given,
// matching the exact "context/config/loader" pattern already established
// for ServicesManager (Phase 5.2A) and ProfileManager (Phase 5.2B). No
// behavior change from the original dashboard.gallery.tsx — this is a
// mechanical extraction. Storage upload/delete (client-side, using the
// caller's own authenticated session) stays inside this component, driven
// by the `uploadSlug` prop — the admin route passes the SELECTED
// professional's own slug, never the admin's own, so uploads always land
// under profiles/{uploadSlug}/gallery/..., matching whichever professional
// is actually being edited (Phase 5.2C §9).
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  uploadPortfolioMedia,
  buildPublicMediaUrl,
  deletePortfolioMedia,
  IMAGE_GUIDELINES,
  UPLOAD_HINT,
} from "@/lib/storage-upload";
import { PLAN_LABELS, type PlanCapacity, type PortfolioPlan } from "@/lib/plan-limits";
import { PlanCapacityBar } from "@/components/shared/plan-capacity-notice";
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
import type {
  GalleryItemInput,
  NewGalleryImage,
  PortfolioItemUpdate,
  PortfolioItemWithImages,
} from "@/data/dashboard/gallery.server";
import type { Tables } from "@/integrations/supabase/types";

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

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      onFilesChange([...files, ...pastedFiles]);
      toast.success(`${pastedFiles.length} pasted image(s) added!`);
    }
  };

  const handleRemove = () => {
    if (fileRef.current) fileRef.current.value = "";
    onFilesChange([]);
  };

  return (
    <div onPaste={handlePaste} tabIndex={0} className="outline-none">
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
            <span className="text-sm font-semibold">Choose images, drag &amp; drop or paste (Ctrl+V)</span>
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

function ImageDescriptionField({
  image,
  onSave,
}: {
  image: Tables<"portfolio_images">;
  onSave: (altText: string) => Promise<void>;
}) {
  const [value, setValue] = useState(image.alt_text ?? "");
  const dirty = value !== (image.alt_text ?? "");

  const save = useMutation({
    mutationFn: () => onSave(value),
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
  uploadSlug,
  item,
  services,
  onCreate,
  onUpdateItem,
  onAddImages,
  onDeleteImage,
  onUpdateImageAlt,
  onSaved,
  addDisabledReason,
}: {
  uploadSlug: string;
  item?: PortfolioItemWithImages;
  services: Tables<"services">[];
  onCreate: (input: GalleryItemInput) => Promise<void>;
  onUpdateItem: (id: string, updates: PortfolioItemUpdate) => Promise<void>;
  onAddImages: (itemId: string, images: NewGalleryImage[]) => Promise<void>;
  onDeleteImage: (id: string) => Promise<string | null>;
  onUpdateImageAlt: (id: string, altText: string) => Promise<void>;
  onSaved: () => void;
  /** Only meaningful for a NEW item (no `item`) — the gallery photo cap is
   * already fully used, so starting a brand-new item (which requires at
   * least one photo) would be rejected anyway. Editing/adding photos to an
   * EXISTING item still goes through the dialog — the server-side check
   * (assertOwnerCanAddGalleryPhotos) surfaces a clear error via the
   * existing onError toast if that would also exceed the cap. */
  addDisabledReason?: string | null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const removeExistingImage = useMutation({
    mutationFn: async (image: Tables<"portfolio_images">) => {
      setRemovingId(image.id);
      const storagePath = await onDeleteImage(image.id);
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
      // Attempt-scoped only — tracks paths uploaded during THIS save call,
      // never across save attempts or the dialog's open lifetime (unlike
      // Videos' pending-thumbnail ref). Compensated in the catch below if
      // anything after the upload(s) fails; left untouched on success.
      const uploadedThisAttempt: string[] = [];
      try {
        try {
          if (item) {
            await onUpdateItem(item.id, {
              title,
              category,
              isPublished,
              serviceId: serviceId || null,
            });
            if (newFiles.length > 0) {
              const images: NewGalleryImage[] = [];
              for (const file of newFiles) {
                const storagePath = await uploadPortfolioMedia(uploadSlug, "gallery", file);
                uploadedThisAttempt.push(storagePath);
                // No default alt text on upload — leaving it unset lets the
                // public page's title+category fallback (src/lib/media-alt-text.ts)
                // generate a more useful description than the bare title until
                // a real "Photo description" is written.
                images.push({ storagePath });
              }
              await onAddImages(item.id, images);
            }
          } else {
            const images: NewGalleryImage[] = [];
            for (const file of newFiles) {
              const storagePath = await uploadPortfolioMedia(uploadSlug, "gallery", file);
              uploadedThisAttempt.push(storagePath);
              images.push({ storagePath, altText: title });
            }
            await onCreate({ title, category, images, isPublished, serviceId: serviceId || null });
          }
        } catch (error) {
          // Compensate whatever this failed attempt uploaded — never an
          // already-persisted image from a prior successful save. Best-effort:
          // a cleanup failure must not mask the original error.
          if (uploadedThisAttempt.length > 0) {
            await Promise.allSettled(
              uploadedThisAttempt.map((path) => deletePortfolioMedia(path).catch(() => {})),
            );
          }
          throw error;
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

  if (!item && addDisabledReason) {
    return (
      <Button variant="hero" size="sm" disabled title={addDisabledReason}>
        Add item
      </Button>
    );
  }

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
                understand this work.
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
                    <ImageDescriptionField
                      image={img}
                      onSave={(altText) => onUpdateImageAlt(img.id, altText)}
                    />
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
              <p className="text-sm font-medium">Show on portfolio</p>
              <p className="text-xs text-muted-foreground">
                {isPublished
                  ? "Visible to visitors on the public page."
                  : "Hidden from the public page. Still saved and editable here."}
              </p>
            </div>
            <Switch
              checked={isPublished}
              onCheckedChange={setIsPublished}
              aria-label="Show on portfolio"
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

/**
 * Shared Gallery manager — the ONE component both /dashboard/gallery and
 * the admin workspace's Gallery section render. Receives its data and
 * mutation callbacks as props; has no idea whether it's driven by the
 * beautician's own session or an admin's explicit-target session.
 */
export function GalleryManager({
  title = "Gallery",
  subtitle = "Portfolio images shown on the public page.",
  items,
  services,
  isLoading,
  uploadSlug,
  onCreate,
  onUpdateItem,
  onAddImages,
  onDeleteImage,
  onUpdateImageAlt,
  onDeleteItem,
  onSaved,
  capacity,
  plan,
}: {
  title?: string;
  subtitle?: string;
  items: PortfolioItemWithImages[];
  services: Tables<"services">[];
  isLoading: boolean;
  uploadSlug: string;
  onCreate: (input: GalleryItemInput) => Promise<void>;
  onUpdateItem: (id: string, updates: PortfolioItemUpdate) => Promise<void>;
  onAddImages: (itemId: string, images: NewGalleryImage[]) => Promise<void>;
  onDeleteImage: (id: string) => Promise<string | null>;
  onUpdateImageAlt: (id: string, altText: string) => Promise<void>;
  onDeleteItem: (item: PortfolioItemWithImages) => Promise<Tables<"portfolio_images">[]>;
  onSaved: () => void;
  /** Capacity is on PHOTOS, not gallery items — see plan-limits.ts. */
  capacity?: PlanCapacity | undefined;
  plan?: PortfolioPlan | undefined;
}) {
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const addDisabledReason =
    capacity?.atLimit && plan
      ? `You've reached your ${PLAN_LABELS[plan]} plan's limit of ${capacity.limit} gallery photos. Upgrade for more capacity.`
      : null;
  const serviceNameById = new Map(services.map((s) => [s.id, s.name]));

  const remove = useMutation({
    mutationFn: async (item: PortfolioItemWithImages) => {
      const images = await onDeleteItem(item);
      await Promise.all(images.map((img) => deletePortfolioMedia(img.storage_path)));
    },
    onSuccess: () => {
      toast.success("Gallery item deleted");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete gallery item"),
  });

  const filteredItems = items.filter((item) => {
    if (visibilityFilter === "published") return item.is_published;
    if (visibilityFilter === "hidden") return !item.is_published;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <ItemFormDialog
          uploadSlug={uploadSlug}
          services={services}
          onCreate={onCreate}
          onUpdateItem={onUpdateItem}
          onAddImages={onAddImages}
          onDeleteImage={onDeleteImage}
          onUpdateImageAlt={onUpdateImageAlt}
          onSaved={onSaved}
          addDisabledReason={addDisabledReason}
        />
      </div>

      {capacity && plan && (
        <div className="mt-3">
          <PlanCapacityBar label="Gallery photos" plan={plan} capacity={capacity} />
        </div>
      )}

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
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-soft">
            No gallery items yet — add the first one above.
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
                    <ItemFormDialog
                      uploadSlug={uploadSlug}
                      item={item}
                      services={services}
                      onCreate={onCreate}
                      onUpdateItem={onUpdateItem}
                      onAddImages={onAddImages}
                      onDeleteImage={onDeleteImage}
                      onUpdateImageAlt={onUpdateImageAlt}
                      onSaved={onSaved}
                    />
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
