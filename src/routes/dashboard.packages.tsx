import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Gift, Star } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
    await updatePackage(context.supabase, id, updates);
  });

const deletePackageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deletePackage } = await import("@/data/dashboard/packages.server");
    await deletePackage(context.supabase, data.id);
  });

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

function PackageFormDialog({ pkg, onSaved }: { pkg?: Tables<"packages">; onSaved: () => void }) {
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
  }, [open, pkg]);

  const save = useMutation({
    mutationFn: (values: PackageFormValues) => {
      const payload: PackageInput = { ...values, inclusions: toInclusionsArray(values.inclusions) };
      return pkg
        ? updatePackageFn({ data: { id: pkg.id, ...payload } })
        : createPackageFn({ data: payload });
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
                    <FormLabel className="!mt-0">Published (visible on my portfolio)</FormLabel>
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

function PackagesPage() {
  const queryClient = useQueryClient();
  const packagesQuery = useQuery({ queryKey: ["own-packages"], queryFn: () => listPackagesFn() });

  const remove = useMutation({
    mutationFn: (id: string) => deletePackageFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Package deleted");
      queryClient.invalidateQueries({ queryKey: ["own-packages"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete package"),
  });

  const packages = packagesQuery.data ?? [];
  const onSaved = () => queryClient.invalidateQueries({ queryKey: ["own-packages"] });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Packages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bundled offerings shown on your portfolio.
          </p>
        </div>
        <PackageFormDialog onSaved={onSaved} />
      </div>

      <div className="mt-6">
        {packagesQuery.isLoading ? (
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
                  Create packages to showcase your bundled services and pricing.
                </p>
              </div>
              <PackageFormDialog onSaved={onSaved} />
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
                    <PackageFormDialog pkg={pkg} onSaved={onSaved} />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${pkg.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete "${pkg.name}"?`)) remove.mutate(pkg.id);
                      }}
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
