import { MapPin, Search, Sparkles, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
import { discoverySurfaces } from "@/data/home";

const icons: Record<string, LucideIcon> = { Search, MapPin, Sparkles };

export function DiscoverySection() {
  return (
    <section id="discovery" className="bg-gradient-ink relative overflow-hidden py-28 text-primary-foreground">
      <div aria-hidden="true" className="bg-beauty-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="section-shell relative">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-primary-foreground/80 uppercase">
            Discoverability engine
          </span>
          <h2 className="font-display mt-6 text-3xl leading-tight font-semibold sm:text-5xl">
            Rank where your clients are actually searching
          </h2>
          <p className="mt-5 text-lg text-primary-foreground/75">
            A portfolio is the easy part. BeautyFolio&rsquo;s real product is discoverability —
            engineered across Google Search, Maps and the AI assistants your clients now ask first.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {discoverySurfaces.map((surface, i) => {
            const Icon = icons[surface.icon] ?? Search;
            return (
              <Reveal key={surface.title} delay={i * 0.08} className="h-full">
                <article className="flex h-full flex-col rounded-2xl border border-primary-foreground/15 bg-primary-foreground/5 p-7 transition-colors hover:border-accent/40">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/10">
                    <Icon className="h-4.5 w-4.5 text-accent" aria-hidden="true" />
                  </span>
                  <h3 className="font-display mt-5 text-lg font-semibold">{surface.title}</h3>
                  <p className="mt-2 text-sm text-primary-foreground/70">{surface.detail}</p>
                  <p className="mt-6 inline-flex w-fit rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold">
                    {surface.metric}
                  </p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
