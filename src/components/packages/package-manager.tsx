// Phase 5.2F — shared Packages manager UI, extracted from
// src/routes/dashboard.packages.tsx so both the beautician's own
// /dashboard/packages page and the Master Admin Console's
// /admin/beauticians/$slug Packages section render the identical
// presentational component. Nothing here knows whether it's being driven
// by the beautician's own session or an admin's explicit-target session —
// it only receives data and calls the onCreate/onUpdate/onDelete callbacks
// it's given, matching the exact "context/config/loader" pattern already
// established for ServicesManager (5.2A), ProfileManager (5.2B),
// GalleryManager (5.2C), BeforeAfterManager (5.2D), and VideoManager
// (5.2E). No behavior change from the original dashboard.packages.tsx —
// this is a mechanical extraction.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Gift, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import type { Tables } from "@/integrations/supabase/types";
import type { PackageInput } from "@/data/dashboard/packages.server";

const packageSchema = z.object({
  name: z.string().min(1, "Required"),
  price: z.coerce.number().min(0),
  price_type: z.enum(["fixed", "starting_from", "custom_quote"]),
  note: z.string(),
  best_for: z.string(),
  inclusions: z.string(),
  is_featured: z.boolean(),
  is_popular: z.boolean(),
  is_active: z.boolean(),
});
type PackageFormValues = z.infer<typeof packageSchema>;

const EMPTY: PackageFormValues = {
  name: "",
  price: 0,
  price_type: "fixed",
  note: "",
  best_for: "",
  inclusions: "",
  is_featured: false,
  is_popular: false,
  is_active: true,
};

const PRICE_TYPE_LABEL: Record<PackageFormValues["price_type"], string> = {
  fixed: "",
  starting_from: "From ",
  custom_quote: "Custom quote",
};

function formatPrice(price: number | null, priceType: PackageFormValues["price_type"]): string {
  if (priceType === "custom_quote") return "Custom quote";
  if (price == null) return "—";
  return `${PRICE_TYPE_LABEL[priceType]}₹${price.toLocaleString("en-IN")}`;
}

function toInclusionsArray(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function PackageFormDialog({
  pkg,
  onCreate,
  onUpdate,
  onSaved,
}: {
  pkg?: Tables<"packages">;
  onCreate: (input: PackageInput) => Promise<void>;
  onUpdate: (id: string, updates: Partial<PackageInput>) => Promise<void>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      pkg
        ? {
            name: pkg.name,
            price: pkg.price ?? 0,
            price_type: pkg.price_type,
            note: pkg.note ?? "",
            best_for: pkg.best_for ?? "",
            inclusions: (pkg.inclusions ?? []).join("\n"),
            is_featured: pkg.is_featured,
            is_popular: pkg.is_popular,
            is_active: pkg.is_active,
          }
        : EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg?.id]);

  const save = useMutation({
    mutationFn: (values: PackageFormValues) => {
      const payload: PackageInput = { ...values, inclusions: toInclusionsArray(values.inclusions) };
      return pkg ? onUpdate(pkg.id, payload) : onCreate(payload);
    },
    onSuccess: () => {
      toast.success(pkg ? "Package updated" : "Package added");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save package"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {pkg ? (
          <Button variant="softline" size="sm">
            Edit
          </Button>
        ) : (
          <Button variant="hero">Add package</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pkg ? "Edit package" : "Add package"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Package name
                    <span className="text-destructive" aria-hidden="true">
                      {" "}
                      *
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="best_for"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Best for (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Brides with one main function to cover" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="starting_from">Starting from</SelectItem>
                        <SelectItem value="custom_quote">Custom quote</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="inclusions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Included services / details (one per line)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder={"HD Bridal Makeup\nHair Styling\nDraping"}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Most popular, Single function, …" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Published (visible on the portfolio)</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_featured"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Featured</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_popular"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Most popular</FormLabel>
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" variant="hero" className="w-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shared Packages manager — the ONE component both /dashboard/packages
 * and the admin workspace's Packages section render. Receives its data
 * and mutation callbacks as props; has no idea whether it's driven by the
 * beautician's own session or an admin's explicit-target session.
 */
export function PackageManager({
  title = "Packages",
  subtitle = "Bundled offerings shown on the portfolio.",
  packages,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
  onSaved,
}: {
  title?: string;
  subtitle?: string;
  packages: Tables<"packages">[];
  isLoading: boolean;
  onCreate: (input: PackageInput) => Promise<void>;
  onUpdate: (id: string, updates: Partial<PackageInput>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      toast.success("Package deleted");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete package");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <PackageFormDialog onCreate={onCreate} onUpdate={onUpdate} onSaved={onSaved} />
      </div>

      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : packages.length === 0 ? (
          <Card className="border-dashed border-border/70 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Gift className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">No packages added yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Create packages to showcase bundled services and pricing.
                </p>
              </div>
              <PackageFormDialog onCreate={onCreate} onUpdate={onUpdate} onSaved={onSaved} />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="divide-y divide-border p-0">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{pkg.name}</p>
                      {pkg.is_popular && (
                        <Badge className="gap-1">
                          <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                          Most popular
                        </Badge>
                      )}
                      {pkg.is_featured && <Badge variant="secondary">Featured</Badge>}
                      {!pkg.is_active && <Badge variant="outline">Hidden</Badge>}
                    </div>
                    {pkg.best_for && (
                      <p className="mt-1 max-w-md text-sm text-muted-foreground">{pkg.best_for}</p>
                    )}
                    {pkg.inclusions && pkg.inclusions.length > 0 && (
                      <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                        {pkg.inclusions.join(" · ")}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-display text-sm font-semibold text-primary">
                        {formatPrice(pkg.price, pkg.price_type)}
                      </span>
                      {pkg.note && <span>{pkg.note}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <PackageFormDialog
                      pkg={pkg}
                      onCreate={onCreate}
                      onUpdate={onUpdate}
                      onSaved={onSaved}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${pkg.name}`}
                      disabled={deletingId === pkg.id}
                      onClick={() => void handleDelete(pkg.id, pkg.name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
