// Client-side auth guard for routes that need a logged-in user.
// The Supabase browser client persists sessions in localStorage (see
// integrations/supabase/client.ts), not cookies, so there is no session
// available during SSR — this check only makes sense in the browser and is
// meant to be called from a route component's effect, not a server loader.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves to the current user id if a session exists, or null otherwise.
 * Callers should redirect to /login when this resolves to null.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Client-side route guard hook: redirects to /login if there is no session,
 * otherwise flips `checked` to true once confirmed. Intended for a single
 * shared layout route rather than being duplicated per protected page.
 */
export function useRequireAuth(): { checked: boolean } {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAuthenticatedUserId().then((userId) => {
      if (cancelled) return;
      if (!userId) {
        navigate({ to: "/login" });
        return;
      }
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return { checked };
}
