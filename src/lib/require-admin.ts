// Client-side auth guard for the standalone /admin console. UX-only — the
// real authorization boundary is assertIsAdmin() inside every admin/*.server.ts
// function (backed by RLS), unchanged by this guard. Mirrors require-auth.ts.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getAuthenticatedUserId } from "./require-auth";

/**
 * Resolves true if the current session belongs to a user with the 'admin'
 * role. Relies on user_roles_select_own RLS, which already lets any
 * authenticated user read their own role rows.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return false;

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  return !!data;
}

/**
 * Client-side route guard hook for /admin: redirects to /login if there's no
 * session, to /dashboard/leads if the session isn't an admin, otherwise
 * flips `checked` to true once confirmed.
 */
export function useRequireAdmin(): { checked: boolean } {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = await getAuthenticatedUserId();
      if (cancelled) return;
      if (!userId) {
        navigate({ to: "/login" });
        return;
      }

      const isAdmin = await isCurrentUserAdmin();
      if (cancelled) return;
      if (!isAdmin) {
        navigate({ to: "/dashboard/leads" });
        return;
      }

      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return { checked };
}
