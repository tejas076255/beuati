import { MapPin, Search, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
import { discoverySurfaces } from "@/data/home";

const icons: Record<string, LucideIcon> = { Search, MapPin, Sparkles };

function SurfaceVisual({ kind }: { kind?: string | undefined }) {
  if (kind === "serp") {
    return (
      <div aria-hidden="true" className="rounded-2xl border border-border bg-secondary/50 p-5">
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
          <Search className="h-3 w-3" />
          bridal makeup artist ahmedabad
        </div>
        <div className="mt-4 space-y-2.5">
          {[
            { n: "1", t: "Riya Patel — Bridal Makeup", ok: true },
            { n: "2", t: "Ritika Sharma Studio", ok: false },
            { n: "3", t: "Glow Bridal Ahmedabad", ok: false },
          ].map((r) => (
            <div key={r.n} className="flex items-center gap-3 text-[11px]">
              <span
                className={
                  "flex h-6 w-6 items-center justify-center rounded-lg font-semibold " +
                  (r.ok
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground")
                }
              >
                {r.n}
              </span>
              <span className="truncate text-foreground/80">{r.t}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "score") {
    return (
      <div
        aria-hidden="true"
        className="flex items-center gap-5 rounded-2xl border border-border bg-secondary/50 p-5"
      >
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              strokeWidth="2.5"
              className="stroke-border"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="97.4"
              strokeDashoffset="5.8"
              className="stroke-accent"
            />
          </svg>
          <span className="font-display absolute text-xl font-semibold text-primary">94</span>
        </div>
        <div className="space-y-2 text-[11px] text-muted-foreground">
          {["Local schema valid", "Service areas mapped", "Business profile synced"].map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="rounded-2xl border border-border bg-secondary/50 p-5">
      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5 text-accent" /> AI citations · last 6 months
      </p>
      <div className="mt-4 flex h-20 items-end gap-2">
        {[18, 26, 34, 48, 62, 81, 100].map((h, i) => (
          <span
            key={i}
            style={{ height: `${h}%` }}
            className="w-full rounded-t-md bg-linear-to-t from-primary/30 to-accent/80"
          />
        ))}
      </div>
    </div>
  );
}

export function DiscoverySection() {
  return (
    <section id="discovery" className="bg-gradient-soft relative overflow-hidden py-32 sm:py-40">
      <div
        aria-hidden="true"
        className="bg-beauty-bloom pointer-events-none absolute inset-0 opacity-70"
      />
      <div
        aria-hidden="true"
        className="bg-beauty-grid pointer-events-none absolute inset-0 opacity-60"
      />

      <div className="section-shell relative">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">Discoverability engine</span>
          <h2 className="font-display mt-7 text-4xl leading-[1.08] font-semibold text-balance text-primary sm:text-[3.4rem]">
            Rank where your clients are actually{" "}
            <span className="text-gradient-brand">searching</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            A portfolio is the easy part. BeautyFolio&rsquo;s real product is discoverability —
            engineered across Google Search, Maps and the AI assistants your clients now ask first.
          </p>
        </Reveal>

        <div className="mt-20 grid gap-6 md:grid-cols-3 lg:gap-8">
          {discoverySurfaces.map((surface, i) => {
            const Icon = icons[surface.icon] ?? Search;
            return (
              <Reveal key={surface.title} delay={i * 0.08} className="h-full">
                <article className="shadow-soft hover:shadow-lift flex h-full min-h-[32rem] flex-col rounded-[1.75rem] border border-border bg-card p-9 transition-shadow duration-500 lg:p-10">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary">
                    <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </span>
                  <h3 className="font-display mt-8 text-2xl leading-tight font-semibold text-foreground">
                    {surface.title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                    {surface.detail}
                  </p>
                  <p className="mt-6 inline-flex w-fit rounded-full border border-accent/30 bg-accent/12 px-4 py-1.5 text-sm font-semibold text-accent-foreground">
                    {surface.metric}
                  </p>
                  <div className="mt-auto pt-10">
                    <SurfaceVisual kind={surface.kind} />
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
