import { MapPin, Search, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
import { discoverySurfaces } from "@/data/home";

const icons: Record<string, LucideIcon> = { Search, MapPin, Sparkles };

function SurfaceVisual({ kind }: { kind?: string | undefined }) {
  if (kind === "serp") {
    return (
      <div
        aria-hidden="true"
        className="rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.04] p-5"
      >
        <div className="flex items-center gap-2 rounded-full bg-primary-foreground/[0.07] px-3 py-2 text-[11px] text-primary-foreground/70">
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
                    ? "bg-rose/20 text-soft-highlight"
                    : "bg-primary-foreground/[0.07] text-primary-foreground/60")
                }
              >
                {r.n}
              </span>
              <span className="truncate text-primary-foreground/75">{r.t}</span>
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
        className="flex items-center gap-5 rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.04] p-5"
      >
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              strokeWidth="2.5"
              className="stroke-primary-foreground/12"
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
              className="stroke-rose"
            />
          </svg>
          <span className="font-display absolute text-xl font-semibold">94</span>
        </div>
        <div className="space-y-2 text-[11px] text-primary-foreground/70">
          {["Local schema valid", "Service areas mapped", "Business profile synced"].map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.04] p-5"
    >
      <p className="flex items-center gap-2 text-[11px] text-primary-foreground/70">
        <TrendingUp className="h-3.5 w-3.5 text-rose" /> AI citations · last 6 months
      </p>
      <div className="mt-4 flex h-20 items-end gap-2">
        {[18, 26, 34, 48, 62, 81, 100].map((h, i) => (
          <span
            key={i}
            style={{ height: `${h}%` }}
            className="w-full rounded-t-md bg-linear-to-t from-purple-accent/50 to-rose/70"
          />
        ))}
      </div>
    </div>
  );
}

export function DiscoverySection() {
  return (
    <section
      id="discovery"
      className="bg-gradient-ink relative overflow-hidden py-32 text-primary-foreground sm:py-40"
    >
      <div aria-hidden="true" className="bg-plum-halo pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="bg-plum-noise pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
      />
      <div
        aria-hidden="true"
        className="bg-beauty-grid pointer-events-none absolute inset-0 opacity-25"
      />

      <div className="section-shell relative">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/10 bg-primary-foreground/[0.04] px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.2em] text-primary-foreground/70 uppercase">
            Discoverability engine
          </span>
          <h2 className="font-display mt-7 text-4xl leading-[1.08] font-semibold text-balance sm:text-[3.4rem]">
            Rank where your clients are actually{" "}
            <span className="text-soft-highlight">searching</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-primary-foreground/70">
            A portfolio is the easy part. BeautyFolio&rsquo;s real product is discoverability —
            engineered across Google Search, Maps and the AI assistants your clients now ask first.
          </p>
        </Reveal>

        <div className="mt-20 grid gap-6 md:grid-cols-3 lg:gap-8">
          {discoverySurfaces.map((surface, i) => {
            const Icon = icons[surface.icon] ?? Search;
            return (
              <Reveal key={surface.title} delay={i * 0.08} className="h-full">
                <article className="flex h-full min-h-[32rem] flex-col rounded-[1.75rem] border border-primary-foreground/10 bg-primary-foreground/[0.045] p-9 transition-colors duration-500 hover:border-primary-foreground/20 hover:bg-primary-foreground/[0.06] lg:p-10">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.06]">
                    <Icon className="h-6 w-6 text-soft-highlight" aria-hidden="true" />
                  </span>
                  <h3 className="font-display mt-8 text-2xl leading-tight font-semibold">
                    {surface.title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-primary-foreground/70">
                    {surface.detail}
                  </p>
                  <p className="mt-6 inline-flex w-fit rounded-full border border-rose/25 bg-rose/10 px-4 py-1.5 text-sm font-semibold text-soft-highlight">
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
