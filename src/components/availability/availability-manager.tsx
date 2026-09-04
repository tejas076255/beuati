// Shared presentational Availability form — extracted from the
// beautician's own /dashboard/availability page (previously inline there)
// so the exact same form/validation/working-hours logic can be reused by
// the Admin per-beautician workspace without duplicating it. Callers own
// all data-fetching/mutation wiring and pass data + callbacks as props —
// this component has no direct server-fn calls, matching the established
// *Manager pattern (ServicesManager, GalleryManager, etc.).
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  CalendarCheck,
  CalendarX,
  Clock,
  MapPin,
  NotebookPen,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import type { AvailabilityInput, DayHours, WorkingDay } from "@/data/dashboard/availability.server";
import { WORKING_DAYS, parseWorkingHours } from "@/data/dashboard/availability.server";
import type { Json, Tables } from "@/integrations/supabase/types";

const DAY_LABEL: Record<WorkingDay, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const NOTICE_PRESETS = [
  { value: "0", label: "Same day" },
  { value: "24", label: "1 day" },
  { value: "48", label: "2 days" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
] as const;
const DEFAULT_NOTICE_HOURS = "48";

const WINDOW_PRESETS = [
  { value: "30", label: "1 month" },
  { value: "90", label: "3 months" },
  { value: "180", label: "6 months" },
  { value: "365", label: "12 months" },
] as const;
const DEFAULT_WINDOW_DAYS = "180";

const APPOINTMENT_TYPES = [
  { value: "studio", label: "Studio appointments" },
  { value: "client_location", label: "Client location" },
  { value: "both", label: "Both" },
] as const;

function defaultDayHours(day: WorkingDay): DayHours {
  return { day, available: day !== "sunday", start: "10:00", end: "19:00" };
}

const availabilitySchema = z.object({
  accepting_bookings: z.boolean(),
  advance_booking_days: z.string(),
  minimum_notice_hours: z.string(),
  appointment_type: z.enum(["studio", "client_location", "both"]),
  travel_available: z.boolean(),
  working_hours_note: z.string(),
  timezone: z.string().min(1, "Required"),
});
type AvailabilityFormValues = z.infer<typeof availabilitySchema>;

const EMPTY: AvailabilityFormValues = {
  accepting_bookings: true,
  advance_booking_days: DEFAULT_WINDOW_DAYS,
  minimum_notice_hours: DEFAULT_NOTICE_HOURS,
  appointment_type: "both",
  travel_available: false,
  working_hours_note: "",
  timezone: "Asia/Kolkata",
};

function toNullableInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function BlockedDatesCard({
  blockedDates,
  isLoading,
  isSaving,
  onAdd,
  onRemove,
}: {
  blockedDates: Tables<"availability_blocked_dates">[];
  isLoading: boolean;
  isSaving: boolean;
  onAdd: (input: { blocked_date: string; reason: string | null }) => void;
  onRemove: (id: string) => void;
}) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const submit = () => {
    if (!date) return;
    onAdd({ blocked_date: date, reason: reason || null });
    setDate("");
    setReason("");
  };

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarX className="h-4 w-4 text-primary" aria-hidden="true" />
          Blocked dates
        </CardTitle>
        <CardDescription>
          Mark specific dates as unavailable — fully booked, a holiday, or a personal event.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Date
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && date) submit();
              }}
              className="mt-1"
            />
          </label>
          <label className="min-w-0 flex-1 text-sm font-medium">
            Reason (optional)
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && date) submit();
              }}
              placeholder="Fully booked, Holiday, …"
              className="mt-1"
            />
          </label>
          <Button type="button" variant="softline" disabled={!date || isSaving} onClick={submit}>
            {isSaving ? "Adding…" : "Add blocked date"}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : blockedDates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked dates yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {blockedDates.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {new Date(`${b.blocked_date}T00:00:00`).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  {b.reason && <p className="text-xs text-muted-foreground">{b.reason}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove blocked date ${b.blocked_date}`}
                  onClick={() => onRemove(b.id)}
                  disabled={isSaving}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AvailabilityManager({
  availability,
  isLoading,
  onSave,
  isSaving,
  blockedDates,
  blockedDatesLoading,
  onAddBlockedDate,
  onRemoveBlockedDate,
  blockedDateSaving,
  showFunnelHint = true,
}: {
  availability: Tables<"availability_settings"> | null;
  isLoading: boolean;
  onSave: (input: AvailabilityInput) => void;
  isSaving: boolean;
  blockedDates: Tables<"availability_blocked_dates">[];
  blockedDatesLoading: boolean;
  onAddBlockedDate: (input: { blocked_date: string; reason: string | null }) => void;
  onRemoveBlockedDate: (id: string) => void;
  blockedDateSaving: boolean;
  /** The professional's own page shows the "how this feature works" funnel
   * card; the Admin workspace omits it (redundant chrome there). */
  showFunnelHint?: boolean;
}) {
  const [formReady, setFormReady] = useState(false);
  const [workingHours, setWorkingHours] = useState<DayHours[]>(WORKING_DAYS.map(defaultDayHours));

  const form = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (isLoading) return;
    const a = availability;
    form.reset(
      a
        ? {
            accepting_bookings: a.accepting_bookings,
            advance_booking_days: a.advance_booking_days?.toString() ?? DEFAULT_WINDOW_DAYS,
            minimum_notice_hours: a.minimum_notice_hours?.toString() ?? DEFAULT_NOTICE_HOURS,
            appointment_type:
              (a.appointment_type as AvailabilityFormValues["appointment_type"]) ?? "both",
            travel_available: a.travel_available,
            working_hours_note: a.working_hours_note ?? "",
            timezone: a.timezone,
          }
        : EMPTY,
    );
    setWorkingHours(parseWorkingHours(a?.working_hours ?? null));
    setFormReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, availability]);

  const acceptingBookings = form.watch("accepting_bookings");
  const travelAvailable = form.watch("travel_available");
  const hasSavedSettings = availability != null;

  const updateDay = (day: WorkingDay, patch: Partial<DayHours>) => {
    setWorkingHours((prev) => prev.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  };

  const submit = form.handleSubmit(
    (values) =>
      onSave({
        accepting_bookings: values.accepting_bookings,
        advance_booking_days: toNullableInt(values.advance_booking_days),
        minimum_notice_hours: toNullableInt(values.minimum_notice_hours),
        appointment_type: values.appointment_type,
        travel_available: values.travel_available,
        working_hours_note: values.working_hours_note || null,
        timezone: values.timezone,
        working_hours: workingHours as unknown as Json,
      }),
    (errors) => {
      console.error("Availability form validation failed", errors);
    },
  );

  if (!formReady) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={submit}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">Availability</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When clients can request appointments and how availability is handled.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {form.formState.isDirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <Button type="submit" variant="hero" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        {showFunnelHint && (
          <Card className="mt-4 border-border/70 bg-secondary/20 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Clients request availability for a specific date and service — this is an enquiry,
                never a confirmed booking.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="rounded-full border border-border bg-card px-2.5 py-1">
                  Public portfolio
                </span>
                <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="rounded-full border border-border bg-card px-2.5 py-1">
                  Check availability
                </span>
                <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="rounded-full border border-border bg-card px-2.5 py-1">
                  Client submits request
                </span>
                <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="rounded-full border border-border bg-card px-2.5 py-1">
                  Becomes a lead
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {!hasSavedSettings && (
          <p className="mt-4 rounded-lg border border-dashed border-border/70 bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
            No availability settings saved yet — the defaults below will be used until saved.
          </p>
        )}

        <div className="mt-6 space-y-6">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                Availability status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-secondary/20 p-4">
                <div>
                  <p className="font-medium">Accepting new booking requests</p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    {acceptingBookings
                      ? "Clients can request bookings from the public portfolio."
                      : 'The "Check availability" option will be disabled or clearly marked unavailable on the public portfolio.'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={acceptingBookings ? "default" : "outline"}>
                    {acceptingBookings ? "ON" : "OFF"}
                  </Badge>
                  <FormField
                    control={form.control}
                    name="accepting_bookings"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            aria-label="Accepting new booking requests"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                Booking preferences
              </CardTitle>
              <CardDescription>
                How much lead time is needed and how far ahead clients can plan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="minimum_notice_hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum notice required</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {NOTICE_PRESETS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
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
                  name="advance_booking_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accept bookings up to</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {WINDOW_PRESETS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
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
                name="appointment_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      Appointment type
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {APPOINTMENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/20 p-4">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    Available for travel appointments
                  </p>
                  {travelAvailable && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Travel appointments available within service areas.
                    </p>
                  )}
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
                          aria-label="Available for travel appointments"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Timezone
                      <span className="text-destructive" aria-hidden="true">
                        {" "}
                        *
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Asia/Kolkata" {...field} />
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
                <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                Working hours
              </CardTitle>
              <CardDescription>
                The days worked and usual hours. Not every day needs configuring.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {workingHours.map((d) => (
                  <li key={d.day} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                    <div className="flex w-36 shrink-0 items-center gap-2">
                      <Switch
                        checked={d.available}
                        onCheckedChange={(checked) => updateDay(d.day, { available: checked })}
                        aria-label={`${DAY_LABEL[d.day]} available`}
                      />
                      <span className="text-sm font-medium">{DAY_LABEL[d.day]}</span>
                    </div>
                    {d.available ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          type="time"
                          value={d.start}
                          onChange={(e) => updateDay(d.day, { start: e.target.value })}
                          className="w-full sm:w-32"
                          aria-label={`${DAY_LABEL[d.day]} start time`}
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                          type="time"
                          value={d.end}
                          onChange={(e) => updateDay(d.day, { end: e.target.value })}
                          className="w-full sm:w-32"
                          aria-label={`${DAY_LABEL[d.day]} end time`}
                        />
                      </div>
                    ) : (
                      <span className="flex-1 text-sm text-muted-foreground">Unavailable</span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <BlockedDatesCard
            blockedDates={blockedDates}
            isLoading={blockedDatesLoading}
            isSaving={blockedDateSaving}
            onAdd={onAddBlockedDate}
            onRemove={onRemoveBlockedDate}
          />

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <NotebookPen className="h-4 w-4 text-primary" aria-hidden="true" />
                Additional notes
              </CardTitle>
              <CardDescription>
                Optional context shown alongside booking rules — e.g. "By appointment only."
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="working_hours_note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Working hours note (optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Mon–Sat, 10am–7pm" {...field} />
                    </FormControl>
                    <FormDescription>
                      Separate from the day-by-day hours above; adds any extra context clients
                      should know.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}
