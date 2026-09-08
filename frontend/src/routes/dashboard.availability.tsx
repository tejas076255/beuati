import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AvailabilityManager } from "@/components/availability/availability-manager";
import type { AvailabilityInput } from "@/data/dashboard/availability.server";

export const Route = createFileRoute("/dashboard/availability")({
  component: AvailabilityPage,
});

const getAvailabilityFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnAvailability } = await import("@/data/dashboard/availability.server");
    return getOwnAvailability(context.supabase, context.userId);
  });

const saveAvailabilityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: AvailabilityInput) => data)
  .handler(async ({ context, data }) => {
    const { saveOwnAvailability } = await import("@/data/dashboard/availability.server");
    await saveOwnAvailability(context.supabase, context.userId, data);
  });

const listBlockedDatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnBlockedDates } = await import("@/data/dashboard/availability.server");
    return listOwnBlockedDates(context.supabase, context.userId);
  });

const addBlockedDateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { blocked_date: string; reason: string | null }) => data)
  .handler(async ({ context, data }) => {
    const { addOwnBlockedDate } = await import("@/data/dashboard/availability.server");
    await addOwnBlockedDate(context.supabase, context.userId, data);
  });

const deleteBlockedDateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteOwnBlockedDate } = await import("@/data/dashboard/availability.server");
    await deleteOwnBlockedDate(context.supabase, data.id);
  });

function AvailabilityPage() {
  const queryClient = useQueryClient();
  const availabilityQuery = useQuery({
    queryKey: ["own-availability"],
    queryFn: () => getAvailabilityFn(),
  });
  const blockedQuery = useQuery({
    queryKey: ["own-blocked-dates"],
    queryFn: () => listBlockedDatesFn(),
  });

  const save = useMutation({
    mutationFn: (input: AvailabilityInput) => saveAvailabilityFn({ data: input }),
    onSuccess: () => {
      toast.success("Availability settings saved.");
      queryClient.invalidateQueries({ queryKey: ["own-availability"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save availability"),
  });

  const addBlocked = useMutation({
    mutationFn: (input: { blocked_date: string; reason: string | null }) =>
      addBlockedDateFn({ data: input }),
    onSuccess: () => {
      toast.success("Date blocked");
      queryClient.invalidateQueries({ queryKey: ["own-blocked-dates"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to block date"),
  });

  const removeBlocked = useMutation({
    mutationFn: (id: string) => deleteBlockedDateFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Blocked date removed");
      queryClient.invalidateQueries({ queryKey: ["own-blocked-dates"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to remove blocked date"),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      {availabilityQuery.isError ? (
        <p className="text-sm text-destructive">
          {(availabilityQuery.error as Error).message || "Failed to load availability."}
        </p>
      ) : (
        <AvailabilityManager
          availability={availabilityQuery.data ?? null}
          isLoading={availabilityQuery.isLoading}
          onSave={(input) => save.mutate(input)}
          isSaving={save.isPending}
          blockedDates={blockedQuery.data ?? []}
          blockedDatesLoading={blockedQuery.isLoading}
          onAddBlockedDate={(input) => addBlocked.mutate(input)}
          onRemoveBlockedDate={(id) => removeBlocked.mutate(id)}
          blockedDateSaving={addBlocked.isPending || removeBlocked.isPending}
        />
      )}
    </div>
  );
}
