// Shared presentational Service Areas list + add/edit dialog — extracted
// from the beautician's own /dashboard/areas page (previously inline
// there) so the exact same CRUD UI/validation can be reused by the Admin
// per-beautician workspace without duplicating it. Callers own all
// data-fetching/mutation wiring and pass data + callbacks as props — no
// direct server-fn calls here, matching the established *Manager pattern.
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ServiceAreaInput } from "@/data/dashboard/service-areas.server";
import type { Tables } from "@/integrations/supabase/types";

const areaSchema = z.object({
  area_name: z.string().min(1, "Required"),
  city: z.string().min(1, "Required"),
  state: z.string().min(1, "Required"),
  postal_code: z.string(),
  is_primary: z.boolean(),
});
type AreaFormValues = z.infer<typeof areaSchema>;
const AREA_EMPTY: AreaFormValues = {
  area_name: "",
  city: "",
  state: "",
  postal_code: "",
  is_primary: false,
};

function AreaFormDialog({
  area,
  isSaving,
  onSubmit,
}: {
  area?: Tables<"service_areas">;
  isSaving: boolean;
  onSubmit: (values: ServiceAreaInput) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<AreaFormValues>({
    resolver: zodResolver(areaSchema),
    defaultValues: AREA_EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      area
        ? {
            area_name: area.area_name ?? "",
            city: area.city,
            state: area.state ?? "",
            postal_code: area.postal_code ?? "",
            is_primary: area.is_primary,
          }
        : AREA_EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, area]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      area_name: values.area_name,
      city: values.city,
      state: values.state || null,
      postal_code: values.postal_code || null,
      is_primary: values.is_primary,
    });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {area ? (
          <Button variant="softline" size="sm">
            Edit
          </Button>
        ) : (
          <Button variant="hero">+ Add service area</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{area ? "Edit service area" : "Add service area"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4">
            <FormField
              control={form.control}
              name="area_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Area / Locality
                    <span className="text-destructive" aria-hidden="true">
                      {" "}
                      *
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Satellite" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      City
                      <span className="text-destructive" aria-hidden="true">
                        {" "}
                        *
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Ahmedabad" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      State
                      <span className="text-destructive" aria-hidden="true">
                        {" "}
                        *
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Gujarat" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="postal_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PIN code (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="380015" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" variant="hero" className="w-full" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function ServiceAreasManager({
  areas,
  isLoading,
  isSaving,
  onCreate,
  onUpdate,
  onDelete,
}: {
  areas: Tables<"service_areas">[];
  isLoading: boolean;
  isSaving: boolean;
  onCreate: (input: ServiceAreaInput) => Promise<void> | void;
  onUpdate: (id: string, input: ServiceAreaInput) => Promise<void> | void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            Areas served
          </CardTitle>
          <CardDescription>The specific localities/areas covered.</CardDescription>
        </div>
        <AreaFormDialog isSaving={isSaving} onSubmit={(values) => onCreate(values)} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : areas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 p-6 text-center">
            <p className="text-sm font-medium">No service areas added yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the areas served so clients know where services are provided.
            </p>
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <li
                key={area.id}
                className="flex items-center gap-2 rounded-full border border-border bg-secondary/20 py-1.5 pr-1.5 pl-3.5 text-sm"
              >
                <span className="font-medium">{area.area_name || area.city}</span>
                {area.area_name && (
                  <span className="text-xs text-muted-foreground">{area.city}</span>
                )}
                {area.is_primary && (
                  <Badge variant="secondary" className="text-[10px]">
                    Primary
                  </Badge>
                )}
                <span className="flex items-center gap-1">
                  <AreaFormDialog
                    area={area}
                    isSaving={isSaving}
                    onSubmit={(values) => onUpdate(area.id, values)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    aria-label={`Remove ${area.area_name || area.city} from service areas`}
                    onClick={() => {
                      if (
                        window.confirm(`Remove ${area.area_name || area.city} from service areas?`)
                      ) {
                        onDelete(area.id);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
