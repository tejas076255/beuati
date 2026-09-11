// Phase 5.2D — shared Before & After manager UI, extracted from
// src/routes/dashboard.before-after.tsx so both the beautician's own
// /dashboard/before-after page and the Master Admin Console's
// /admin/beauticians/$slug Before & After section render the identical
// presentational component. Nothing here knows whether it's being driven
// by the beautician's own session or an admin's explicit-target session —
// it only receives data and calls the onCreate/onUpdateItem/onReplaceImage/
// onUpdateImageAlt/onDeleteItem callbacks it's given, matching the exact
// "context/config/loader" pattern already established for ServicesManager
// (5.2A), ProfileManager (5.2B), and GalleryManager (5.2C). No behavior
// change from the original dashboard.before-after.tsx — this is a
// mechanical extraction. This is NOT ordinary Gallery: each item is a
// semantic before/after PAIR, both images required at creation time
// (preserved unchanged below), never flattened into two unrelated images.
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, ImagePlus, SplitSquareHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { PLAN_LABELS, type PlanCapacity, type PortfolioPlan } from "@/lib/plan-limits";
import { PlanCapacityBar } from "@/components/shared/plan-capacity-notice";
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
import type {
  BeforeAfterItemUpdate,
  BeforeAfterItemWithImages,
  BeforeAfterPairInput,
} from "@/data/dashboard/before-after.server";
import type { Tables } from "@/integrations/supabase/types";

/** Single-image dropzone that doubles as the edit-in-place control: shows
 * the existing image (if any) until the user actively picks a replacement,
 * so opening the edit dialog never itself discards an existing image. */
function SingleImageDropzone({
  label,
  existingUrl,
  file,
  onFileChange,
  required,
}: {
  label: string;
  existingUrl?: string | null;
  file: File | null;
  onFileChange: (file: File | null) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useRef(`ba-image-${Math.random().toString(36).slice(2)}`).current;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileChange(e.target.files?.[0] ?? null);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped || !inputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(dropped);
    inputRef.current.files = dt.files;
    onFileChange(dropped);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const pasted = items[i].getAsFile();
        if (pasted) {
          e.preventDefault();
          onFileChange(pasted);
          toast.success("Pasted image added!");
          break;
        }
      }
    }
  };

  const handleUndo = () => {
    if (inputRef.current) inputRef.current.value = "";
    onFileChange(null);
  };

  const displayUrl = previewUrl ?? existingUrl ?? null;

  return (
    <div onPaste={handlePaste} tabIndex={0} className="outline-none">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-1">
        {displayUrl ? (
          <div className="relative overflow-hidden rounded-lg border border-border">
            <img src={displayUrl} alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/55 px-3 py-2 backdrop-blur-sm">
              <span className="truncate text-xs font-medium text-white">
                {file ? file.name : "Current image"}
              </span>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-foreground hover:bg-white"
                >
                  Change
                </button>
                {file && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-foreground hover:bg-white"
                  >
                    Undo
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-secondary/30 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
          >
            <ImagePlus className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold">Choose image, drag &amp; drop or paste (Ctrl+V)</span>
            <span className="text-xs text-muted-foreground">
              {IMAGE_GUIDELINES["before-after"]} · {UPLOAD_HINT}
            </span>
          </label>
        )}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
          required={required && !displayUrl}
          className="sr-only"
        />
      </div>
    </div>
  );
}

function ImageDescriptionField({
  label,
  image,
  onSave,
}: {
  label: string;
  image: Tables<"before_after_images">;
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
    <div className="mt-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-[11px] text-muted-foreground">
        Describe what is visible in the photo. This helps accessibility and search engines
        understand this work.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Describe this photo…"
        className="mt-1 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1 text-xs"
      />
      {dirty && (
        <Button
          type="button"
          variant="softline"
          size="sm"
          className="mt-1 h-6 px-2 text-[11px]"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save description"}
        </Button>
      )}
    </div>
  );
}

