import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/site/logo";
import { footerColumns } from "@/data/home";

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm0 18.15c-1.49 0-2.96-.4-4.25-1.16l-.3-.18-3.15.83.84-3.07-.2-.31a8.19 8.19 0 01-1.26-4.35c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 012.41 5.83c.02 4.54-3.68 8.23-8.15 8.23zm4.51-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29z" />
    </svg>
  );
}

/** Real app routes ("/privacy") get client-side navigation; same-page
 * hash anchors ("#pricing") stay plain <a> tags — matches the same
 * distinction already used in the site header. */
function FooterLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: string;
}) {
  if (href.startsWith("/")) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary/50">
      <div className="section-shell py-16">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              India&rsquo;s digital growth platform for beauty professionals. Portfolios, local SEO
              and direct enquiries — never commissions.
            </p>

            {/* WhatsApp Contact Number & WhatsApp Chat Button */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="https://wa.me/918320699679?text=Hi%20BeautyFolio%2C%20I%20need%20support."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98]"
              >
                <WhatsAppIcon className="h-4 w-4 fill-current shrink-0" />
                <span>Chat on WhatsApp</span>
              </a>

              <a
                href="https://wa.me/918320699679"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-foreground transition-colors hover:text-emerald-600"
              >
                <WhatsAppIcon className="h-4 w-4 text-emerald-600 fill-current shrink-0" />
                <span>8320699679</span>
                <span className="text-xs text-muted-foreground">(support)</span>
              </a>
            </div>
          </div>

          <nav aria-label="Footer" className="hidden gap-8 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-semibold">{col.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <FooterLink
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </FooterLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Mobile: collapsible groups */}
          <nav
            aria-label="Footer"
            className="-mt-4 divide-y divide-border border-y border-border sm:hidden"
          >
            {footerColumns.map((col) => (
              <details key={col.title} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-[15px] font-semibold">
                  {col.title}
                  <span
                    className="text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </summary>
                <ul className="pb-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <FooterLink
                        href={link.href}
                        className="flex min-h-11 items-center text-[15px] text-muted-foreground"
                      >
                        {link.label}
                      </FooterLink>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} BeautyFolio. Made in India for beauty professionals.</p>
          <p>Not a marketplace. Not a directory. Your own digital identity.</p>
        </div>
      </div>
    </footer>
  );
}
