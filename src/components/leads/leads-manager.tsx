// QA-1P — shared per-beautician Leads manager UI for the Admin workspace,
// matching the "context/config/loader" pattern established for
// ServicesManager, GalleryManager, FaqManager, ReviewsManager, etc. This is
// ADMIN-ONLY visibility + status moderation (list + status change) — it
// mirrors the existing platform-wide /admin/leads page's own scope
// (view + status, no create/edit/delete), just filtered to one
// professional. The full Leads mini-CRM (notes, activities, follow-ups,
// insights) lives entirely on the professional's own /dashboard/leads page
// and is not duplicated here.
//
// Product rule: a lead is an ENQUIRY, never a confirmed booking or
// transaction — this component only ever reads/relabels the existing
// `lead_status` enum values (via STATUS_ORDER/STATUS_META) and never
// implies a submission equals a booking.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_META, STATUS_ORDER, type LeadStatus } from "@/lib/lead-config";
import type { Tables } from "@/integrations/supabase/types";

export type LeadWithRelations = Tables<"leads"> & {
  services: Pick<Tables<"services">, "name"> | null;
  packages: Pick<Tables<"packages">, "name"> | null;
};

function LeadMessage({ text }: { text: string }) {
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
 * Shared Leads manager — the per-beautician Admin workspace tab. Receives
 * its data and the status-change callback as props; has no idea whether
 * it's driven by an admin's explicit-target session (the only session
 * type that renders it today).
 */
export function LeadsManager({
  title = "Leads",
  subtitle = "Enquiries submitted through this professional's public page.",
  leads,
  isLoading,
  onUpdateStatus,
}: {
  title?: string;
  subtitle?: string;
  leads: LeadWithRelations[];
  isLoading: boolean;
  onUpdateStatus: (leadId: string, status: LeadStatus) => Promise<void>;
}) {
  const updateStatus = useMutation({
    mutationFn: (vars: { leadId: string; status: LeadStatus }) =>
      onUpdateStatus(vars.leadId, vars.status),
    onError: (error: Error) => toast.error(error.message || "Failed to update lead"),
  });

  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : leads.length === 0 ? (
          <Card className="border-dashed border-border/70 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Inbox className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">No enquiries yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Enquiries submitted through this professional's public portfolio page will appear
                  here.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => (
              <Card key={lead.id} className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{lead.name ?? "—"}</p>
                        <Badge variant="outline" className={STATUS_META[lead.status].className}>
                          {STATUS_META[lead.status].label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[lead.phone, lead.email].filter(Boolean).join(" · ") || "No contact info"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          lead.services?.name ?? lead.service_requested,
                          lead.packages?.name,
                          lead.event_date,
                          lead.location,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Select
                        value={lead.status}
                        onValueChange={(value) =>
                          updateStatus.mutate({ leadId: lead.id, status: value as LeadStatus })
                        }
                      >
                        <SelectTrigger className="h-8 w-[150px]" disabled={updateStatus.isPending}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_META[status].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(lead.created_at).toLocaleDateString()}
                        {lead.source ? ` · ${lead.source}` : ""}
                      </p>
                    </div>
                  </div>
                  {lead.message && <LeadMessage text={lead.message} />}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
