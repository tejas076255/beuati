// Phase 5.2G — shared FAQs manager UI, extracted from
// src/routes/dashboard.faqs.tsx so both the beautician's own
// /dashboard/faqs page and the Master Admin Console's
// /admin/beauticians/$slug FAQs section render the identical
// presentational component. Nothing here knows whether it's being driven
// by the beautician's own session or an admin's explicit-target session —
// it only receives data and calls the onCreate/onUpdate/onDelete callbacks
// it's given, matching the exact "context/config/loader" pattern already
// established for ServicesManager (5.2A), ProfileManager (5.2B),
// GalleryManager (5.2C), BeforeAfterManager (5.2D), VideoManager (5.2E),
// and PackageManager (5.2F). No behavior change from the original
// dashboard.faqs.tsx — this is a mechanical extraction. No reorder UI
// exists in the current product (sort_order is a persisted column with no
// user-facing move-up/down control) — none is introduced here.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { HelpCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { FaqInput } from "@/data/dashboard/faqs.server";

const faqSchema = z.object({
  question: z.string().trim().min(1, "Required"),
  answer: z.string().trim().min(1, "Required"),
  is_published: z.boolean(),
});
type FaqFormValues = z.infer<typeof faqSchema>;
const EMPTY: FaqFormValues = { question: "", answer: "", is_published: true };

function FaqFormDialog({
  faq,
  onCreate,
  onUpdate,
  onSaved,
}: {
  faq?: Tables<"faqs">;
  onCreate: (input: FaqInput) => Promise<void>;
  onUpdate: (id: string, updates: Partial<FaqInput>) => Promise<void>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<FaqFormValues>({ resolver: zodResolver(faqSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    form.reset(
      faq ? { question: faq.question, answer: faq.answer, is_published: faq.is_published } : EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, faq?.id]);

  const save = useMutation({
    mutationFn: (values: FaqFormValues) => (faq ? onUpdate(faq.id, values) : onCreate(values)),
    onSuccess: () => {
      toast.success(faq ? "FAQ updated" : "FAQ added");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save FAQ"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {faq ? (
          <Button variant="softline" size="sm">
            Edit
          </Button>
        ) : (
          <Button variant="hero">Add FAQ</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{faq ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="question"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Question
                    <span className="text-destructive" aria-hidden="true">
                      {" "}
                      *
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="How much does bridal makeup cost?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="answer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Answer
                    <span className="text-destructive" aria-hidden="true">
                      {" "}
                      *
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Give a clear, friendly answer a client would find reassuring."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_published"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Published (visible on the portfolio)</FormLabel>
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

function FaqAnswer({ answer }: { answer: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = answer.length > 180;

  return (
    <div className="mt-2">
      <p
        className={
          expanded || !isLong
            ? "text-sm text-muted-foreground"
            : "line-clamp-2 text-sm text-muted-foreground"
        }
      >
        {answer}
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
 * Shared FAQs manager — the ONE component both /dashboard/faqs and the
 * admin workspace's FAQs section render. Receives its data and mutation
 * callbacks as props; has no idea whether it's driven by the beautician's
 * own session or an admin's explicit-target session.
 */
export function FaqManager({
  title = "FAQs",
  subtitle = "Questions shown on the portfolio.",
  faqs,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
  onSaved,
}: {
  title?: string;
  subtitle?: string;
  faqs: Tables<"faqs">[];
  isLoading: boolean;
  onCreate: (input: FaqInput) => Promise<void>;
  onUpdate: (id: string, updates: Partial<FaqInput>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this FAQ?")) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      toast.success("FAQ deleted");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete FAQ");
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
        <FaqFormDialog onCreate={onCreate} onUpdate={onUpdate} onSaved={onSaved} />
      </div>

      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : faqs.length === 0 ? (
          <Card className="border-dashed border-border/70 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <HelpCircle className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">No FAQs added yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Answer common client questions to help visitors feel confident about booking.
                </p>
              </div>
              <FaqFormDialog onCreate={onCreate} onUpdate={onUpdate} onSaved={onSaved} />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {faqs.map((faq) => (
              <Card key={faq.id} className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{faq.question}</p>
                      {!faq.is_published && <Badge variant="outline">Hidden</Badge>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <FaqFormDialog
                        faq={faq}
                        onCreate={onCreate}
                        onUpdate={onUpdate}
                        onSaved={onSaved}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete FAQ: ${faq.question}`}
                        disabled={deletingId === faq.id}
                        onClick={() => void handleDelete(faq.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <FaqAnswer answer={faq.answer} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
