import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Circle, Clock, Sparkles } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cn } from "@/lib/utils";
import {
  evaluateServiceContentReadiness,
  serviceReadinessBadgeLabel,
  serviceReadinessMessage,
  serviceReadinessStateLabel,
  type ServiceContentReadiness,
  type ServiceContentReadinessState,
  type ServiceReadinessCheck,
} from "@/lib/seo-helpers";
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

export const Route = createFileRoute("/dashboard/services")({
  component: ServicesPage,
});

const listServicesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnServicesWithReadiness } = await import("@/data/dashboard/services.server");
    return listOwnServicesWithReadiness(context.supabase, context.userId);
  });

const createServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ServiceInput) => data)
  .handler(async ({ context, data }) => {
    const { createService } = await import("@/data/dashboard/services.server");
    await createService(context.supabase, context.userId, data);
  });

const updateServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & Partial<ServiceInput>) => data)
  .handler(async ({ context, data }) => {
    const { updateService } = await import("@/data/dashboard/services.server");
    const { id, ...updates } = data;
    await updateService(context.supabase, id, updates);
  });

const deleteServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteService } = await import("@/data/dashboard/services.server");
    await deleteService(context.supabase, data.id);
  });

// Application-level controlled list, not a new database table. A proper
// `service_categories` taxonomy table already exists in the schema, but it's
// currently admin-only (read-gated to assertIsAdmin) and unpopulated with
// this exact beautician-facing option set — wiring the Services form to it
// would mean a new RLS-safe read path, a data migration, and switching
// storage from `category` to `category_id`, which is materially more than
// this phase asks for. The existing free-text `category` column is reused
// as-is; this list only constrains what the UI offers going forward.
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
    // Kept as the raw input string, like duration_minutes below, so an
    // untouched field stays genuinely empty instead of coercing to 0
    // (Phase 3F.6 price-integrity fix) — a ₹0 fixed/starting-from price is
    // never a real business fact in this product (no "free service"
    // concept exists anywhere in the schema), so it must never be
    // saveable by simply not touching the field. Cross-field validity
    // (whether blank is allowed) depends on price_type — see superRefine.
    price: z.string().trim(),
    price_type: z.enum(["fixed", "starting_from", "custom_quote"]),
    // Optional and never silently defaulted (Phase 3F.6 duration-integrity
    // fix) — kept as the raw input string in form state so an untouched
    // field stays genuinely empty rather than coercing to 0/NaN; converted
    // to a real positive integer or null only at submit time, matching the
    // existing services.duration_minutes CHECK (duration_minutes > 0).
    duration_minutes: z
      .string()
      .trim()
      .refine((v) => v === "" || (Number.isInteger(Number(v)) && Number(v) > 0), {
        message: "Enter a positive number of minutes, or leave blank",
      }),
    // Phase 3F.7 — optional free text, no default content. Included items
    // / suitable-for lists are managed as separate local state (see
    // includedItems/suitableFor below), not through this zod schema, since
    // react-hook-form's array handling adds friction for a plain
    // string-list UI with no other per-item validation needs.
    // Phase 3F.8 §9 — a sensible upper bound, not a content-quality rule.
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
      // A custom-quote service genuinely has no price to assert — blank is
      // valid. If something IS entered, it must still be real.
      if (trimmed !== "" && !isPositiveNumber(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["price"],
          message: "Enter a price greater than ₹0, or leave blank for Custom quote",
        });
      }
      return;
    }
    // fixed / starting_from assert a real number publicly — must be a
    // deliberate, positive entry, never a silently-saved 0. Phase 3F.8A §6
    // — improved wording points at the actual escape hatch (the Custom
    // quote price type) rather than just repeating the same instruction.
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

/** Trims, drops blanks, dedupes case-insensitively, caps a sane per-item
 * length and a maximum item count (Phase 3F.7 §7, count cap added Phase
 * 3F.8 §7). No minimum count enforced; an empty list is valid and saves
 * as `[]`. Never rewrites the text itself — only trims/caps length. */
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

