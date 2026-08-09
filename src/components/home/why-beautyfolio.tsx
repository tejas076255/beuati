import {
  BarChart3,
  Crown,
  Globe,
  LayoutTemplate,
  MapPin,
  Palette,
  PenLine,
  Search,
  Sparkles,
  Star,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
import { bento } from "@/data/home";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  Search,
  MapPin,
  Sparkles,
  LayoutTemplate,
  BarChart3,
  Star,
  PenLine,
  Crown,
  Zap,
  Palette,
  Globe,
};

const spans = [
  "md:col-span-4 md:row-span-2",
  "md:col-span-2 md:row-span-1",
  "md:col-span-2 md:row-span-2",
  "md:col-span-2 md:row-span-1",
  "md:col-span-4 md:row-span-2",
  "md:col-span-2 md:row-span-1",
  "md:col-span-3 md:row-span-1",
  "md:col-span-3 md:row-span-1",
  "md:col-span-2 md:row-span-1",
  "md:col-span-2 md:row-span-1",
  "md:col-span-2 md:row-span-1",
];


function BentoVisual({ kind }: { kind?: string | undefined }) {
  if (kind === "rank") {
    return (
      <div className="mt-6 space-y-2" aria-hidden="true">
        {[
          { q: "bridal makeup artist ahmedabad", r: "#2" },
          { q: "hd bridal makeup near me", r: "#1" },
          { q: "best makeup artist satellite", r: "#3" },
        ].map((row) => (
          <div
            key={row.q}
            className="flex items-center justify-between rounded-xl bg-primary-foreground/10 px-4 py-2.5 text-xs"
          >
            <span className="truncate text-primary-foreground/85">{row.q}</span>
            <span className="ml-3 rounded-md bg-accent/25 px-2 py-0.5 font-semibold text-primary-foreground">
              {row.r}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "chart") {
    return (
      <div className="mt-auto flex h-28 items-end gap-1.5 pt-6" aria-hidden="true">
        {[24, 38, 32, 55, 70, 84, 100].map((h, i) => (
          <span
            key={i}
            style={{ height: `${h}%` }}
            className="bg-gradient-brand w-full rounded-t-md opacity-80"
          />
        ))}
      </div>
    );
  }
  if (kind === "ai") {
    return (
      <div className="mt-5 rounded-xl border border-border bg-background/70 p-3 text-xs text-muted-foreground" aria-hidden="true">
        <p className="font-semibold text-foreground">“Who should I book in Ahmedabad?”</p>
        <p className="mt-2">
          AI assistants read your structured services, pricing and reviews — and recommend you by
          name.
        </p>
      </div>
    );
  }
  return null;
}

export function WhyBeautyFolio() {
  return (
    <section id="why" className="py-28">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Why BeautyFolio</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            Built for discovery, designed for beauty
          </h2>
          <p className="mt-4 text-muted-foreground">
            We don&rsquo;t help beauticians become influencers. We help them become the
            customer&rsquo;s first choice on Google.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 md:auto-rows-[minmax(9rem,auto)] md:grid-flow-dense md:grid-cols-6">
          {bento.map((card, i) => {
            const Icon = icons[card.icon] ?? Sparkles;
            const featured = i === 0;
            return (
              <Reveal key={card.title} delay={(i % 3) * 0.06} className={cn(spans[i], "h-full")}>
                <article
                  className={cn(
                    "flex h-full flex-col rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift",
                    featured
                      ? "bg-gradient-ink border-transparent text-primary-foreground"
                      : "border-border bg-card",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl",
                      featured ? "bg-primary-foreground/10" : "bg-secondary",
                    )}
                  >
                    <Icon
                      className={cn("h-4.5 w-4.5", featured ? "text-accent" : "text-primary")}
                      aria-hidden="true"
                    />
                  </span>
                  <h3
                    className={cn(
                      "font-display mt-5 font-semibold",
                      featured ? "text-2xl leading-tight" : "text-base",
                    )}
                  >
                    {card.title}
                  </h3>
                  <p
                    className={cn(
                      "mt-3 text-sm",
                      featured ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {card.detail}
                  </p>
                  <BentoVisual kind={card.kind} />
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
