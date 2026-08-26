import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAuthenticatedUserId } from "@/lib/require-auth";
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

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});

const listUsersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listUsersWithRoles } = await import("@/data/admin/roles.server");
    return listUsersWithRoles(context.supabase, context.userId);
  });

const grantAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetAuthUserId: string }) => data)
  .handler(async ({ context, data }) => {
    const { grantAdminRole } = await import("@/data/admin/roles.server");
    await grantAdminRole(context.supabase, context.userId, data.targetAuthUserId);
  });

const revokeAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { targetAuthUserId: string }) => data)
  .handler(async ({ context, data }) => {
    const { revokeAdminRole } = await import("@/data/admin/roles.server");
    await revokeAdminRole(context.supabase, context.userId, data.targetAuthUserId);
  });

function UsersPage() {
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ["current-auth-user-id"],
    queryFn: () => getAuthenticatedUserId(),
  });
  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: () => listUsersFn() });

  const grant = useMutation({
    mutationFn: (targetAuthUserId: string) => grantAdminFn({ data: { targetAuthUserId } }),
    onSuccess: () => {
      toast.success("Admin access granted");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to grant admin access"),
  });

  const revoke = useMutation({
    mutationFn: (targetAuthUserId: string) => revokeAdminFn({ data: { targetAuthUserId } }),
    onSuccess: () => {
      toast.success("Admin access revoked");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to revoke admin access"),
  });

  const currentUserId = currentUserQuery.data;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Users & Roles</h1>
      <p className="mt-1 text-sm text-muted-foreground">Grant or revoke platform admin access.</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {usersQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : usersQuery.isError ? (
          <p className="p-6 text-sm text-destructive">
            {(usersQuery.error as Error).message || "Admin access required."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersQuery.data ?? []).map((user) => {
                const isAdmin = user.roles.includes("admin");
                const isSelf = user.authUserId === currentUserId;
                return (
                  <TableRow key={user.authUserId}>
                    <TableCell className="font-medium">{user.displayName || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {user.roles.map((role) => (
                          <Badge key={role} variant={role === "admin" ? "default" : "outline"}>
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">You</span>
                      ) : isAdmin ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Revoke admin access for ${user.displayName || user.email}?`,
                              )
                            )
                              revoke.mutate(user.authUserId);
                          }}
                        >
                          Revoke admin
                        </Button>
                      ) : (
                        <Button
                          variant="softline"
                          size="sm"
                          disabled={grant.isPending}
                          onClick={() => grant.mutate(user.authUserId)}
                        >
                          Make admin
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
