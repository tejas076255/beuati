import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/site/logo";
import { SiteFooter } from "@/components/site/site-footer";
import { legalConfig } from "@/lib/legal-config";

/**
 * Shared layout for /privacy, /terms, /refund-policy — a plain,
 * constrained-width prose page with a consistent header (brand + back
 * link), an effective/last-updated line, and the normal site footer.
 * Deliberately minimal: no redesign, no new visual system.
 */
export function LegalPageLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="section-shell flex h-16 items-center justify-between">
          <Link to="/" aria-label="BeautyFolio home">
            <Logo />
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1 py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-8">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Effective {legalConfig.effectiveDate} · Last updated {legalConfig.lastUpdated}
          </p>
          <div className="mt-10 max-w-none space-y-8 text-[15px] leading-relaxed text-foreground [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-muted-foreground">
            {children}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
