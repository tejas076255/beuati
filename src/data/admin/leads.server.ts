// Server-only. Platform-wide leads visibility for admins.
// leads_owner_read/update RLS already resolves true for admins via
// owns_beautician_profile()'s built-in has_role(...,'admin') OR-clause — no
// new RLS needed, this is pure app-layer visibility across every beautician.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";

export type AdminLeadSummary = Tables<"leads"> & {
  beautician_profiles: Pick<Tables<"beautician_profiles">, "display_name" | "slug"> | null;
  services: Pick<Tables<"services">, "name"> | null;
  packages: Pick<Tables<"packages">, "name"> | null;
};

export async function listAllLeads(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminLeadSummary[]> {
  await assertIsAdmin(supabase, userId);

  const { data, error } = await supabase
    .from("leads")
    .select("*, beautician_profiles(display_name, slug), services(name), packages(name)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load leads: ${error.message}`);
  return data ?? [];
}

export async function updateLeadStatusAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  leadId: string,
  status: Database["public"]["Enums"]["lead_status"],
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw new Error(`Failed to update lead: ${error.message}`);
}
