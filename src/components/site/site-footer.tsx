import { Logo } from "@/components/site/logo";
import { footerColumns } from "@/data/home";

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
          </div>

          <nav aria-label="Footer" className="hidden gap-8 sm:grid sm:grid-cols-3 lg:grid-cols-5">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-semibold">{col.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
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
                      <a
                        href={link.href}
                        className="flex min-h-11 items-center text-[15px] text-muted-foreground"
                      >
                        {link.label}
                      </a>
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
