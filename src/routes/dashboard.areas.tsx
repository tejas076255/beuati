import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Banknote, Building2, Car, MapPin, Users } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { ServiceAreasManager } from "@/components/service-areas/service-areas-manager";
import type { ServiceAreaInput } from "@/data/dashboard/service-areas.server";
import type { AvailabilityInput } from "@/data/dashboard/availability.server";

export const Route = createFileRoute("/dashboard/areas")({
  component: AreasPage,
});

// ---------- service area list (immediate add/edit/delete) ----------

const listAreasFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnServiceAreas } = await import("@/data/dashboard/service-areas.server");
    return listOwnServiceAreas(context.supabase, context.userId);
  });

const createAreaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ServiceAreaInput) => data)
  .handler(async ({ context, data }) => {
    const { createServiceArea } = await import("@/data/dashboard/service-areas.server");
    await createServiceArea(context.supabase, context.userId, data);
  });

const updateAreaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & Partial<ServiceAreaInput>) => data)
  .handler(async ({ context, data }) => {
    const { updateServiceArea } = await import("@/data/dashboard/service-areas.server");
    const { id, ...updates } = data;
    await updateServiceArea(context.supabase, id, updates);
  });

const deleteAreaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteServiceArea } = await import("@/data/dashboard/service-areas.server");
    await deleteServiceArea(context.supabase, data.id);
  });

// ---------- primary location (read-only here — reuses Profile) ----------

const getProfileLocationFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnProfile } = await import("@/data/dashboard/profile.server");
    const profile = await getOwnProfile(context.supabase, context.userId);
    return {
      primary_city: profile.primary_city,
      locality: profile.locality,
      state: profile.state,
      address: profile.address,
    };
  });

// ---------- travel & appointment-type settings (reuses Availability's own
// table/columns — same single source of truth, not a duplicate setting) ----------

const getAvailabilityFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnAvailability } = await import("@/data/dashboard/availability.server");
    return getOwnAvailability(context.supabase, context.userId);
  });

const saveAvailabilityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: Partial<AvailabilityInput>) => data)
  .handler(async ({ context, data }) => {
    const { saveOwnAvailability } = await import("@/data/dashboard/availability.server");
    // Partial upsert — only the fields this page manages are sent, so the
    // Availability page's own settings (accepting_bookings, working hours,
    // etc.) are left untouched by a save made here.
    await saveOwnAvailability(context.supabase, context.userId, data as AvailabilityInput);
  });

const APPOINTMENT_TYPES = [
  { value: "studio", label: "At my studio", icon: Building2 },
  { value: "client_location", label: "At the client's location", icon: Users },
  { value: "both", label: "Both", icon: MapPin },
] as const;

const travelSchema = z.object({
  appointment_type: z.enum(["studio", "client_location", "both"]),
  travel_available: z.boolean(),
  travel_radius_km: z.string(),
  travel_charge_enabled: z.boolean(),
  travel_charge_type: z.enum(["fixed", "per_km", "quote"]),
  travel_charge_amount: z.string(),
});
type TravelFormValues = z.infer<typeof travelSchema>;

