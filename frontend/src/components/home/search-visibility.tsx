import { MessageCircle, Search, Star } from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
import { searchVisibility } from "@/data/home";

export function SearchVisibilityShowcase() {
  const { query, result, outcomes } = searchVisibility;

  return (
    <section id="visibility" className="relative overflow-hidden bg-background py-32 sm:py-40">
      <div
        aria-hidden="true"
        className="bg-beauty-bloom pointer-events-none absolute inset-0 opacity-60"
      />

      <div className="section-shell relative">
        <Reveal className="max-w-2xl">
          <span className="eyebrow">Search visibility</span>
          <h2 className="font-display mt-7 text-4xl leading-[1.1] font-semibold text-balance text-primary sm:text-5xl">
            This is what ranking on Google actually{" "}
            <span className="text-gradient-brand">looks like</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            One search. One result that answers everything a bride wants to know — and a direct line
            to you.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-12 lg:grid-cols-[1.55fr_1fr] lg:items-center lg:gap-16 [&>*]:min-w-0">
          <Reveal>
            <div className="animate-float shadow-lift overflow-hidden rounded-[1.75rem] border border-border bg-card text-card-foreground">
              <div className="flex items-center gap-3 border-b border-border px-6 py-4">
                <span className="font-display text-lg font-semibold tracking-tight">Google</span>
                <span className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-2 text-sm text-muted-foreground">
                  <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{query}</span>
                </span>
              </div>

              <div className="space-y-7 p-7 sm:p-9">
                <p className="text-xs text-muted-foreground">About 84,300 results (0.42 seconds)</p>

                <article className="shadow-soft rounded-2xl border border-primary/20 bg-background p-6">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
                      {result.rank}
                    </span>
                    <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                      {result.source}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{result.breadcrumb}</p>
                  <h3 className="font-display mt-1.5 text-xl leading-snug font-semibold text-primary">
                    {result.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex text-accent" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-current" />
                      ))}
                    </span>
                    <span className="font-semibold">{result.rating}</span>
                    <span className="text-muted-foreground">· {result.reviews}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {result.description}
                  </p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {result.chips.map((chip) => (
                      <li
                        key={chip}
                        className="rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-secondary-foreground"
                      >
                        {chip}
                      </li>
                    ))}
                  </ul>
                </article>

                <div className="space-y-2 opacity-45" aria-hidden="true">
                  {[
                    "Marketplace listing · 40 artists near you",
                    "Directory · Top 10 makeup artists",
                  ].map((line) => (
                    <div key={line} className="rounded-xl border border-dashed border-border p-4">
                      <div className="h-2 w-28 rounded bg-muted" />
                      <p className="mt-2 text-sm text-muted-foreground">{line}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="flex flex-col divide-y divide-border">
              {outcomes.map((o) => (
                <div key={o.label} className="py-7 first:pt-0">
                  <p className="text-sm font-medium text-muted-foreground">{o.label}</p>
                  <p className="font-display text-gradient-brand mt-2 text-5xl font-semibold">
                    {o.delta}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{o.detail}</p>
                </div>
              ))}

              <div className="flex items-center gap-3 pt-7">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary">
                  <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                <p className="text-sm text-muted-foreground">
                  Every one of those clicks lands in your WhatsApp — not a marketplace inbox.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
