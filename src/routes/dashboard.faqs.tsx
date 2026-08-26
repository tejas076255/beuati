import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { HelpCircle } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

export const Route = createFileRoute("/dashboard/faqs")({
  component: FaqsPage,
});

const listFaqsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnFaqs } = await import("@/data/dashboard/faqs.server");
    return listOwnFaqs(context.supabase, context.userId);
  });

const createFaqFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: FaqInput) => data)
  .handler(async ({ context, data }) => {
    const { createFaq } = await import("@/data/dashboard/faqs.server");
    await createFaq(context.supabase, context.userId, data);
  });

const updateFaqFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string } & Partial<FaqInput>) => data)
  .handler(async ({ context, data }) => {
    const { updateFaq } = await import("@/data/dashboard/faqs.server");
    const { id, ...updates } = data;
    await updateFaq(context.supabase, id, updates);
  });

const deleteFaqFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteFaq } = await import("@/data/dashboard/faqs.server");
    await deleteFaq(context.supabase, data.id);
  });

const faqSchema = z.object({
  question: z.string().trim().min(1, "Required"),
  answer: z.string().trim().min(1, "Required"),
  is_published: z.boolean(),
});
type FaqFormValues = z.infer<typeof faqSchema>;
const EMPTY: FaqFormValues = { question: "", answer: "", is_published: true };

function FaqFormDialog({ faq, onSaved }: { faq?: Tables<"faqs">; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<FaqFormValues>({ resolver: zodResolver(faqSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    form.reset(
      faq ? { question: faq.question, answer: faq.answer, is_published: faq.is_published } : EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, faq]);

  const save = useMutation({
    mutationFn: (values: FaqFormValues) =>
      faq ? updateFaqFn({ data: { id: faq.id, ...values } }) : createFaqFn({ data: values }),
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

function FaqsPage() {
  const queryClient = useQueryClient();
  const faqsQuery = useQuery({ queryKey: ["own-faqs"], queryFn: () => listFaqsFn() });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFaqFn({ data: { id } }),
    onSuccess: () => {
      toast.success("FAQ deleted");
      queryClient.invalidateQueries({ queryKey: ["own-faqs"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete FAQ"),
  });

  const faqs = faqsQuery.data ?? [];
  const onSaved = () => queryClient.invalidateQueries({ queryKey: ["own-faqs"] });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">FAQs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Questions shown on your portfolio.</p>
        </div>
        <FaqFormDialog onSaved={onSaved} />
      </div>

      <div className="mt-6">
        {faqsQuery.isLoading ? (
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
                  Answer common client questions to help visitors feel confident about booking with
                  you.
                </p>
              </div>
              <FaqFormDialog onSaved={onSaved} />
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
                      <FaqFormDialog faq={faq} onSaved={onSaved} />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete FAQ: ${faq.question}`}
                        onClick={() => {
                          if (window.confirm("Delete this FAQ?")) remove.mutate(faq.id);
                        }}
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