/** Repeatable list-item input (Phase 3F.7 §5) — "+ Add item" / "Remove",
 * never a comma/newline-separated technical text box. Deliberately kept as
 * plain local state outside the react-hook-form schema (see the
 * ServiceFormDialog comment) since there's no per-item zod validation need
 * beyond the shared cleanListItems() pass applied at submit time. `max`
 * (Phase 3F.8 §7) hides "+ Add item" once reached rather than silently
 * dropping a typed item. */
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
  onSaved,
}: {
  service?: Tables<"services">;
  /** Account/profile-level readiness signals that never change while this
   * dialog is open (Phase 3F.8A §3) — the same batched data already loaded
   * for the service list, never a second fetch. */
  readinessContext: ServiceReadinessContext;
  /** Real Gallery/Before-After link count for this service — 0 for a
   * brand-new, not-yet-saved service. This dialog never lets you change
   * links itself (Phase 3F.5 relationships remain authoritative). */
  linkedWorkCount?: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Existing services may have a category value that predates this dropdown
  // (e.g. "nail Art") and doesn't exactly match a current option. Track that
  // raw value separately so it can be restored on save if the user never
  // actually touches the category field — opening Edit must never silently
  // rewrite it to "Other".
  const [legacyCategory, setLegacyCategory] = useState<string | null>(null);
  // Plain local state, not part of the zod/RHF schema — see
  // RepeatableListField's doc comment. Empty arrays by default; never
  // pre-filled with example content (Phase 3F.7 §4/§8).
  const [includedItems, setIncludedItems] = useState<string[]>([]);
  const [suitableFor, setSuitableFor] = useState<string[]>([]);
  // Phase 3F.8 §12/§15 — publication is a real, separate toggle now
  // ("Show on my portfolio"), same pattern as Gallery/Before-After's
  // is_published. Defaults true so a brand-new service is visible, matching
  // the services.is_active column's own DB default.
  const [isActive, setIsActive] = useState(true);
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
    form.reset(
      service
        ? {
            name: service.name,
            category: matchesKnownOption ? rawCategory : rawCategory ? "Other" : "",
            short_description: service.short_description ?? "",
            // Genuinely empty when NULL/0 — a real stored 0 is just as
            // untrustworthy as a NULL one here, since no service could
            // ever have legitimately been saved as ₹0 after this fix
            // (Phase 3F.6 price-integrity fix); pre-existing 0 rows are
            // left in the database untouched, but never re-displayed as
            // if 0 were a deliberate value.
            price: service.price ? String(service.price) : "",
            price_type: service.price_type,
            // Genuinely empty when NULL — never silently shown as 60
            // (Phase 3F.6 duration-integrity fix).
            duration_minutes:
              service.duration_minutes != null ? String(service.duration_minutes) : "",
            preparation_notes: service.preparation_notes ?? "",
          }
        : EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service]);

  // Phase 3F.8A §1/§3 — live, in-dialog readiness preview. Reuses the exact
  // same evaluateServiceContentReadiness() the server uses for the
  // persisted card/SEO-page state, just fed the current draft values
  // instead of the saved row. Purely local computation — never written
  // back, never touches the public page/robots/sitemap by itself (§2).
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
  // A brand-new, not-yet-created service is always a preview; an existing
  // one is a preview only once something in the open dialog actually
  // differs from what's persisted (§2) — comparing against the exact
  // values form.reset()/setIncludedItems/setIsActive were seeded with
  // above, not against some other snapshot.
  const hasUnsavedChanges =
    !service ||
    form.formState.isDirty ||
    isActive !== service.is_active ||
    JSON.stringify(includedItems) !== JSON.stringify(service.included_items) ||
    JSON.stringify(suitableFor) !== JSON.stringify(service.suitable_for);

  const save = useMutation({
    mutationFn: (values: ServiceFormValues) => {
      // Field was never touched since the dialog opened and it's displaying
      // the "Other" fallback for an unmatched legacy value — save the
      // original text back, not the literal word "Other".
      const category =
        !form.formState.dirtyFields.category && legacyCategory ? legacyCategory : values.category;
      // Empty stays NULL — never silently coerced to a guessed number
      // (Phase 3F.6 duration-integrity fix, requirement 5).
      const duration_minutes =
        values.duration_minutes.trim() === "" ? null : Number(values.duration_minutes);
      // Empty stays NULL too (only reachable for custom_quote, per the
      // superRefine above) — never a fabricated ₹0 (Phase 3F.6
      // price-integrity fix).
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
        is_active: isActive,
      };
      return service
        ? updateServiceFn({ data: { id: service.id, ...payload } })
        : createServiceFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(service ? "Service updated" : "Service added");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save service"),
  });

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
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
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
                <p className="text-sm font-medium">Show on my portfolio</p>
                <p className="text-xs text-muted-foreground">
                  {isActive
                    ? "Visible to visitors on your public page."
                    : "Hidden from your public page. Still saved and editable here."}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                aria-label="Show on my portfolio"
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

            {/* Service details — Phase 3F.7. Clearly separated section,
                everything optional, nothing pre-filled with example
                content. */}
            <div className="space-y-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-semibold">Service details</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Use clear customer-facing wording — this appears exactly as written on your public
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
                Your service name, description and service details appear publicly exactly as
                entered.
              </p>
            </div>

            <ServiceReadinessPanel readiness={liveReadiness} isPreview={hasUnsavedChanges} />

            <Button type="submit" variant="hero" className="w-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Phase 3F.8A §4/§5 — deep links to the existing manager area that actually
