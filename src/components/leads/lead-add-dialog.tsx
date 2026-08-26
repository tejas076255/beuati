import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, ChevronLeft, PartyPopper, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { LEAD_SOURCES, EVENT_TYPES, LOCATION_TYPES } from "@/lib/lead-config";
// Phase 3G.2A §2/§3 — same shared rule the public Availability form uses,
// so the two paths can never disagree. createLead() enforces the
// authoritative server-side check regardless of what happens here.
import { isValidPhone, INVALID_PHONE_MESSAGE } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import type { CreateLeadResult, LeadWithInquiry } from "@/data/leads-query.server";

export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  source: string;
  eventDate: string;
  eventType: string;
  numPersons: string;
  locationType: string;
  venueArea: string;
  requirement: string;
  budget: string;
  specialRequirements: string;
  services: string[];
  initialNotes: string;
}

const EMPTY_VALUES: LeadFormValues = {
  name: "",
  phone: "",
  email: "",
  source: "manual_entry",
  eventDate: "",
  eventType: "",
  numPersons: "",
  locationType: "",
  venueArea: "",
  requirement: "",
  budget: "",
  specialRequirements: "",
  services: [],
  initialNotes: "",
};

function leadToValues(lead: LeadWithInquiry): LeadFormValues {
  return {
    name: lead.name ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    source: lead.source ?? "manual_entry",
    eventDate: lead.inquiry?.event_date ?? "",
    eventType: lead.inquiry?.event_type ?? "",
    numPersons: lead.inquiry?.num_persons?.toString() ?? "",
    locationType: lead.inquiry?.location_type ?? "",
    venueArea: lead.inquiry?.venue_area ?? "",
    requirement: lead.inquiry?.requirement ?? "",
    budget: lead.inquiry?.budget?.toString() ?? "",
    specialRequirements: lead.inquiry?.special_requirements ?? "",
    services: lead.inquiry?.services ?? [],
    initialNotes: "",
  };
}

// ---------- service picker ----------

