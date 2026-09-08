import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { MessageSquareQuote, Star } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import type { ReviewInput } from "@/data/dashboard/reviews.server";
import {
  getPlanCapacity,
  PLAN_LABELS,
  type PlanCapacity,
  type PortfolioPlan,
} from "@/lib/plan-limits";
import { LockedModuleNotice, PlanCapacityBar } from "@/components/shared/plan-capacity-notice";

export const Route = createFileRoute("/dashboard/reviews")({
  component: ReviewsPage,
});

const listReviewsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnReviews } = await import("@/data/dashboard/reviews.server");
    return listOwnReviews(context.supabase, context.userId);
  });

const createReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ReviewInput) => data)
  .handler(async ({ context, data }) => {
    const { createReview } = await import("@/data/dashboard/reviews.server");
    await createReview(context.supabase, context.userId, data);
  });

const updateReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & Partial<ReviewInput>) => data)
  .handler(async ({ context, data }) => {
    const { updateReview } = await import("@/data/dashboard/reviews.server");
    const { id, ...updates } = data;
    await updateReview(context.supabase, id, updates);
  });

const deleteReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteReview } = await import("@/data/dashboard/reviews.server");
    await deleteReview(context.supabase, data.id);
  });

const getOwnPlanFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnPortfolioPlan } = await import("@/data/dashboard/plan-enforcement.server");
    return getOwnPortfolioPlan(context.supabase, context.userId);
  });

const reviewSchema = z.object({
  client_name: z.string().min(1, "Required"),
  rating: z.coerce.number().int().min(1).max(5),
  review_text: z.string().min(1, "Required"),
  service_name: z.string(),
  review_date: z.string(),
  source: z.string(),
  source_url: z.string(),
  is_published: z.boolean(),
});
type ReviewFormValues = z.infer<typeof reviewSchema>;

const EMPTY: ReviewFormValues = {
  client_name: "",
  rating: 5,
  review_text: "",
  service_name: "",
  review_date: "",
  source: "",
  source_url: "",
  is_published: true,
};

function toReviewInput(values: ReviewFormValues): ReviewInput {
  return {
    client_name: values.client_name,
    rating: values.rating,
    review_text: values.review_text,
    service_name: values.service_name || null,
    review_date: values.review_date || null,
    source: values.source || null,
    source_url: values.source_url || null,
    is_published: values.is_published,
  };
}

function StarRatingInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(n)}
          className="rounded-sm p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Star
            className={cn(
              "h-6 w-6 transition-colors",
              n <= value ? "fill-amber-400 text-amber-400" : "fill-none text-border",
            )}
          />
        </button>
      ))}
      <span className="ml-1.5 text-sm text-muted-foreground">
        {value} star{value === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function ReviewText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 220;

  return (
    <div className="mt-2">
      <p
        className={
          expanded || !isLong
            ? "text-sm text-muted-foreground"
            : "line-clamp-3 text-sm text-muted-foreground"
        }
      >
        “{text}”
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function ReviewFormDialog({
  review,
  onSaved,
  addDisabledReason,
}: {
  review?: Tables<"reviews">;
  onSaved: () => void;
  addDisabledReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      review
        ? {
            client_name: review.client_name,
            rating: review.rating,
            review_text: review.review_text,
            service_name: review.service_name ?? "",
            review_date: review.review_date ?? "",
            source: review.source ?? "",
            source_url: review.source_url ?? "",
            is_published: review.is_published,
          }
        : EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, review]);

  const save = useMutation({
    mutationFn: (values: ReviewFormValues) => {
      const payload = toReviewInput(values);
      return review
        ? updateReviewFn({ data: { id: review.id, ...payload } })
        : createReviewFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(review ? "Review updated" : "Review added");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save review"),
  });

  if (!review && addDisabledReason) {
    return (
      <Button variant="hero" disabled title={addDisabledReason}>
        Add review
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {review ? (
          <Button variant="softline" size="sm">
            Edit
          </Button>
        ) : (
          <Button variant="hero">Add review</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{review ? "Edit review" : "Add review"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="client_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Client name
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
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rating</FormLabel>
                    <FormControl>
                      <StarRatingInput value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="review_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="review_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Review
                    <span className="text-destructive" aria-hidden="true">
                      {" "}
                      *
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="service_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Bridal makeup, Hair spa, …" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Google, Instagram, …" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source link (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="is_published"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Published (visible on my portfolio)</FormLabel>
                </FormItem>
              )}
            />
            <Button type="submit" variant="hero" className="w-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewsPage() {
  const queryClient = useQueryClient();
  const reviewsQuery = useQuery({ queryKey: ["own-reviews"], queryFn: () => listReviewsFn() });
  const planQuery = useQuery({ queryKey: ["own-plan"], queryFn: () => getOwnPlanFn() });

  const remove = useMutation({
    mutationFn: (id: string) => deleteReviewFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Review deleted");
      queryClient.invalidateQueries({ queryKey: ["own-reviews"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete review"),
  });

  const reviews = reviewsQuery.data ?? [];
  const onSaved = () => queryClient.invalidateQueries({ queryKey: ["own-reviews"] });

  const capacity: PlanCapacity | undefined = planQuery.data
    ? getPlanCapacity(planQuery.data, "reviews", reviews.length)
    : undefined;
  const plan: PortfolioPlan | undefined = planQuery.data;

  if (capacity && plan && !capacity.available) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="font-display text-2xl font-semibold">Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Testimonials shown on your public portfolio.
        </p>
        <div className="mt-6">
          <LockedModuleNotice label="Reviews" plan={plan} minimumPlanLabel="Starter" />
        </div>
      </div>
    );
  }

  const addDisabledReason =
    capacity?.atLimit && plan
      ? `You've reached your ${PLAN_LABELS[plan]} plan's limit of ${capacity.limit} reviews. Upgrade for more capacity.`
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Testimonials shown on your public portfolio.
          </p>
        </div>
        <ReviewFormDialog onSaved={onSaved} addDisabledReason={addDisabledReason} />
      </div>

      {capacity && plan && (
        <div className="mt-3">
          <PlanCapacityBar label="Reviews" plan={plan} capacity={capacity} />
        </div>
      )}

      <div className="mt-6">
        {reviewsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : reviews.length === 0 ? (
          <Card className="border-dashed border-border/70 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MessageSquareQuote className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">No reviews added yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Add client testimonials to build trust with visitors.
                </p>
              </div>
              <ReviewFormDialog onSaved={onSaved} addDisabledReason={addDisabledReason} />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <Card key={review.id} className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{review.client_name}</p>
                        <span className="flex items-center gap-0.5 text-amber-500">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star key={i} className="h-3.5 w-3.5 fill-current" />
                          ))}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {review.service_name && (
                          <Badge variant="secondary">{review.service_name}</Badge>
                        )}
                        {review.is_verified && <Badge variant="default">Verified</Badge>}
                        {!review.is_published && <Badge variant="outline">Hidden</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <ReviewFormDialog review={review} onSaved={onSaved} />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete review from ${review.client_name}`}
                        onClick={() => {
                          if (window.confirm(`Delete the review from ${review.client_name}?`))
                            remove.mutate(review.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <ReviewText text={review.review_text} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