const TRAVEL_EMPTY: TravelFormValues = {
  appointment_type: "both",
  travel_available: false,
  travel_radius_km: "",
  travel_charge_enabled: false,
  travel_charge_type: "quote",
  travel_charge_amount: "",
};

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function TravelSettingsCard() {
  const queryClient = useQueryClient();
  const availabilityQuery = useQuery({
    queryKey: ["own-availability"],
    queryFn: () => getAvailabilityFn(),
  });
  const [ready, setReady] = useState(false);

  const form = useForm<TravelFormValues>({
    resolver: zodResolver(travelSchema),
    defaultValues: TRAVEL_EMPTY,
  });

  useEffect(() => {
    if (!availabilityQuery.isSuccess) return;
    const a = availabilityQuery.data;
    form.reset(
      a
        ? {
            appointment_type:
              (a.appointment_type as TravelFormValues["appointment_type"]) ?? "both",
            travel_available: a.travel_available,
            travel_radius_km: a.travel_radius_km?.toString() ?? "",
            travel_charge_enabled: a.travel_charge_enabled,
            travel_charge_type:
              (a.travel_charge_type as TravelFormValues["travel_charge_type"]) ?? "quote",
            travel_charge_amount: a.travel_charge_amount?.toString() ?? "",
          }
        : TRAVEL_EMPTY,
    );
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityQuery.isSuccess, availabilityQuery.data]);

  const save = useMutation({
    mutationFn: (values: TravelFormValues) =>
      saveAvailabilityFn({
        data: {
          appointment_type: values.appointment_type,
          travel_available: values.travel_available,
          travel_radius_km: toNullableNumber(values.travel_radius_km),
          travel_charge_enabled: values.travel_charge_enabled,
          travel_charge_type: values.travel_charge_enabled ? values.travel_charge_type : null,
          travel_charge_amount:
            values.travel_charge_enabled && values.travel_charge_type !== "quote"
              ? toNullableNumber(values.travel_charge_amount)
              : null,
        },
      }),
    onSuccess: (_, values) => {
      toast.success("Travel settings saved.");
      form.reset(values);
      queryClient.invalidateQueries({ queryKey: ["own-availability"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save travel settings"),
  });

  const travelAvailable = form.watch("travel_available");
  const travelChargeEnabled = form.watch("travel_charge_enabled");
  const travelChargeType = form.watch("travel_charge_type");

  if (!ready) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
              Where do you provide services?
            </CardTitle>
            <CardDescription>
              This is the same appointment-type setting used on your Availability page — changing it
              here updates it there too.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="appointment_type"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid gap-3 sm:grid-cols-3"
                    >
                      {APPOINTMENT_TYPES.map((t) => (
                        <label
                          key={t.value}
                          htmlFor={`appt-${t.value}`}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                        >
                          <RadioGroupItem value={t.value} id={`appt-${t.value}`} />
                          <t.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                          <span className="text-sm font-medium">{t.label}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-4 w-4 text-primary" aria-hidden="true" />
              Travel services
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/20 p-4">
              <div>
                <p className="text-sm font-medium">Travel appointments</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Allow clients to request appointments at their location.
                </p>
              </div>
              <FormField
                control={form.control}
                name="travel_available"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label="Travel appointments"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {travelAvailable && (
              <FormField
                control={form.control}
                name="travel_radius_km"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Travel radius</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input type="number" min={0} placeholder="20" className="w-28" {...field} />
                      </FormControl>
                      <span className="text-sm text-muted-foreground">km</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Approximate distance you are willing to travel for appointments.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {travelAvailable && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Banknote className="h-4 w-4 text-primary" aria-hidden="true" />
                Travel charges
              </CardTitle>
              <CardDescription>Optional — you don't have to disclose pricing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/20 p-4">
                <p className="text-sm font-medium">Charge for travel</p>
                <FormField
                  control={form.control}
                  name="travel_charge_enabled"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          aria-label="Charge for travel"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {travelChargeEnabled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="travel_charge_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Travel charge type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed</SelectItem>
                            <SelectItem value="per_km">Per km</SelectItem>
                            <SelectItem value="quote">Contact for quote</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {travelChargeType !== "quote" && (
                    <FormField
                      control={form.control}
                      name="travel_charge_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (₹)</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3">
          {form.formState.isDirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
          <Button type="submit" variant="hero" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function AreasPage() {
  const queryClient = useQueryClient();
  const areasQuery = useQuery({ queryKey: ["own-areas"], queryFn: () => listAreasFn() });
  const profileLocationQuery = useQuery({
    queryKey: ["own-profile-location"],
    queryFn: () => getProfileLocationFn(),
  });

  const onSaved = () => queryClient.invalidateQueries({ queryKey: ["own-areas"] });

  const create = useMutation({
    mutationFn: (input: ServiceAreaInput) => createAreaFn({ data: input }),
    onSuccess: () => {
      toast.success("Service area added.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to add service area"),
  });
  const update = useMutation({
    mutationFn: (vars: { id: string; input: ServiceAreaInput }) =>
      updateAreaFn({ data: { id: vars.id, ...vars.input } }),
    onSuccess: () => {
      toast.success("Service area updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update service area"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAreaFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Service area removed.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to remove service area"),
  });

  const loc = profileLocationQuery.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <h1 className="font-display text-2xl font-semibold">Service Areas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell clients where you provide your beauty services.
      </p>

      <div className="mt-6 space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
              Primary location
            </CardTitle>
            <CardDescription>Your primary location is managed from your Profile.</CardDescription>
          </CardHeader>
          <CardContent>
            {loc && (
              <p className="text-sm">
                {[loc.locality, loc.primary_city, loc.state].filter(Boolean).join(", ") || "—"}
              </p>
            )}
            <Button variant="softline" size="sm" className="mt-3" asChild>
              <Link to="/dashboard/profile">Edit profile location</Link>
            </Button>
          </CardContent>
        </Card>

        <TravelSettingsCard />

        <ServiceAreasManager
          areas={areasQuery.data ?? []}
          isLoading={areasQuery.isLoading}
          isSaving={create.isPending || update.isPending}
          onCreate={(input) => create.mutateAsync(input)}
          onUpdate={(id, input) => update.mutateAsync({ id, input })}
          onDelete={(id) => remove.mutate(id)}
        />
      </div>
    </div>
  );
}
