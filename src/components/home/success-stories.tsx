import { ArrowRight, MapPin, Star, TrendingUp } from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
import { PortfolioPreview } from "@/components/home/portfolio-preview";
import { testimonials } from "@/data/home";
import t1 from "@/assets/testimonial-1.jpg";
import t2 from "@/assets/testimonial-2.jpg";
import t3 from "@/assets/testimonial-3.jpg";

const photos = [t1, t2, t3];

export function SuccessStories() {
  return (
    <section id="stories" className="bg-secondary/40 py-28">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Success stories</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            Professionals who stopped waiting on the algorithm
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {testimonials.map((item, i) => (
            <Reveal key={item.name} delay={i * 0.09} className="h-full">
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                <div className="flex items-center gap-4 p-6">
                  <img
                    src={photos[i]}
                    alt={`${item.name}, ${item.role}`}
                    loading="lazy"
                    width={512}
                    height={512}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.role}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {item.location}
                    </p>
                  </div>
                </div>

                <blockquote className="px-6 text-sm leading-relaxed text-muted-foreground">
                  &ldquo;{item.quote}&rdquo;
                </blockquote>

                <div className="mx-6 mt-6 flex items-center gap-3 rounded-xl border border-border bg-background p-4">
                  <div className="min-w-0">
                    <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      Before
                    </p>
                    <p className="font-display text-xl font-semibold text-muted-foreground">
                      {item.before.value}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      After
                    </p>
                    <p className="font-display text-gradient-brand text-xl font-semibold">
                      {item.after.value}
                    </p>
                  </div>
                  <span className="ml-auto text-right text-[10px] text-muted-foreground">
                    {item.after.label}
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-between px-6">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.metric}
                  </span>
                  <span className="flex text-accent" aria-label={`${item.rating} out of 5 stars`}>
                    {Array.from({ length: item.rating }).map((_, s) => (
                      <Star key={s} className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    ))}
                  </span>
                </div>

                <div className="mt-6 max-h-64 overflow-hidden px-6 pb-0">
                  <div className="pointer-events-none origin-top scale-95">
                    <PortfolioPreview device="mobile" compact />
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
