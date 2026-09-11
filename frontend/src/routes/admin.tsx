import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  BarChart2,
  BookOpen,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LogOut,
  Share2,
  Sparkles,
  Star,
  Users,
  Users2,
} from "lucide-react";

import { useRequireAdmin } from "@/lib/require-admin";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
};

type NavGroup = {
  heading: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    heading: "Manage",
    items: [
      { to: "/admin/profiles", label: "Professionals", icon: Users },
      { to: "/admin/leads", label: "Leads", icon: Inbox },
      { to: "/admin/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    heading: "Content",
    items: [
      { to: "/admin/services", label: "Services", icon: Sparkles },
      { to: "/admin/sources", label: "Sources", icon: Share2 },
    ],
  },
  {
    heading: "Platform",
    items: [
      { to: "/admin/users", label: "Staff & Roles", icon: Users2 },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ClipboardList },
    ],
  },
];

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
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="gap-1.5 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8 sm:px-8">
        {/* ── Sidebar nav ──────────────────────────────────────────────── */}
        <nav className="w-48 shrink-0 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {group.heading}
              </p>
              <div className="mt-1 space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    {...(item.exact ? { activeOptions: { exact: true } } : {})}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground",
                    )}
                    activeProps={{ className: "bg-secondary text-foreground" }}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Page content ─────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
