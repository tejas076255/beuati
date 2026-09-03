// QA-1O — shared Reviews manager UI, matching the "context/config/loader"
// pattern established for ServicesManager, ProfileManager, GalleryManager,
// BeforeAfterManager, VideoManager, PackageManager, and FaqManager. Unlike
// those, this is ADMIN-ONLY moderation (list, publish/unpublish, verify,
// delete) — it never creates or edits a review's own content (client_name,
// rating, review_text). The beautician's own /dashboard/reviews page has
// its own separate, already-shipped create/edit UI (dashboard.reviews.tsx)
// that curates real testimonials from external sources (source/source_url
// columns) — this component is not a replacement for it and is not
// rendered there.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquareQuote, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= rating ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-border"
          }
          aria-hidden="true"
        />
      ))}
    </span>
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
        {text}
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

/**
 * Shared Reviews manager — the ONE component both the platform-wide
 * /admin/reviews list and the per-beautician /admin/beauticians/$slug
 * Reviews tab can render. Receives its data and moderation callbacks as
 * props; has no idea whether it's scoped to one beautician or all of them.
 */
export function ReviewsManager({
  title = "Reviews",
  subtitle = "Moderate testimonials shown on the public page.",
  reviews,
  isLoading,
  onModerate,
  onDelete,
  onSaved,
}: {
  title?: string;
  subtitle?: string;
  reviews: Tables<"reviews">[];
  isLoading: boolean;
  onModerate: (
    reviewId: string,
    updates: { is_published?: boolean; is_verified?: boolean },
  ) => Promise<void>;
  onDelete: (reviewId: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const moderate = useMutation({
    mutationFn: (vars: { reviewId: string; is_published?: boolean; is_verified?: boolean }) => {
      const { reviewId, ...updates } = vars;
      return onModerate(reviewId, updates);
    },
    onSuccess: onSaved,
    onError: (error: Error) => toast.error(error.message || "Failed to update review"),
  });

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this review? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      toast.success("Review deleted");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete review");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : reviews.length === 0 ? (
          <Card className="border-dashed border-border/70 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MessageSquareQuote className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">No reviews yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Testimonials added from the professional's own Reviews page will appear here for
                  moderation.
                </p>
              </div>
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
                        <StarRating rating={review.rating} />
                        {!review.is_published && <Badge variant="outline">Hidden</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[review.service_name, review.review_date].filter(Boolean).join(" · ") ||
                          "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={moderate.isPending}
                        onClick={() =>
                          moderate.mutate({
                            reviewId: review.id,
                            is_published: !review.is_published,
                          })
                        }
                      >
                        <Badge variant={review.is_published ? "default" : "secondary"}>
                          {review.is_published ? "Published" : "Hidden"}
                        </Badge>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={moderate.isPending}
                        onClick={() =>
                          moderate.mutate({
                            reviewId: review.id,
                            is_verified: !review.is_verified,
                          })
                        }
                      >
                        <Badge variant={review.is_verified ? "default" : "outline"}>
                          {review.is_verified ? "Verified" : "Unverified"}
                        </Badge>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete review by ${review.client_name}`}
                        disabled={deletingId === review.id}
                        onClick={() => void handleDelete(review.id)}
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
