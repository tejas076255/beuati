import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";

import { useRequireAdmin } from "@/lib/require-admin";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  // Private/auth-gated area — every child route (/admin/*) inherits this
  // via TanStack Router's head merging, so no per-child duplication is
  // needed. Never indexed, regardless of what any child page renders.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminLayout,
});

const NAV_GROUPS = [
  {
    heading: "Overview",
    items: [{ to: "/admin", label: "Dashboard" }],
  },
  {
    heading: "Manage",
    items: [
      { to: "/admin/profiles", label: "Professionals" },
      { to: "/admin/leads", label: "Leads" },
      { to: "/admin/reviews", label: "Reviews" },
    ],
  },
  {
    heading: "Content",
    items: [
      { to: "/admin/services", label: "Services" },
      { to: "/admin/sources", label: "Sources" },
    ],
  },
  {
    heading: "Platform",
    items: [
      { to: "/admin/users", label: "Users & Roles" },
      { to: "/admin/audit-logs", label: "Audit Logs" },
    ],
  },
] as const;

function AdminLayout() {
  const navigate = useNavigate();
  const { checked } = useRequireAdmin();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
          <span className="font-display text-lg font-semibold tracking-tight">
            BeautyFolio <span className="text-muted-foreground">Admin</span>
          </span>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard/leads"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Back to my dashboard
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              Log out
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8 sm:px-8">
        <nav className="w-48 shrink-0 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="px-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                {group.heading}
              </p>
              <div className="mt-1 space-y-1">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    {...(item.to === "/admin" ? { activeOptions: { exact: true } } : {})}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                    )}
                    activeProps={{ className: "bg-secondary text-foreground" }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
