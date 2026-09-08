// Phase 5.2A — shared Services manager UI, extracted from
// src/routes/dashboard.services.tsx so both the beautician's own
// /dashboard/services page and the Master Admin Console's
// /admin/beauticians/$slug Services section render the identical
// presentational component. Nothing here knows whether it's being driven
// by the beautician's own session or an admin's explicit-target session —
// it only receives data and calls the onCreate/onUpdate/onDelete callbacks
// it's given, matching the "context/config/loader" pattern from the Phase
// 5.1 audit's component-reuse recommendation. No behavior change from the
// original dashboard.services.tsx — this is a mechanical extraction.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Circle, Clock, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  evaluateServiceContentReadiness,
  serviceReadinessBadgeLabel,
  serviceReadinessMessage,
  type ServiceContentReadiness,
  type ServiceContentReadinessState,
  type ServiceReadinessCheck,
} from "@/lib/seo-helpers";
import { PLAN_LABELS, type PlanCapacity, type PortfolioPlan } from "@/lib/plan-limits";
import { PlanCapacityBar } from "@/components/shared/plan-capacity-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import type {
  OwnServiceWithReadiness,
  ServiceInput,
  ServiceReadinessContext,
} from "@/data/dashboard/services.server";
import {
  MAX_INCLUDED_ITEMS,
  MAX_PREPARATION_NOTES_LENGTH,
  MAX_SUITABLE_FOR_ITEMS,
} from "@/lib/service-limits";

// Application-level controlled list, not a new database table — see the
// original dashboard.services.tsx comment (Phase 3F.6) for why the
// service_categories taxonomy table isn't wired up here instead.
const CATEGORY_OPTIONS = [
  "Bridal Makeup",
  "Party / Occasion Makeup",
  "Makeup Services",
  "Hair Services",
  "Nail Services",
  "Skin & Beauty",
  "Eyelash & Eyebrow",
  "Mehndi",
  "Other",
] as const;

const isPositiveNumber = (v: string) => Number.isFinite(Number(v)) && Number(v) > 0;

const serviceSchema = z
  .object({
    name: z.string().min(1, "Required"),
    category: z.string().min(1, "Required"),
    short_description: z.string(),
    price: z.string().trim(),
    price_type: z.enum(["fixed", "starting_from", "custom_quote"]),
    duration_minutes: z
      .string()
      .trim()
      .refine((v) => v === "" || (Number.isInteger(Number(v)) && Number(v) > 0), {
        message: "Enter a positive number of minutes, or leave blank",
      }),
    preparation_notes: z
      .string()
      .max(
        MAX_PREPARATION_NOTES_LENGTH,
        `Keep this under ${MAX_PREPARATION_NOTES_LENGTH} characters`,
      ),
  })
  .superRefine((values, ctx) => {
    const trimmed = values.price.trim();
    if (values.price_type === "custom_quote") {
      if (trimmed !== "" && !isPositiveNumber(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["price"],
          message: "Enter a price greater than ₹0, or leave blank for Custom quote",
        });
      }
      return;
    }
    if (!isPositiveNumber(trimmed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "Enter a price greater than ₹0, or choose Custom quote",
      });
    }
  });
type ServiceFormValues = z.infer<typeof serviceSchema>;

const EMPTY: ServiceFormValues = {
  name: "",
  category: "",
  short_description: "",
  price: "",
  price_type: "fixed",
  duration_minutes: "",
  preparation_notes: "",
};

