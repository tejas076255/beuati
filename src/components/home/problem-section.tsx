import { ArrowRight, Clock, Instagram, Search, ShoppingBag, Sparkles, Upload } from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
import { googleJourney, instagramJourney } from "@/data/home";

const instaIcons = [Upload, Clock, Sparkles];
const googleIcons = [Search, Sparkles, ShoppingBag];

export function ProblemSection() {
  return (
    <section id="problem" className="py-28">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">The problem</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            Why Instagram Alone Isn&rsquo;t Enough
          </h2>
          <p className="mt-4 text-muted-foreground">
            Instagram is where people admire your work. Google is where they decide to book it.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <Reveal className="h-full">
            <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-8">
              <header className="flex items-center gap-3">
                <span className="bg-muted flex h-10 w-10 items-center justify-center rounded-xl">
                  <Instagram className="h-4.5 w-4.5 text-muted-foreground" aria-hidden="true" />
                </span>
                <h3 className="font-display text-xl font-semibold">The Instagram loop</h3>
              </header>

              <ol className="mt-8 space-y-3">
                {instagramJourney.map((item, i) => {
                  const Icon = instaIcons[i] ?? Upload;
                  return (
                    <li key={item.step}>
                      <div className="flex items-center gap-4 rounded-2xl border border-dashed border-border px-5 py-4">
                        <Icon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground">{item.step}</p>
                          <p className="text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                      </div>
                      {i < instagramJourney.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="mx-auto block h-4 w-px bg-border"
                        />
                      )}
                    </li>
                  );
                })}
              </ol>

              <p className="mt-8 rounded-xl bg-muted px-4 py-3 text-xs text-muted-foreground">
                Followers ≠ customers. Almost zero search visibility, and you never own the
                audience.
              </p>
            </article>
          </Reveal>

          <Reveal delay={0.1} className="h-full">
            <article className="bg-gradient-ink flex h-full flex-col rounded-3xl p-8 text-primary-foreground">
              <header className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/10">
                  <Search className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <h3 className="font-display text-xl font-semibold">The Google path</h3>
              </header>

              <ol className="mt-8 space-y-3">
                {googleJourney.map((item, i) => {
                  const Icon = googleIcons[i] ?? Search;
                  return (
                    <li key={item.step}>
                      <div className="flex items-center gap-4 rounded-2xl border border-primary-foreground/15 bg-primary-foreground/5 px-5 py-4">
                        <Icon className="h-4.5 w-4.5 shrink-0 text-accent" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold">{item.step}</p>
                          <p className="text-xs text-primary-foreground/70">{item.detail}</p>
                        </div>
                      </div>
                      {i < googleJourney.length - 1 && (
                        <ArrowRight
                          aria-hidden="true"
                          className="mx-auto my-1 h-4 w-4 rotate-90 text-accent"
                        />
                      )}
                    </li>
                  );
                })}
              </ol>

              <p className="mt-8 rounded-xl bg-primary-foreground/10 px-4 py-3 text-xs text-primary-foreground/85">
                High buying intent, local SEO, a portfolio you own, and enquiries that land
                straight on your phone.
              </p>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
