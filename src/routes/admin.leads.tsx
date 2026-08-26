import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Database } from "@/integrations/supabase/types";
import type { AdminLeadSummary } from "@/data/admin/leads.server";

export const Route = createFileRoute("/admin/leads")({
  component: LeadsPage,
});

const LEAD_STATUSES: Database["public"]["Enums"]["lead_status"][] = [
  "new",
  "contacted",
  "qualified",
  "booked",
  "lost",
  "archived",
];

const listLeadsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAllLeads } = await import("@/data/admin/leads.server");
    return listAllLeads(context.supabase, context.userId);
  });

const updateLeadStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { leadId: string; status: Database["public"]["Enums"]["lead_status"] }) => data)
  .handler(async ({ context, data }) => {
    const { updateLeadStatusAdmin } = await import("@/data/admin/leads.server");
    await updateLeadStatusAdmin(context.supabase, context.userId, data.leadId, data.status);
  });

function statusBadgeVariant(status: Database["public"]["Enums"]["lead_status"]) {
  switch (status) {
    case "booked":
      return "default" as const;
    case "lost":
    case "archived":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

const ALL = "__all__";

function LeadDetailDialog({
  lead,
  onClose,
}: {
  lead: AdminLeadSummary | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lead details</DialogTitle>
        </DialogHeader>
        {lead && (
          <dl className="space-y-3 text-sm">
            {[
              ["Lead ID", lead.id],
              ["Name", lead.name ?? "—"],
              ["Phone", lead.phone ?? "—"],
              ["Email", lead.email ?? "—"],
              ["Professional", lead.beautician_profiles?.display_name ?? "—"],
              ["Service", lead.services?.name ?? "—"],
              ["Package", lead.packages?.name ?? "—"],
              ["Event date", lead.event_date ?? "—"],
              ["Location", lead.location ?? "—"],
              ["Message", lead.message ?? "—"],
              ["Source", lead.source ?? "—"],
              ["Status", lead.status],
              ["Created", new Date(lead.created_at).toLocaleString()],
              ["Last updated", new Date(lead.updated_at).toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="col-span-2 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LeadsPage() {
  const queryClient = useQueryClient();
  const leadsQuery = useQuery({ queryKey: ["admin-leads"], queryFn: () => listLeadsFn() });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [professionalFilter, setProfessionalFilter] = useState<string>(ALL);
  const [serviceFilter, setServiceFilter] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [selectedLead, setSelectedLead] = useState<AdminLeadSummary | null>(null);

  const updateStatus = useMutation({
    mutationFn: (vars: { leadId: string; status: Database["public"]["Enums"]["lead_status"] }) =>
      updateLeadStatusFn({ data: vars }),
    onSuccess: () => {
      toast.success("Lead status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-leads"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update lead"),
  });

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);

  const professionals = useMemo(
    () =>
      Array.from(
        new Set(leads.map((l) => l.beautician_profiles?.display_name).filter(Boolean)),
      ) as string[],
    [leads],
  );
  const services = useMemo(
    () => Array.from(new Set(leads.map((l) => l.services?.name).filter(Boolean))) as string[],
    [leads],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = leads.filter((lead) => {
      if (statusFilter !== ALL && lead.status !== statusFilter) return false;
      if (
        professionalFilter !== ALL &&
        lead.beautician_profiles?.display_name !== professionalFilter
      )
        return false;
      if (serviceFilter !== ALL && lead.services?.name !== serviceFilter) return false;
      if (dateFrom && lead.created_at < dateFrom) return false;
      if (dateTo && lead.created_at > `${dateTo}T23:59:59`) return false;
      if (q) {
        const haystack = [
          lead.name,
          lead.phone,
          lead.email,
          lead.beautician_profiles?.display_name,
          lead.services?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) =>
      sortOrder === "newest"
        ? b.created_at.localeCompare(a.created_at)
        : a.created_at.localeCompare(b.created_at),
    );
    return rows;
  }, [leads, search, statusFilter, professionalFilter, serviceFilter, dateFrom, dateTo, sortOrder]);

  const counts = useMemo(
    () => ({
      total: leads.length,
      new: leads.filter((l) => l.status === "new").length,
      qualified: leads.filter((l) => l.status === "qualified").length,
      booked: leads.filter((l) => l.status === "booked").length,
      lost: leads.filter((l) => l.status === "lost").length,
    }),
    [leads],
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Leads</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enquiries submitted across every beautician's portfolio.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Total", counts.total],
          ["New", counts.new],
          ["Qualified", counts.qualified],
          ["Booked", counts.booked],
          ["Lost", counts.lost],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, phone, email, professional, service…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {LEAD_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Professional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All professionals</SelectItem>
            {professionals.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All services</SelectItem>
            {services.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[150px]"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[150px]"
        />
        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {leadsQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : leadsQuery.isError ? (
          <p className="p-6 text-sm text-destructive">
            {(leadsQuery.error as Error).message || "Admin access required."}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No leads match these filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Professional</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.beautician_profiles?.display_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.services?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.source ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={lead.status}
                      onValueChange={(value) =>
                        updateStatus.mutate({
                          leadId: lead.id,
                          status: value as Database["public"]["Enums"]["lead_status"],
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue>
                          <Badge variant={statusBadgeVariant(lead.status)}>{lead.status}</Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedLead(lead)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <LeadDetailDialog lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