function ServiceChips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [customValue, setCustomValue] = useState("");
  const toggle = (tag: string) => {
    onChange(value.includes(tag) ? value.filter((v) => v !== tag) : [...value, tag]);
  };
  const custom = value.filter((v) => !options.includes(v));

  return (
    <div className="space-y-2">
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-secondary/10 p-2.5">
        {options.map((tag) => {
          const checked = value.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              aria-pressed={checked}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                checked
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              {checked && <Check className="h-3 w-3" aria-hidden="true" />}
              {tag}
            </button>
          );
        })}
        {custom.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            aria-pressed
            className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs text-primary"
          >
            <Check className="h-3 w-3" aria-hidden="true" />
            {tag}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          placeholder="+ Other service…"
          className="h-8 max-w-[200px] text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            const v = customValue.trim();
            if (!v) return;
            if (!value.includes(v)) onChange([...value, v]);
            setCustomValue("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------- quick add ----------

const quickAddSchema = z.object({
  name: z.string().min(1, "Required"),
  phone: z.string().min(1, "Required").refine(isValidPhone, INVALID_PHONE_MESSAGE),
  source: z.string().min(1, "Required"),
  eventDate: z.string().min(1, "Required"),
  primaryService: z.string().min(1, "Required"),
});
type QuickAddValues = z.infer<typeof quickAddSchema>;

function QuickAddForm({
  serviceOptions,
  onSubmit,
  submitting,
}: {
  serviceOptions: string[];
  onSubmit: (values: LeadFormValues) => void;
  submitting: boolean;
}) {
  const form = useForm<QuickAddValues>({
    resolver: zodResolver(quickAddSchema),
    defaultValues: {
      name: "",
      phone: "",
      source: "manual_entry",
      eventDate: "",
      primaryService: "",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) =>
          onSubmit({ ...EMPTY_VALUES, ...v, services: [v.primaryService] }),
        )}
        className="space-y-4"
      >
        <p className="text-sm text-muted-foreground">
          Just the essentials — you can fill in the rest later from the lead's detail page.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="eventDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lead source</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LEAD_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="primaryService"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Primary service</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {serviceOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="hero" className="w-full" disabled={submitting}>
          {submitting ? "Adding…" : "Add lead"}
        </Button>
      </form>
    </Form>
  );
}

// ---------- full details wizard ----------

const fullSchema = z.object({
  name: z.string().min(1, "Required"),
  phone: z.string().min(1, "Required").refine(isValidPhone, INVALID_PHONE_MESSAGE),
  email: z.string(),
  source: z.string().min(1, "Required"),
  eventDate: z.string().min(1, "Required"),
  eventType: z.string(),
  numPersons: z.string().min(1, "Required"),
  locationType: z.string().min(1, "Required"),
  venueArea: z.string(),
  requirement: z.string(),
  budget: z.string(),
  specialRequirements: z.string(),
  services: z.array(z.string()).min(1, "Select at least one service"),
  initialNotes: z.string(),
});

const STEP_LABELS = ["Customer", "Event & services", "Requirements"];

function FullDetailsWizard({
  serviceOptions,
  onSubmit,
  submitting,
  nextFollowup,
  setNextFollowup,
}: {
  serviceOptions: string[];
  onSubmit: (values: LeadFormValues) => void;
  submitting: boolean;
  nextFollowup: { date: string; reason: string };
  setNextFollowup: (v: { date: string; reason: string }) => void;
}) {
  const [step, setStep] = useState(0);
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(fullSchema),
    defaultValues: EMPTY_VALUES,
  });

  const stepFields: (keyof LeadFormValues)[][] = [
    ["name", "phone", "email", "source"],
    ["eventDate", "eventType", "numPersons", "locationType", "venueArea", "services"],
    ["budget", "requirement", "specialRequirements", "initialNotes"],
  ];

  const goNext = async () => {
    const valid = await form.trigger(stepFields[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  };

  return (
    <Form {...form}>
      <div className="mb-1 flex items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary text-muted-foreground",
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
            </div>
            <span
              className={cn(
                "hidden text-xs sm:inline",
                i === step ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      <form
        onSubmit={form.handleSubmit((v) => onSubmit(v))}
        className="space-y-4"
        onKeyDown={(e) => {
          if (e.key === "Enter" && step < STEP_LABELS.length - 1) e.preventDefault();
        }}
      >
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead source</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="eventDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="eventType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event type (optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EVENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="numPersons"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of persons</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="venueArea"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Venue / area (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="locationType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service location</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {LOCATION_TYPES.map((l) => (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => field.onChange(l.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm",
                          field.value === l.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="services"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Requested services</FormLabel>
                  <FormControl>
                    <ServiceChips
                      options={serviceOptions}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="budget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget (optional, ₹)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} className="max-w-[180px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="requirement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer requirement (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="specialRequirements"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Special requirements (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="initialNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial internal notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="text-xs font-medium">Next follow-up (optional)</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={nextFollowup.date}
                  onChange={(e) => setNextFollowup({ ...nextFollowup, date: e.target.value })}
                  className="h-9"
                />
                <Input
                  value={nextFollowup.reason}
                  onChange={(e) => setNextFollowup({ ...nextFollowup, reason: e.target.value })}
                  placeholder="Reason"
                  className="h-9"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {step > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
            </Button>
          ) : (
            <span />
          )}
          {step < STEP_LABELS.length - 1 ? (
            <Button type="button" variant="hero" onClick={goNext}>
              Next: {STEP_LABELS[step + 1]}
            </Button>
          ) : (
            <Button type="submit" variant="hero" disabled={submitting}>
              {submitting ? "Adding…" : "Add lead"}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

// ---------- edit form (single view, all fields) ----------

function EditForm({
  lead,
  serviceOptions,
  onSubmit,
  submitting,
}: {
  lead: LeadWithInquiry;
  serviceOptions: string[];
  onSubmit: (values: LeadFormValues) => void;
  submitting: boolean;
}) {
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(fullSchema),
    defaultValues: leadToValues(lead),
    values: leadToValues(lead),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => onSubmit(v))} className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Customer
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
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
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Event &amp; services
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="eventType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
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
              name="numPersons"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Persons</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="locationType"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Service location</FormLabel>
                <div className="flex flex-wrap gap-2">
                  {LOCATION_TYPES.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => field.onChange(l.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm",
                        field.value === l.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="venueArea"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Venue / area</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="services"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Requested services</FormLabel>
                <FormControl>
                  <ServiceChips
                    options={serviceOptions}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Requirements
          </p>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="budget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} className="max-w-[180px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="requirement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer requirement</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="specialRequirements"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Special requirements</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Button type="submit" variant="hero" className="w-full" disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Form>
  );
}

// ---------- root dialog ----------

type Stage = "choose" | "quick" | "full" | "success";

export function LeadAddDialog({
  open,
  onOpenChange,
  lead,
  serviceOptions,
  submitting,
  onCreate,
  onUpdate,
  onScheduleFollowup,
  onOpenLead,
  onAddFollowup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadWithInquiry | null;
  serviceOptions: string[];
  submitting: boolean;
  onCreate: (values: LeadFormValues) => Promise<CreateLeadResult>;
  onUpdate: (leadId: string, inquiryId: string | null, values: LeadFormValues) => Promise<void>;
  onScheduleFollowup: (leadId: string, date: string, reason: string) => Promise<void>;
  onOpenLead: (leadId: string) => void;
  onAddFollowup: (leadId: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("choose");
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Phase 3G.2A §7 — set only when the phone matched an existing customer,
  // so the success screen can say "Existing customer found" instead of
  // implying a brand-new lead was created. Never shown as an error.
  const [existingCustomerName, setExistingCustomerName] = useState<string | null>(null);
  const [nextFollowup, setNextFollowup] = useState({ date: "", reason: "" });

  useEffect(() => {
    if (open) {
      setStage("choose");
      setCreatedId(null);
      setExistingCustomerName(null);
      setNextFollowup({ date: "", reason: "" });
    }
  }, [open]);

  const handleCreate = async (values: LeadFormValues) => {
    try {
      const result = await onCreate(values);
      if (nextFollowup.date) {
        await onScheduleFollowup(result.id, nextFollowup.date, nextFollowup.reason);
      }
      setCreatedId(result.id);
      setExistingCustomerName(result.reused ? result.existingName : null);
      setStage("success");
      toast.success(
        result.reused
          ? `Existing customer found: ${result.existingName} — new enquiry added.`
          : "Lead added successfully",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add lead");
    }
  };

  const handleUpdate = async (values: LeadFormValues) => {
    if (!lead) return;
    try {
      await onUpdate(lead.id, lead.inquiry?.id ?? null, values);
      toast.success("Lead updated.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update lead");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>
            {lead ? "Edit lead" : stage === "success" ? "Lead added successfully" : "Add new lead"}
          </DialogTitle>
        </DialogHeader>

        {lead ? (
          <EditForm
            lead={lead}
            serviceOptions={serviceOptions}
            onSubmit={handleUpdate}
            submitting={submitting}
          />
        ) : stage === "choose" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setStage("quick")}
              className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
            >
              <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="font-medium">Quick Add</span>
              <span className="text-xs text-muted-foreground">
                Name, phone, event date, service &amp; source — done in seconds.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStage("full")}
              className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
            >
              <Check className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="font-medium">Full Details</span>
              <span className="text-xs text-muted-foreground">
                Capture the complete enquiry, step by step.
              </span>
            </button>
          </div>
        ) : stage === "quick" ? (
          <QuickAddForm
            serviceOptions={serviceOptions}
            onSubmit={handleCreate}
            submitting={submitting}
          />
        ) : stage === "full" ? (
          <FullDetailsWizard
            serviceOptions={serviceOptions}
            onSubmit={handleCreate}
            submitting={submitting}
            nextFollowup={nextFollowup}
            setNextFollowup={setNextFollowup}
          />
        ) : (
          <div className="space-y-4 py-2 text-center">
            <PartyPopper className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
            {existingCustomerName ? (
              <div>
                <p className="text-sm font-medium">
                  Existing customer found: {existingCustomerName}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  New enquiry will be added to this customer.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The lead has been added to your pipeline.
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="hero"
                className="sm:flex-1"
                onClick={() => {
                  if (createdId) onOpenLead(createdId);
                  onOpenChange(false);
                }}
              >
                Open Lead
              </Button>
              <Button
                type="button"
                variant="outline"
                className="sm:flex-1"
                onClick={() => {
                  if (createdId) onAddFollowup(createdId);
                  onOpenChange(false);
                }}
              >
                Add Follow-up
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="sm:flex-1"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
