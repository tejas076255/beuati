import { useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Share2,
  Sparkles,
  Star,
  Users,
  Users2,
  X,
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

// ── Shared nav link list (used in both sidebar + mobile drawer) ──────────────
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
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
                onClick={onNavigate}
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
  );
}

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { checked } = useRequireAdmin();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  // Current page label for mobile header breadcrumb
  const currentLabel = NAV_GROUPS.flatMap((g) => g.items).find((item) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to),
  )?.label ?? "Admin";

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Left: hamburger (mobile) + wordmark */}
          <div className="flex items-center gap-2">
            {/* Hamburger — only on mobile */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 lg:hidden"
              aria-label="Open navigation"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">
              <span className="hidden sm:inline">BeautyFolio </span>
              <span className="text-muted-foreground">Admin</span>
            </span>
            {/* Mobile breadcrumb — shows current section */}
            <span className="text-sm text-muted-foreground lg:hidden">
              / {currentLabel}
            </span>
          </div>

          {/* Right: back link + sign out */}
          <div className="flex items-center gap-1 sm:gap-3">
            <Link
              to="/dashboard/leads"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:block"
            >
              Back to dashboard
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="gap-1.5 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer overlay ─────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          aria-modal="true"
          role="dialog"
          aria-label="Navigation"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-display text-base font-semibold tracking-tight">
                BeautyFolio <span className="text-muted-foreground">Admin</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-4">
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
            </div>
            {/* Back to dashboard link at bottom of drawer */}
            <div className="border-t border-border p-3">
              <Link
                to="/dashboard/leads"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              >
                ← Back to my dashboard
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
        {/* Sidebar — desktop only */}
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-20">
            <NavLinks />
          </div>
        </aside>

        {/* Page content */}
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
