import { Check, X } from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
import { beautyfolioWins, instagramLimits } from "@/data/home";

export function ProblemSection() {
  return (
    <section id="problem" className="py-24">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">The visibility gap</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            Why Instagram Alone Isn&rsquo;t Enough
          </h2>
          <p className="mt-4 text-muted-foreground">
            Followers scroll. Searchers buy. Every day thousands of people search Google for beauty
            professionals — and most talented artists never appear.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <article className="h-full rounded-2xl border border-border bg-muted/50 p-8">
              <h3 className="font-display text-xl font-semibold">Instagram only</h3>
              <p className="mt-1 text-sm text-muted-foreground">Rented attention</p>
              <ul className="mt-6 space-y-4">
                {instagramLimits.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                      <X className="h-3 w-3 text-destructive" aria-hidden="true" />
                    </span>
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>

          <Reveal delay={0.1}>
            <article className="bg-gradient-brand h-full rounded-2xl p-[1.5px] shadow-soft">
              <div className="h-full rounded-[calc(1rem-1px)] bg-card p-8">
                <h3 className="font-display text-xl font-semibold">Google + BeautyFolio</h3>
                <p className="mt-1 text-sm text-muted-foreground">An asset you own</p>
                <ul className="mt-6 space-y-4">
                  {beautyfolioWins.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Check className="h-3 w-3 text-primary" aria-hidden="true" />
                      </span>
                      <span className="font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