// satisfies a given failing check. Deliberately excludes "reviews": reviews
// are optional and must never look like a requirement or carry a nudge to
// go get one. No new relationship UI is added here — these just navigate to
// the pages that already own their respective data (§4).
const CHECK_ACTIONS: Partial<Record<string, { label: string; to: string }[]>> = {
  city: [{ label: "Add in Profile", to: "/dashboard/profile" }],
  linked_work: [
    { label: "Gallery", to: "/dashboard/gallery" },
    { label: "Before & After", to: "/dashboard/before-after" },
  ],
  service_areas: [{ label: "Add service areas", to: "/dashboard/areas" }],
};

/** Compact "SERVICE PAGE READINESS" panel (Phase 3F.8 §13, made live in
 * Phase 3F.8A) — critical checks (block search readiness) and recommended
 * checks (guidance only) are always visually separated, so an optional
 * item never looks mandatory. `readiness` here may be computed from
 * unsaved draft form state (`isPreview`) — the same
 * evaluateServiceContentReadiness() used everywhere else (§14), just fed
 * live values instead of persisted ones; the panel itself never touches
 * the public page, robots, or sitemap. */
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
          Preview based on unsaved changes — save to apply these to your public service page.
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

// Phase 3F.8A.1 — dedicated key. Gallery and Before & After both cache a
// flat Tables<"services">[] under "own-services-for-linking"; this page's
// query returns a differently-shaped { services, readinessContext } object
// (since Phase 3F.8) and must never share a cache slot with theirs — doing
// so previously crashed Gallery/Before & After with "services.map is not a
// function" whenever this page had been visited first in the same session
// (React Query's cache is one shared QueryClient for the whole SPA — see
// router.tsx).
const OWN_SERVICES_QUERY_KEY = ["own-services-with-readiness"];

function ServicesPage() {
  const queryClient = useQueryClient();
  const servicesQuery = useQuery({
    queryKey: OWN_SERVICES_QUERY_KEY,
    queryFn: () => listServicesFn(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteServiceFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Service deleted");
      queryClient.invalidateQueries({ queryKey: OWN_SERVICES_QUERY_KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete service"),
  });

  const services: OwnServiceWithReadiness[] = servicesQuery.data?.services ?? [];
  // Safe, all-pass-by-default placeholder used only while the page is
  // still loading — the Add-service trigger needs *some* context to pass
  // down, but nothing is actually saveable until the real query resolves.
  const readinessContext: ServiceReadinessContext = servicesQuery.data?.readinessContext ?? {
    profileIsPublished: true,
    profileRobotsIndex: true,
    primaryCity: null,
    publishedReviewCount: 0,
    serviceAreaCount: 0,
  };
  const onSaved = () => queryClient.invalidateQueries({ queryKey: OWN_SERVICES_QUERY_KEY });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Priced offerings shown on your portfolio.
          </p>
        </div>
        <ServiceFormDialog readinessContext={readinessContext} onSaved={onSaved} />
      </div>

      <div className="mt-6">
        {servicesQuery.isLoading ? (
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
                  Add your first priced offering so clients know exactly what you provide and what
                  it costs.
                </p>
              </div>
              <ServiceFormDialog readinessContext={readinessContext} onSaved={onSaved} />
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
                        onSaved={onSaved}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${service.name}`}
                        onClick={() => {
                          if (window.confirm(`Delete "${service.name}"?`))
                            remove.mutate(service.id);
                        }}
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
