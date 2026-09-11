import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { getGtmId, isAnalyticsConfigured } from "../lib/analytics";
import { initAttribution } from "../lib/attribution";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null
          ? (error as { message?: string }).message || JSON.stringify(error)
          : String(error);

  const isChunkError =
    errorMessage.includes("Failed to fetch dynamically imported module") ||
    errorMessage.includes("error loading dynamically imported module") ||
    errorMessage.includes("Loading chunk");

  const handleRetry = () => {
    try {
      router.invalidate();
      reset();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  // If this is a chunk load error (from a new deployment replacing bundles), auto-reload once
  useEffect(() => {
    if (isChunkError && typeof window !== "undefined") {
      const storageKey = "chunk_retry_" + window.location.pathname;
      const lastRetry = sessionStorage.getItem(storageKey);
      if (!lastRetry || Date.now() - Number(lastRetry) > 10000) {
        sessionStorage.setItem(storageKey, String(Date.now()));
        window.location.reload();
      }
    }
  }, [isChunkError]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {isChunkError ? "Updating to latest version…" : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isChunkError
            ? "A new update was deployed. Click Reload below to load the latest version."
            : "Something went wrong on our end. You can try refreshing or head back home."}
        </p>
        {errorMessage && errorMessage !== "undefined" && errorMessage !== "[object Object]" && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-left">
            <p className="font-mono text-xs text-destructive break-all">
              {errorMessage}
            </p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={handleRetry}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {isChunkError ? "Reload" : "Try again"}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BeautyFolio — Digital Growth Platform for Beauty Professionals" },
      {
        name: "description",
        content:
          "BeautyFolio helps Indian beauty professionals build SEO portfolios, rank on Google and win direct client enquiries.",
      },
      { name: "author", content: "BeautyFolio" },
      { property: "og:site_name", content: "BeautyFolio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
    // Phase 3G.3 §4/§5/§27 — only injected when a real container ID is
    // configured (VITE_GTM_ID); never hardcoded. Standard async GTM loader
    // snippet — doesn't block rendering. Local dev / any deployment without
    // this env var renders with zero analytics scripts at all.
    scripts: isAnalyticsConfigured()
      ? [
          {
            children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${getGtmId()}');`,
          },
        ]
      : [],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const gtmId = getGtmId();
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Phase 3G.3 §4/§5 — GTM's standard <noscript> fallback, only
            rendered alongside the loader script above when a real
            container is configured. */}
        {gtmId && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="gtm"
            />
          </noscript>
        )}
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Phase 3G.3A §9/§10 — runs once per real page load (root mounts once
  // per browser navigation, never on internal TanStack Router Link
  // navigation), which is exactly what "capture on landing, preserve
  // through internal browsing" requires without any route-change tracking.
  useEffect(() => {
    initAttribution();

    const handlePreloadError = () => {
      window.location.reload();
    };
    window.addEventListener("vite:preloadError", handlePreloadError);
    return () => window.removeEventListener("vite:preloadError", handlePreloadError);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
