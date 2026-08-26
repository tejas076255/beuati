import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/reviews")({
  component: ReviewsPage,
});

const listReviewsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAllReviews } = await import("@/data/admin/reviews.server");
    return listAllReviews(context.supabase, context.userId);
  });

const updateReviewModerationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { reviewId: string; is_published?: boolean; is_verified?: boolean }) => data)
  .handler(async ({ context, data }) => {
    const { updateReviewModeration } = await import("@/data/admin/reviews.server");
    const { reviewId, ...updates } = data;
    await updateReviewModeration(context.supabase, context.userId, reviewId, updates);
  });

const deleteReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { reviewId: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteReview } = await import("@/data/admin/reviews.server");
    await deleteReview(context.supabase, context.userId, data.reviewId);
  });

function ReviewsPage() {
  const queryClient = useQueryClient();
  const reviewsQuery = useQuery({ queryKey: ["admin-reviews"], queryFn: () => listReviewsFn() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });

  const moderate = useMutation({
    mutationFn: (vars: { reviewId: string; is_published?: boolean; is_verified?: boolean }) =>
      updateReviewModerationFn({ data: vars }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to update review"),
  });

  const remove = useMutation({
    mutationFn: (reviewId: string) => deleteReviewFn({ data: { reviewId } }),
    onSuccess: () => {
      toast.success("Review deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete review"),
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Reviews</h1>
      <p className="mt-1 text-sm text-muted-foreground">Platform-wide review moderation.</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {reviewsQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : reviewsQuery.isError ? (
          <p className="p-6 text-sm text-destructive">
            {(reviewsQuery.error as Error).message || "Admin access required."}
          </p>
        ) : (reviewsQuery.data ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Beautician</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reviewsQuery.data ?? []).map((review) => (
                <TableRow key={review.id}>
                  <TableCell className="font-medium">{review.client_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {review.beautician_profiles?.display_name ?? "—"}
                  </TableCell>
                  <TableCell>{review.rating}★</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={moderate.isPending}
                      onClick={() =>
                        moderate.mutate({ reviewId: review.id, is_published: !review.is_published })
                      }
                    >
                      <Badge variant={review.is_published ? "default" : "secondary"}>
                        {review.is_published ? "Published" : "Hidden"}
                      </Badge>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={moderate.isPending}
                      onClick={() =>
                        moderate.mutate({ reviewId: review.id, is_verified: !review.is_verified })
                      }
                    >
                      <Badge variant={review.is_verified ? "default" : "outline"}>
                        {review.is_verified ? "Verified" : "Unverified"}
                      </Badge>
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm("Delete this review?")) remove.mutate(review.id);
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
