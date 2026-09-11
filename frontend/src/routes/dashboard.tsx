import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  CreditCard,
  ExternalLink,
  HelpCircle,
  Image,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Search,
  Settings,
  Sparkles,
  SplitSquareHorizontal,
  Star,
  User,
  Video,
} from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { useRequireAuth } from "@/lib/require-auth";
import { isCurrentUserAdmin } from "@/lib/require-admin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/dashboard")({
  // Private/auth-gated area — every child route (/dashboard/*) inherits
  // this via TanStack Router's head merging, so no per-child duplication
  // is needed. Never indexed, regardless of what any child page renders.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: DashboardLayout,
});

const ensurePortfolioFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureOwnPortfolio } = await import("@/data/dashboard/provisioning.server");
    return ensureOwnPortfolio(context.supabase, context.userId);
  });

const getOwnProfileSummaryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnProfile } = await import("@/data/dashboard/profile.server");
    const profile = await getOwnProfile(context.supabase, context.userId);
    return {
      display_name: profile.display_name,
      profile_image_url: profile.profile_image_url,
      slug: profile.slug,
      status: profile.status,
    };
  });

const countNewLeadsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { countNewLeads } = await import("@/data/leads-query.server");
    return countNewLeads(context.supabase);
  });

/** `to: undefined` means the item is PLANNED — no route exists yet. Rendered
 * disabled in the sidebar rather than linking to a page that doesn't exist. */
const NAV_GROUPS: {
  heading: string;
  items: { label: string; icon: typeof User; to: string | undefined }[];
}[] = [
  {
    heading: "Overview",
    items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" }],
  },
  {
    heading: "My Portfolio",
    items: [
      { label: "Profile", icon: User, to: "/dashboard/profile" },
      { label: "Gallery", icon: Image, to: "/dashboard/gallery" },
      { label: "Before & After", icon: SplitSquareHorizontal, to: "/dashboard/before-after" },
      { label: "Videos", icon: Video, to: "/dashboard/videos" },
    ],
  },
  {
    heading: "Business",
    items: [
      { label: "Services", icon: Sparkles, to: "/dashboard/services" },
      { label: "Packages", icon: Package, to: "/dashboard/packages" },
      { label: "FAQs", icon: HelpCircle, to: "/dashboard/faqs" },
      { label: "Reviews", icon: Star, to: "/dashboard/reviews" },
      { label: "Availability", icon: Clock, to: "/dashboard/availability" },
      { label: "Service Areas", icon: MapPin, to: "/dashboard/areas" },
    ],
  },
  {
    heading: "Growth",
    items: [
      { label: "Leads", icon: Inbox, to: "/dashboard/leads" },
      { label: "SEO", icon: Search, to: "/dashboard/seo" },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Billing & Plan", icon: CreditCard, to: "/dashboard/billing" },
      { label: "Settings", icon: Settings, to: "/dashboard/settings" },
    ],
  },
];

function AppSidebar({
  pathname,
  newLeadsCount,
}: {
  pathname: string;
  newLeadsCount: number;
}) {
  const { setOpenMobile, isMobile } = useSidebar();

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-1">
        {/* Icon mark always shows; the wordmark hides once the sidebar
            collapses to its icon-only rail. The header's own padding also
            shrinks in that state — at the default p-3, the 48px icon rail
            only has 24px of content space left, smaller than the 36px icon
            mark itself, which is what was clipping it even with the text
            hidden. p-1 leaves 40px, comfortably fitting the icon centered. */}
        <span className="inline-flex items-center gap-2">
          <span className="bg-gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <Sparkles className="h-4.5 w-4.5 text-primary-foreground" aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight whitespace-nowrap group-data-[collapsible=icon]:hidden">
            Beauty<span className="text-gradient-brand">Folio</span>
          </span>
        </span>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.heading}>
            <SidebarGroupLabel>{group.heading}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    !!item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`));
                  return (
                    <SidebarMenuItem key={item.label}>
                      {item.to ? (
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                          <Link to={item.to} onClick={handleNavClick}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          disabled
                          aria-disabled="true"
                          className="cursor-not-allowed opacity-60"
                          tooltip={`${item.label} — planned, not yet available`}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                      {item.to === "/dashboard/leads" && newLeadsCount > 0 && (
                        <SidebarMenuBadge className="bg-destructive text-destructive-foreground">
                          {newLeadsCount > 99 ? "99+" : newLeadsCount}
                        </SidebarMenuBadge>
                      )}
                      {!item.to && (
                        <SidebarMenuBadge className="text-[10px] tracking-wide text-muted-foreground uppercase">
                          Soon
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

function DashboardLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { checked } = useRequireAuth();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };
  const isAdminQuery = useQuery({
    queryKey: ["is-current-user-admin"],
    queryFn: () => isCurrentUserAdmin(),
    enabled: checked,
  });
  // Ensures a brand-new signup has a draft beautician_profiles row before
  // any Builder page tries to read/write "their" profile — idempotent, an
  // instant no-op check on every visit after the first.
  const ensureQuery = useQuery({
    queryKey: ["ensure-own-portfolio"],
    queryFn: () => ensurePortfolioFn(),
    enabled: checked,
  });
  const profileQuery = useQuery({
    queryKey: ["own-profile-summary"],
    queryFn: () => getOwnProfileSummaryFn(),
    enabled: ensureQuery.isSuccess,
  });
  const newLeadsQuery = useQuery({
    queryKey: ["new-leads-count"],
    queryFn: () => countNewLeadsFn(),
    enabled: ensureQuery.isSuccess,
    refetchInterval: 30_000,
  });
  const newLeadsCount = newLeadsQuery.data ?? 0;

  if (!checked || (!ensureQuery.isSuccess && !ensureQuery.isError)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {checked ? "Setting up your portfolio…" : "Checking session…"}
      </div>
    );
  }

  if (ensureQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-destructive">
        {(ensureQuery.error as Error).message || "Failed to set up your portfolio."}
      </div>
    );
  }

  const name = profileQuery.data?.display_name;
  const photo = profileQuery.data?.profile_image_url;
  const slug = profileQuery.data?.slug;
  const profileStatus = profileQuery.data?.status;
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <SidebarProvider>
      <AppSidebar pathname={pathname} newLeadsCount={newLeadsCount} />

      <SidebarInset>
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
          <SidebarTrigger className="shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            {name && (
              <div className="flex items-center gap-2">
                {photo ? (
                  <img
                    src={photo}
                    alt={name}
                    className="h-8 w-8 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                    {initial}
                  </span>
                )}
                <span className="text-sm font-medium">{name}</span>
              </div>
            )}
            {slug && profileStatus === "published" && (
              <Link
                to="/portfolio/$slug"
                params={{ slug }}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Public Portfolio
              </Link>
            )}
            {slug && profileStatus !== "published" && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                Portfolio: {profileStatus ?? "draft"}
              </span>
            )}
            {isAdminQuery.data && (
              <Link
                to="/admin"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Admin console
              </Link>
            )}
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
        </header>
        <div className="px-4 py-6 sm:px-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
