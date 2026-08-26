// Server-only. Platform-wide user/role management for admins.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";

export type AdminUserSummary = {
  authUserId: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  roles: Database["public"]["Enums"]["app_role"][];
};

export async function listUsersWithRoles(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminUserSummary[]> {
  await assertIsAdmin(supabase, userId);

  const [profilesRes, rolesRes] = await Promise.all([
    supabase.from("profiles").select("auth_user_id, display_name, email, created_at"),
    supabase.from("user_roles").select("user_id, role"),
  ]);

  if (profilesRes.error) throw new Error(`Failed to load users: ${profilesRes.error.message}`);
  if (rolesRes.error) throw new Error(`Failed to load roles: ${rolesRes.error.message}`);

  const rolesByUser = new Map<string, Database["public"]["Enums"]["app_role"][]>();
  for (const row of rolesRes.data ?? []) {
    const list = rolesByUser.get(row.user_id) ?? [];
    list.push(row.role);
    rolesByUser.set(row.user_id, list);
  }

  return (profilesRes.data ?? [])
    .map((profile) => ({
      authUserId: profile.auth_user_id,
      displayName: profile.display_name,
      email: profile.email,
      createdAt: profile.created_at,
      roles: rolesByUser.get(profile.auth_user_id) ?? [],
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function grantAdminRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetAuthUserId: string,
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: targetAuthUserId, role: "admin" });
  if (error) throw new Error(`Failed to grant admin role: ${error.message}`);

  await logAdminAction(supabase, "admin_role_granted", "user_role", targetAuthUserId, null, {
    role: "admin",
  });
}

export async function revokeAdminRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetAuthUserId: string,
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  if (targetAuthUserId === userId) {
    throw new Error("You cannot revoke your own admin access.");
  }

  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", targetAuthUserId)
    .eq("role", "admin");
  if (error) throw new Error(`Failed to revoke admin role: ${error.message}`);

  await logAdminAction(
    supabase,
    "admin_role_revoked",
    "user_role",
    targetAuthUserId,
    { role: "admin" },
    null,
  );
}