function cleanListItems(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    if (out.length >= max) break;
    const trimmed = raw.trim().slice(0, 120);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function RepeatableListField({
  label,
  helper,
  placeholder,
  items,
  onChange,
  max,
}: {
  label: string;
  helper: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  max: number;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={item}
              placeholder={placeholder}
              maxLength={120}
              onChange={(e) => {
                const next = [...items];
                next[index] = e.target.value;
                onChange(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove item ${index + 1}`}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        {items.length < max ? (
          <Button
            type="button"
            variant="softline"
            size="sm"
            onClick={() => onChange([...items, ""])}
          >
            + Add item
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Maximum of {max} items reached.</p>
        )}
      </div>
    </div>
  );
}

const PRICE_TYPE_LABEL: Record<ServiceFormValues["price_type"], string> = {
  fixed: "",
  starting_from: "From ",
  custom_quote: "Custom quote",
};

function formatPrice(price: number | null, priceType: ServiceFormValues["price_type"]): string {
  if (priceType === "custom_quote") return "Custom quote";
  if (price == null) return "—";
  return `${PRICE_TYPE_LABEL[priceType]}₹${price.toLocaleString("en-IN")}`;
}

function ServiceFormDialog({
  service,
  readinessContext,
  linkedWorkCount = 0,
  onCreate,
  onUpdate,
  onSaved,
  addDisabledReason,
}: {
  service?: Tables<"services">;
  readinessContext: ServiceReadinessContext;
  linkedWorkCount?: number;
  onCreate: (input: ServiceInput) => Promise<void>;
  onUpdate: (id: string, updates: Partial<ServiceInput>) => Promise<void>;
  onSaved: () => void;
  /** Non-null (and only meaningful when `service` is unset — this is the
   * "Add" trigger) disables adding and explains the plan limit instead. */
  addDisabledReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Lazily computed from the persisted row at mount, not a bare `true`
  // literal — Phase 5.2A.1: the previous unconditional `useState(true)` left
  // a first-paint window, before the open-effect below had a chance to run,
  // where this state read as `true` for an existing *inactive* service.
  // Same reasoning applies to the other local (non-react-hook-form) draft
  // fields below — all four now seed from `service` directly instead of a
  // fixed default.
  const [legacyCategory, setLegacyCategory] = useState<string | null>(() => {
    const raw = service?.category ?? "";
    return raw && !(CATEGORY_OPTIONS as readonly string[]).includes(raw) ? raw : null;
  });
  const [includedItems, setIncludedItems] = useState<string[]>(() => service?.included_items ?? []);
  const [suitableFor, setSuitableFor] = useState<string[]>(() => service?.suitable_for ?? []);
  const [isActive, setIsActive] = useState(() => service?.is_active ?? true);
  // Phase 5.2A.1 — tracks only an explicit admin/beautician interaction with
  // the "Show on portfolio" switch. onSubmit uses this (not the isActive
  // state directly) to decide what to send for is_active on an EDIT, so a
  // price-only save can never carry a stale/mistimed toggle value: untouched
  // means "send exactly what's persisted," full stop.
  const [isActiveTouched, setIsActiveTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    const rawCategory = service?.category ?? "";
    const matchesKnownOption = (CATEGORY_OPTIONS as readonly string[]).includes(rawCategory);
    setLegacyCategory(rawCategory && !matchesKnownOption ? rawCategory : null);
    setIncludedItems(service?.included_items ?? []);
    setSuitableFor(service?.suitable_for ?? []);
    setIsActive(service?.is_active ?? true);
    setIsActiveTouched(false);
    form.reset(
      service
        ? {
            name: service.name,
            category: matchesKnownOption ? rawCategory : rawCategory ? "Other" : "",
            short_description: service.short_description ?? "",
            price: service.price ? String(service.price) : "",
            price_type: service.price_type,
            duration_minutes:
              service.duration_minutes != null ? String(service.duration_minutes) : "",
            preparation_notes: service.preparation_notes ?? "",
          }
        : EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service]);

  const watched = form.watch();
  const effectiveCategoryDraft =
    !form.formState.dirtyFields.category && legacyCategory ? legacyCategory : watched.category;
  const liveReadiness = evaluateServiceContentReadiness({
    profileIsPublished: readinessContext.profileIsPublished,
    profileRobotsIndex: readinessContext.profileRobotsIndex,
    primaryCity: readinessContext.primaryCity,
    publishedReviewCount: readinessContext.publishedReviewCount,
    serviceAreaCount: readinessContext.serviceAreaCount,
    serviceIsActive: isActive,
    serviceName: watched.name,
    serviceCategory: effectiveCategoryDraft,
    serviceHasPersistedSlug: !!service?.slug,
    serviceDescription: watched.short_description,
    priceConfigured:
      watched.price_type === "custom_quote" || isPositiveNumber(watched.price.trim()),
    durationEntered: watched.duration_minutes.trim() !== "",
    includedItemsCount: includedItems.filter((i) => i.trim()).length,
    suitableForCount: suitableFor.filter((i) => i.trim()).length,
    hasPreparationNotes: !!watched.preparation_notes.trim(),
    linkedWorkCount,
  });
  const hasUnsavedChanges =
    !service ||
    form.formState.isDirty ||
    isActive !== service.is_active ||
    JSON.stringify(includedItems) !== JSON.stringify(service.included_items) ||
    JSON.stringify(suitableFor) !== JSON.stringify(service.suitable_for);

  const onSubmit = async (values: ServiceFormValues) => {
    const category =
      !form.formState.dirtyFields.category && legacyCategory ? legacyCategory : values.category;
    const duration_minutes =
      values.duration_minutes.trim() === "" ? null : Number(values.duration_minutes);
    const price = values.price.trim() === "" ? null : Number(values.price);
    const preparation_notes = values.preparation_notes.trim() || null;
    const payload = {
      ...values,
      category,
      duration_minutes,
      price,
      preparation_notes,
      included_items: cleanListItems(includedItems, MAX_INCLUDED_ITEMS),
      suitable_for: cleanListItems(suitableFor, MAX_SUITABLE_FOR_ITEMS),
      // Phase 5.2A.1 — on an edit the admin/beautician never touched the
      // switch for, send the persisted value straight from the loaded row,
      // not the local `isActive` state. This makes an untouched toggle
      // immune to any local-state timing issue: editing only the price can
      // never carry a stale/defaulted visibility value into the update.
      is_active: service && !isActiveTouched ? service.is_active : isActive,
    };
    setSaving(true);
    try {
      if (service) {
        await onUpdate(service.id, payload);
      } else {
        await onCreate(payload);
      }
      toast.success(service ? "Service updated" : "Service added");
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  if (!service && addDisabledReason) {
    return (
      <Button variant="hero" disabled title={addDisabledReason}>
        Add Service
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {service ? (
          <Button variant="softline" size="sm">
            Edit
          </Button>
        ) : (
          <Button variant="hero">Add Service</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Add service"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Category
                    <span className="text-destructive" aria-hidden="true">
                      {" "}
                      *
                    </span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="short_description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      A clear description of a couple of sentences helps customers and search
                      engines understand this service.
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {field.value.trim().length} characters
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Show on portfolio</p>
                <p className="text-xs text-muted-foreground">
                  {isActive
                    ? "Visible to visitors on the public page."
                    : "Hidden from the public page. Still saved and editable here."}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={(checked) => {
                  setIsActive(checked);
                  setIsActiveTouched(true);
                }}
                aria-label="Show on portfolio"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder={
                          form.watch("price_type") === "custom_quote" ? "Optional" : "e.g. 1500"
                        }
                        {...field}
                      />
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
              <FormField
                control={form.control}
                name="duration_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typical duration (minutes)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} placeholder="e.g. 90" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Optional — enter the approximate time this service usually takes.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-semibold">Service details</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Use clear customer-facing wording — this appears exactly as written on the public
                  service page.
                </p>
              </div>

              <RepeatableListField
                label="What's included"
                helper="Add the main things included in this service."
                placeholder="e.g. HD makeup"
                items={includedItems}
                onChange={setIncludedItems}
                max={MAX_INCLUDED_ITEMS}
              />

              <RepeatableListField
                label="Suitable for"
                helper="Add occasions or situations this service is best suited for."
                placeholder="e.g. Wedding day"
                items={suitableFor}
                onChange={setSuitableFor}
                max={MAX_SUITABLE_FOR_ITEMS}
              />

              <FormField
                control={form.control}
                name="preparation_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preparation notes</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="e.g. Please arrive with a clean face."
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Optional — keep this practical and easy for clients to understand.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p className="rounded-lg bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                The service name, description and details appear publicly exactly as entered.
              </p>
            </div>

            <ServiceReadinessPanel readiness={liveReadiness} isPreview={hasUnsavedChanges} />

            <Button type="submit" variant="hero" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const CHECK_ACTIONS: Partial<Record<string, { label: string; to: string }[]>> = {
  city: [{ label: "Add in Profile", to: "/dashboard/profile" }],
  linked_work: [
    { label: "Gallery", to: "/dashboard/gallery" },
    { label: "Before & After", to: "/dashboard/before-after" },
  ],
  service_areas: [{ label: "Add service areas", to: "/dashboard/areas" }],
};

function ServiceReadinessPanel({
  readiness,
  isPreview,
}: {
  readiness: ServiceContentReadiness;
  isPreview: boolean;
}) {
  const failedCritical = readiness.criticalChecks.filter((c) => c.status === "fail");
  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Service page readiness</p>
        <span
          className={cn(
            "text-xs font-medium",
            readiness.state === "ready"
              ? "text-emerald-600"
              : readiness.state === "needs_improvement"
                ? "text-amber-600"
                : "text-muted-foreground",
          )}
        >
          {readiness.state === "ready"
            ? "Ready for search"
            : `Needs ${failedCritical.length} required improvement${failedCritical.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {isPreview && (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
          Preview based on unsaved changes — save to apply these to the public service page.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {serviceReadinessMessage(readiness.state, isPreview)}
      </p>

      <ReadinessCheckList title="Required" checks={readiness.criticalChecks} />
      <ReadinessCheckList
        title="Recommended (optional — improves customer value, not required for search)"
        checks={readiness.recommendedChecks}
      />
    </div>
  );
}

function ReadinessCheckList({ title, checks }: { title: string; checks: ServiceReadinessCheck[] }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {checks.map((check) => {
          const actions = check.status === "fail" ? CHECK_ACTIONS[check.id] : undefined;
          return (
            <li key={check.id} className="flex items-start gap-1.5 text-xs">
              {check.status === "pass" ? (
                <Check
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <span>
                <span
                  className={check.status === "pass" ? "text-foreground" : "text-muted-foreground"}
                >
                  {check.label}
                </span>
                {actions && (
                  <span className="ml-1.5 space-x-1.5">
                    {actions.map((action) => (
                      <Link
                        key={action.to}
                        to={action.to}
                        className="text-primary underline underline-offset-2"
                      >
                        {action.label}
                      </Link>
                    ))}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const READINESS_BADGE_CLASS: Record<ServiceContentReadinessState, string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  needs_improvement: "border-amber-200 bg-amber-50 text-amber-700",
  not_eligible: "border-border bg-secondary/40 text-muted-foreground",
};

/**
 * Shared Services manager — the ONE component both /dashboard/services and
 * the admin workspace's Services section render. Receives its data and
 * mutation callbacks as props; has no idea whether it's driven by the
 * beautician's own session or an admin's explicit-target session.
 */
export function ServicesManager({
  title = "Services",
  subtitle = "Priced offerings shown on the portfolio.",
  services,
  readinessContext,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
  onSaved,
  capacity,
  plan,
}: {
  title?: string;
  subtitle?: string;
  services: OwnServiceWithReadiness[];
  readinessContext: ServiceReadinessContext;
  isLoading: boolean;
  onCreate: (input: ServiceInput) => Promise<void>;
  onUpdate: (id: string, updates: Partial<ServiceInput>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaved: () => void;
  /** 5-tier entitlements — plan-aware capacity ("3 of 5"). Optional so
   * Admin's workspace call site (which has no content-count limits) can
   * omit it entirely. */
  capacity?: PlanCapacity | undefined;
  plan?: PortfolioPlan | undefined;
}) {
  const addDisabledReason =
    capacity?.atLimit && plan
      ? `You've reached your ${PLAN_LABELS[plan]} plan's limit of ${capacity.limit} services. Upgrade for more capacity.`
      : null;
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      toast.success("Service deleted");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete service");
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
        <ServiceFormDialog
          readinessContext={readinessContext}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onSaved={onSaved}
          addDisabledReason={addDisabledReason}
        />
      </div>

      {capacity && plan && (
        <div className="mt-3">
          <PlanCapacityBar label="Services" plan={plan} capacity={capacity} />
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : services.length === 0 ? (
          <Card className="border-dashed border-border/70 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">No services yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Add a priced offering so clients know exactly what's provided and what it costs.
                </p>
              </div>
              <ServiceFormDialog
                readinessContext={readinessContext}
                onCreate={onCreate}
                onUpdate={onUpdate}
                onSaved={onSaved}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="divide-y divide-border p-0">
              {services.map(({ service, readiness, linkedWorkCount }) => {
                const topReasons = readiness.criticalReasons.slice(0, 2);
                return (
                  <div
                    key={service.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{service.name}</p>
                        {service.category && <Badge variant="secondary">{service.category}</Badge>}
                        {!service.is_active && <Badge variant="secondary">Hidden</Badge>}
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", READINESS_BADGE_CLASS[readiness.state])}
                        >
                          {serviceReadinessBadgeLabel(readiness.state)}
                        </Badge>
                      </div>
                      {service.short_description && (
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                          {service.short_description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-display text-sm font-semibold text-primary">
                          {formatPrice(service.price, service.price_type)}
                        </span>
                        {service.duration_minutes != null && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            {service.duration_minutes} min
                          </span>
                        )}
                      </div>
                      {readiness.state !== "ready" && topReasons.length > 0 && (
                        <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                          {topReasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <ServiceFormDialog
                        service={service}
                        readinessContext={readinessContext}
                        linkedWorkCount={linkedWorkCount}
                        onCreate={onCreate}
                        onUpdate={onUpdate}
                        onSaved={onSaved}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${service.name}`}
                        disabled={deletingId === service.id}
                        onClick={() => void handleDelete(service.id, service.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