function PairFormDialog({
  uploadSlug,
  item,
  services,
  onCreate,
  onUpdateItem,
  onReplaceImage,
  onUpdateImageAlt,
  onSaved,
  addDisabledReason,
}: {
  uploadSlug: string;
  item?: BeforeAfterItemWithImages;
  services: Tables<"services">[];
  onCreate: (input: BeforeAfterPairInput) => Promise<void>;
  onUpdateItem: (id: string, updates: BeforeAfterItemUpdate) => Promise<void>;
  onReplaceImage: (imageId: string, storagePath: string) => Promise<string | null>;
  onUpdateImageAlt: (imageId: string, altText: string) => Promise<void>;
  onSaved: () => void;
  addDisabledReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [serviceId, setServiceId] = useState<string>("");
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const beforeImage = item?.images.find((i) => i.image_type === "before");
  const afterImage = item?.images.find((i) => i.image_type === "after");

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setEventType(item?.event_type ?? "");
    setLocation(item?.location ?? "");
    setDescription(item?.description ?? "");
    setIsPublished(item?.is_published ?? true);
    setServiceId(item?.service_id ?? "");
    setBeforeFile(null);
    setAfterFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!item && (!beforeFile || !afterFile)) {
        throw new Error("Select both a before and an after image.");
      }
      setUploading(true);
      try {
        if (item) {
          await onUpdateItem(item.id, {
            title,
            eventType,
            location,
            description,
            isPublished,
            serviceId: serviceId || null,
          });

          if (beforeFile && beforeImage) {
            const path = await uploadPortfolioMedia(uploadSlug, "before-after", beforeFile);
            let oldPath: string | null;
            try {
              oldPath = await onReplaceImage(beforeImage.id, path);
            } catch (error) {
              // NEW uploaded but the DB never came to reference it — delete
              // NEW, leave OLD (and the DB row, which still points at OLD)
              // completely untouched. Best-effort: never mask the original
              // mutation error with a cleanup failure.
              await deletePortfolioMedia(path).catch(() => {});
              throw error;
            }
            if (oldPath) await deletePortfolioMedia(oldPath);
          }
          if (afterFile && afterImage) {
            const path = await uploadPortfolioMedia(uploadSlug, "before-after", afterFile);
            let oldPath: string | null;
            try {
              oldPath = await onReplaceImage(afterImage.id, path);
            } catch (error) {
              await deletePortfolioMedia(path).catch(() => {});
              throw error;
            }
            if (oldPath) await deletePortfolioMedia(oldPath);
          }
        } else {
          // Promise.allSettled (not Promise.all) so a rejection on one side
          // never discards the other side's successful result — the prior
          // Promise.all shape made a successful upload's path unrecoverable
          // the instant its sibling rejected (QA-1L-D1 §15).
          const [beforeResult, afterResult] = await Promise.allSettled([
            uploadPortfolioMedia(uploadSlug, "before-after", beforeFile as File),
            uploadPortfolioMedia(uploadSlug, "before-after", afterFile as File),
          ]);

          const beforeStoragePath = beforeResult.status === "fulfilled" ? beforeResult.value : null;
          const afterStoragePath = afterResult.status === "fulfilled" ? afterResult.value : null;

          if (beforeResult.status === "rejected" || afterResult.status === "rejected") {
            // Delete whichever side actually succeeded — the other side
            // never uploaded anything, so there's nothing to delete for it.
            await Promise.allSettled(
              [beforeStoragePath, afterStoragePath]
                .filter((path): path is string => Boolean(path))
                .map((path) => deletePortfolioMedia(path).catch(() => {})),
            );
            const failure =
              beforeResult.status === "rejected"
                ? beforeResult.reason
                : afterResult.status === "rejected"
                  ? afterResult.reason
                  : null;
            throw failure instanceof Error
              ? failure
              : new Error("Failed to upload before/after images.");
          }

          try {
            await onCreate({
              title,
              eventType,
              location,
              description,
              beforeStoragePath: beforeStoragePath as string,
              afterStoragePath: afterStoragePath as string,
              isPublished,
              serviceId: serviceId || null,
            });
          } catch (error) {
            // Both uploads succeeded but DB persistence failed — delete
            // both, leaving no orphaned objects and no parent/child rows
            // (createBeforeAfterPairForProfile self-compensates a
            // parent-created/children-failed split before this ever throws).
            await Promise.allSettled([
              deletePortfolioMedia(beforeStoragePath as string).catch(() => {}),
              deletePortfolioMedia(afterStoragePath as string).catch(() => {}),
            ]);
            throw error;
          }
        }
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      toast.success(item ? "Before/after pair updated" : "Before/after pair added");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save before/after pair"),
  });

  if (!item && addDisabledReason) {
    return (
      <Button variant="hero" disabled title={addDisabledReason}>
        Add Before &amp; After
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
          <Button variant="hero">Add Before &amp; After</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit before/after pair" : "Add before & after"}</DialogTitle>
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Category
              <Input
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                placeholder="Bridal, Party, HD…"
                className="mt-1"
              />
            </label>
            <label className="block text-sm font-medium">
              Location
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <SingleImageDropzone
                label="Before image"
                existingUrl={beforeImage ? buildPublicMediaUrl(beforeImage.storage_path) : null}
                file={beforeFile}
                onFileChange={setBeforeFile}
                required={!item}
              />
              {beforeImage && (
                <ImageDescriptionField
                  label="Photo description"
                  image={beforeImage}
                  onSave={(altText) => onUpdateImageAlt(beforeImage.id, altText)}
                />
              )}
            </div>
            <div>
              <SingleImageDropzone
                label="After image"
                existingUrl={afterImage ? buildPublicMediaUrl(afterImage.storage_path) : null}
                file={afterFile}
                onFileChange={setAfterFile}
                required={!item}
              />
              {afterImage && (
                <ImageDescriptionField
                  label="Photo description"
                  image={afterImage}
                  onSave={(altText) => onUpdateImageAlt(afterImage.id, altText)}
                />
              )}
            </div>
          </div>

          <label className="block text-sm font-medium">
            Description (optional)
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1"
            />
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
              Link this transformation to a service so it can appear on that service page.
            </span>
          </label>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Show this transformation on the portfolio</p>
              <p className="text-xs text-muted-foreground">
                {isPublished
                  ? "Visible to visitors on the public page."
                  : "Hidden from the public page. Still saved and editable here."}
              </p>
            </div>
            <Switch
              checked={isPublished}
              onCheckedChange={setIsPublished}
              aria-label="Show this transformation on the portfolio"
            />
          </div>

          <Button
            type="submit"
            variant="hero"
            className="w-full"
            disabled={uploading || save.isPending}
          >
            {uploading || save.isPending ? "Saving…" : item ? "Save changes" : "Add pair"}
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
 * Shared Before & After manager — the ONE component both
 * /dashboard/before-after and the admin workspace's Before & After section
 * render. Receives its data and mutation callbacks as props; has no idea
 * whether it's driven by the beautician's own session or an admin's
 * explicit-target session.
 */
export function BeforeAfterManager({
  title = "Before & After",
  subtitle = "Transformation results shown on the public page.",
  items,
  services,
  isLoading,
  uploadSlug,
  onCreate,
  onUpdateItem,
  onReplaceImage,
  onUpdateImageAlt,
  onDeleteItem,
  onSaved,
  capacity,
  plan,
}: {
  title?: string;
  subtitle?: string;
  items: BeforeAfterItemWithImages[];
  services: Tables<"services">[];
  isLoading: boolean;
  uploadSlug: string;
  onCreate: (input: BeforeAfterPairInput) => Promise<void>;
  onUpdateItem: (id: string, updates: BeforeAfterItemUpdate) => Promise<void>;
  onReplaceImage: (imageId: string, storagePath: string) => Promise<string | null>;
  onUpdateImageAlt: (imageId: string, altText: string) => Promise<void>;
  onDeleteItem: (item: BeforeAfterItemWithImages) => Promise<Tables<"before_after_images">[]>;
  onSaved: () => void;
  capacity?: PlanCapacity | undefined;
  plan?: PortfolioPlan | undefined;
}) {
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const addDisabledReason =
    capacity?.atLimit && plan
      ? `You've reached your ${PLAN_LABELS[plan]} plan's limit of ${capacity.limit} before & after pairs. Upgrade for more capacity.`
      : null;
  const serviceNameById = new Map(services.map((s) => [s.id, s.name]));

  const remove = useMutation({
    mutationFn: async (item: BeforeAfterItemWithImages) => {
      const images = await onDeleteItem(item);
      await Promise.all(images.map((img) => deletePortfolioMedia(img.storage_path)));
    },
    onSuccess: () => {
      toast.success("Before/after pair deleted");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete pair"),
  });

  const filteredItems = items.filter((item) => {
    if (visibilityFilter === "published") return item.is_published;
    if (visibilityFilter === "hidden") return !item.is_published;
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <PairFormDialog
          uploadSlug={uploadSlug}
          services={services}
          onCreate={onCreate}
          onUpdateItem={onUpdateItem}
          onReplaceImage={onReplaceImage}
          onUpdateImageAlt={onUpdateImageAlt}
          onSaved={onSaved}
          addDisabledReason={addDisabledReason}
        />
      </div>

      {capacity && plan && (
        <div className="mt-3">
          <PlanCapacityBar label="Before & After pairs" plan={plan} capacity={capacity} />
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
          <Card className="border-dashed border-border/70 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <SplitSquareHorizontal className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">No transformations yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Add the first Before &amp; After result to showcase this work and build client
                  confidence.
                </p>
              </div>
              <PairFormDialog
                uploadSlug={uploadSlug}
                services={services}
                onCreate={onCreate}
                onUpdateItem={onUpdateItem}
                onReplaceImage={onReplaceImage}
                onUpdateImageAlt={onUpdateImageAlt}
                onSaved={onSaved}
              />
            </CardContent>
          </Card>
        ) : filteredItems.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-soft">
            No {visibilityFilter} transformations.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => {
              const before = item.images.find((i) => i.image_type === "before");
              const after = item.images.find((i) => i.image_type === "after");
              return (
                <Card key={item.id} className="overflow-hidden border-border/70 shadow-sm">
                  <div className="relative grid grid-cols-2">
                    {!item.is_published && (
                      <Badge
                        variant="secondary"
                        className="absolute left-1/2 top-2 z-10 -translate-x-1/2 shadow-sm"
                      >
                        Hidden
                      </Badge>
                    )}
                    {before && (
                      <div className="relative">
                        <img
                          src={buildPublicMediaUrl(before.storage_path)}
                          alt={`${item.title ?? "Transformation"} — before`}
                          className="aspect-square w-full object-cover"
                        />
                        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-white uppercase">
                          Before
                        </span>
                      </div>
                    )}
                    {after && (
                      <div className="relative">
                        <img
                          src={buildPublicMediaUrl(after.storage_path)}
                          alt={`${item.title ?? "Transformation"} — after`}
                          className="aspect-square w-full object-cover"
                        />
                        <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold tracking-widest text-primary-foreground uppercase">
                          After
                        </span>
                      </div>
                    )}
                    <span
                      className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm"
                      aria-hidden="true"
                    >
                      <ArrowRight className="h-3.5 w-3.5 text-primary" />
                    </span>
                  </div>
                  <CardContent className="flex items-center justify-between gap-2 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.event_type, item.location].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {item.service_id && serviceNameById.get(item.service_id) && (
                        <p className="truncate text-[11px] font-medium text-primary">
                          Linked: {serviceNameById.get(item.service_id)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <PairFormDialog
                        uploadSlug={uploadSlug}
                        item={item}
                        services={services}
                        onCreate={onCreate}
                        onUpdateItem={onUpdateItem}
                        onReplaceImage={onReplaceImage}
                        onUpdateImageAlt={onUpdateImageAlt}
                        onSaved={onSaved}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${item.title ?? "this before/after pair"}`}
                        onClick={() => {
                          if (window.confirm(`Delete "${item.title}"?`)) remove.mutate(item);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
