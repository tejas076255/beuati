import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FaqManager } from "@/components/faqs/faq-manager";
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
    await updateFaq(context.supabase, context.userId, id, updates);
  });

const deleteFaqFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { deleteFaq } = await import("@/data/dashboard/faqs.server");
    await deleteFaq(context.supabase, context.userId, data.id);
  });

const OWN_FAQS_QUERY_KEY = ["own-faqs"];

function FaqsPage() {
  const queryClient = useQueryClient();
  const faqsQuery = useQuery({ queryKey: OWN_FAQS_QUERY_KEY, queryFn: () => listFaqsFn() });

  const onSaved = () => queryClient.invalidateQueries({ queryKey: OWN_FAQS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: FaqInput) => createFaqFn({ data: input }),
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; updates: Partial<FaqInput> }) =>
      updateFaqFn({ data: { id: vars.id, ...vars.updates } }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFaqFn({ data: { id } }),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <FaqManager
        faqs={faqsQuery.data ?? []}
        isLoading={faqsQuery.isLoading}
        onCreate={(input) => createMutation.mutateAsync(input)}
        onUpdate={(id, updates) => updateMutation.mutateAsync({ id, updates })}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        onSaved={onSaved}
      />
    </div>
  );
}
