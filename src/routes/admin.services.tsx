import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TaxonomyInput } from "@/data/admin/taxonomy.server";

export const Route = createFileRoute("/admin/services")({
  component: ServicesPage,
});

const listCategoriesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listServiceCategories } = await import("@/data/admin/taxonomy.server");
    return listServiceCategories(context.supabase, context.userId);
  });

const createCategoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: TaxonomyInput) => data)
  .handler(async ({ context, data }) => {
    const { createServiceCategory } = await import("@/data/admin/taxonomy.server");
    await createServiceCategory(context.supabase, context.userId, data);
  });

const updateCategoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & Partial<TaxonomyInput>) => data)
  .handler(async ({ context, data }) => {
    const { updateServiceCategory } = await import("@/data/admin/taxonomy.server");
    const { id, ...updates } = data;
    await updateServiceCategory(context.supabase, context.userId, id, updates);
  });

const deleteCategoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteServiceCategory } = await import("@/data/admin/taxonomy.server");
    await deleteServiceCategory(context.supabase, context.userId, data.id);
  });

const listSpecializationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listSpecializations } = await import("@/data/admin/taxonomy.server");
    return listSpecializations(context.supabase, context.userId);
  });

const createSpecializationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: TaxonomyInput) => data)
  .handler(async ({ context, data }) => {
    const { createSpecialization } = await import("@/data/admin/taxonomy.server");
    await createSpecialization(context.supabase, context.userId, data);
  });

const updateSpecializationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & Partial<TaxonomyInput>) => data)
  .handler(async ({ context, data }) => {
    const { updateSpecialization } = await import("@/data/admin/taxonomy.server");
    const { id, ...updates } = data;
    await updateSpecialization(context.supabase, context.userId, id, updates);
  });

const deleteSpecializationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteSpecialization } = await import("@/data/admin/taxonomy.server");
    await deleteSpecialization(context.supabase, context.userId, data.id);
  });

type TaxonomyRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

const taxonomySchema = z.object({
  name: z.string().min(1, "Required"),
  description: z.string(),
  sort_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
});
type TaxonomyFormValues = z.infer<typeof taxonomySchema>;
const TAXONOMY_EMPTY: TaxonomyFormValues = {
  name: "",
  description: "",
  sort_order: 0,
  is_active: true,
};

function TaxonomyFormDialog({
  item,
  itemLabel,
  onSave,
  saving,
}: {
  item?: TaxonomyRow;
  itemLabel: string;
  onSave: (values: TaxonomyInput) => Promise<unknown>;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<TaxonomyFormValues>({
    resolver: zodResolver(taxonomySchema),
    defaultValues: TAXONOMY_EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      item
        ? {
            name: item.name,
            description: item.description ?? "",
            sort_order: item.sort_order,
            is_active: item.is_active,
          }
        : TAXONOMY_EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={item ? "softline" : "hero"} size="sm">
          {item ? "Edit" : `Add ${itemLabel}`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${itemLabel}` : `Add ${itemLabel}`}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              await onSave({
                name: values.name,
                description: values.description || null,
                sort_order: values.sort_order,
                is_active: values.is_active,
              });
              setOpen(false);
            })}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sort_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort order</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Active</FormLabel>
                </FormItem>
              )}
            />
            <Button type="submit" variant="hero" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function TaxonomyList({
  title,
  itemLabel,
  queryKey,
  listFn,
  createFn,
  updateFn,
  deleteFn,
}: {
  title: string;
  itemLabel: string;
  queryKey: string;
  listFn: () => Promise<TaxonomyRow[]>;
  createFn: (vars: { data: TaxonomyInput }) => Promise<void>;
  updateFn: (vars: { data: { id: string } & Partial<TaxonomyInput> }) => Promise<void>;
  deleteFn: (vars: { data: { id: string } }) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: [queryKey], queryFn: listFn });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [queryKey] });

  const create = useMutation({
    mutationFn: (input: TaxonomyInput) => createFn({ data: input }),
    onSuccess: () => {
      toast.success(`${itemLabel} added`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || `Failed to add ${itemLabel}`),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string } & Partial<TaxonomyInput>) => updateFn({ data: vars }),
    onSuccess: () => {
      toast.success(`${itemLabel} updated`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || `Failed to update ${itemLabel}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success(`${itemLabel} deleted`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || `Failed to delete ${itemLabel}`),
  });

  const items = listQuery.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between p-4">
        <h2 className="font-semibold">{title}</h2>
        <TaxonomyFormDialog
          itemLabel={itemLabel}
          saving={create.isPending}
          onSave={(values) => create.mutateAsync(values)}
        />
      </div>
      {listQuery.isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      ) : listQuery.isError ? (
        <p className="p-6 text-sm text-destructive">
          {(listQuery.error as Error).message || "Admin access required."}
        </p>
      ) : items.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">None yet — add the first one above.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <code className="text-xs">{item.slug}</code>
                </TableCell>
                <TableCell>{item.sort_order}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: item.id, is_active: !item.is_active })}
                  >
                    <Badge variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <TaxonomyFormDialog
                      item={item}
                      itemLabel={itemLabel}
                      saving={update.isPending}
                      onSave={(values) => update.mutateAsync({ id: item.id, ...values })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Delete "${item.name}"?`)) remove.mutate(item.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ServicesPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Services</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Reference categories and specializations used across every beautician's Services page.
      </p>

      <div className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <TaxonomyList
          title="Categories"
          itemLabel="category"
          queryKey="admin-service-categories"
          listFn={listCategoriesFn}
          createFn={createCategoryFn}
          updateFn={updateCategoryFn}
          deleteFn={deleteCategoryFn}
        />
        <TaxonomyList
          title="Specializations"
          itemLabel="specialization"
          queryKey="admin-specializations"
          listFn={listSpecializationsFn}
          createFn={createSpecializationFn}
          updateFn={updateSpecializationFn}
          deleteFn={deleteSpecializationFn}
        />
      </div>
    </div>
  );
}
