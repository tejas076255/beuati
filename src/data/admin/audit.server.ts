// Server-only. Shared audit-logging helper + platform-wide audit reader.
// Writes go through log_admin_action(), a SECURITY DEFINER function — no
// client (including an admin's own session) has an INSERT grant on
// audit_logs directly. See migration 20260820070918_admin_audit_logs.sql.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";

export type AdminAuditAction = Database["public"]["Enums"]["admin_audit_action"];
export type AdminAuditEntityType = Database["public"]["Enums"]["admin_audit_entity_type"];

/**
 * Records an audit event for an admin action that has already succeeded.
 * Intentionally non-throwing: a failed audit write must not make an admin's
 * real, already-completed action appear to have failed. Logged to the
 * server console for operational visibility instead.
 */
export async function logAdminAction(
  supabase: SupabaseClient<Database>,
  action: AdminAuditAction,
  entityType: AdminAuditEntityType,
  entityId: string,
  oldValue: Json | null,
  newValue: Json | null,
): Promise<void> {
  const { error } = await supabase.rpc("log_admin_action", {
    _action: action,
    _entity_type: entityType,
    _entity_id: entityId,
    _old_value: oldValue,
    _new_value: newValue,
  });
  if (error) {
    console.error("[admin/audit] failed to record audit event", action, entityId, error);
  }
}

export type AdminAuditLogEntry = Tables<"audit_logs"> & {
  actorName: string | null;
  actorEmail: string | null;
};

// Read is admin-only and capped at the 500 most recent events — simple,
// bounded, matches the "do not overbuild" scope for Step 3. Pagination can
// be added later if the table grows past what one page can show usefully.
export async function listAuditLogs(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminAuditLogEntry[]> {
  await assertIsAdmin(supabase, userId);

  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to load audit logs: ${error.message}`);

  const rows = data ?? [];
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id)));
  if (actorIds.length === 0) {
    return rows.map((r) => ({ ...r, actorName: null, actorEmail: null }));
  }

  const { data: actors, error: actorsError } = await supabase
    .from("profiles")
    .select("auth_user_id, display_name, email")
    .in("auth_user_id", actorIds);
  if (actorsError) throw new Error(`Failed to load audit actors: ${actorsError.message}`);

  const byId = new Map((actors ?? []).map((a) => [a.auth_user_id, a]));
  return rows.map((r) => ({
    ...r,
    actorName: byId.get(r.actor_user_id)?.display_name ?? null,
    actorEmail: byId.get(r.actor_user_id)?.email ?? null,
  }));
}
