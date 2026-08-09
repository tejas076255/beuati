import { ArrowRight, Instagram, MapPin, Star, TrendingUp } from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
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
          <span className="eyebrow">Transformation stories</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            From invisible on Google to fully booked
          </h2>
          <p className="mt-4 text-muted-foreground">
            Same talent. Same city. The only thing that changed is where clients find them.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-8">
          {testimonials.map((item, i) => (
            <Reveal key={item.name} delay={i * 0.06}>
              <article className="brand-arc grid overflow-hidden rounded-3xl border border-border bg-card shadow-soft lg:grid-cols-[1fr_1.5fr]">
                <div className="border-b border-border p-7 lg:border-r lg:border-b-0">
                  <div className="flex items-center gap-4">
                    <img
                      src={photos[i]}
                      alt={`${item.name}, ${item.role}`}
                      loading="lazy"
                      width={512}
                      height={512}
                      className="h-16 w-16 rounded-2xl object-cover"
                    />
                    <div className="min-w-0">
                      <p className="font-display text-lg font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.role}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {item.location}
                      </p>
                    </div>
                  </div>

                  <blockquote className="mt-5 text-sm leading-relaxed text-muted-foreground">
                    &ldquo;{item.quote}&rdquo;
                  </blockquote>

                  <div className="mt-5 flex items-center gap-3">
                    <span
                      className="flex text-accent"
                      aria-label={`${item.rating} out of 5 stars`}
                    >
                      {Array.from({ length: item.rating }).map((_, s) => (
                        <Star key={s} className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      ))}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.timeline}</span>
                  </div>
                </div>

                <div className="grid gap-6 p-7 sm:grid-cols-[minmax(0,0.8fr)_auto_minmax(0,1.6fr)] sm:items-center">
                  <div className="rounded-2xl border border-dashed border-border bg-background p-5">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      <Instagram className="h-3.5 w-3.5" aria-hidden="true" /> Before
                    </p>
                    <ul className="mt-3 space-y-2">
                      {item.beforeState.map((b) => (
                        <li key={b} className="text-sm text-muted-foreground">
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <ArrowRight
                    className="mx-auto hidden h-5 w-5 shrink-0 text-accent sm:block"
                    aria-hidden="true"
                  />

                  <div>
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-primary uppercase">
                      <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> After BeautyFolio
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {item.outcomes.map((o) => (
                        <div
                          key={o.label}
                          className="rounded-xl border border-border bg-secondary/50 px-4 py-3"
                        >
                          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                            {o.label}
                          </p>
                          <p className="font-display text-gradient-brand text-2xl font-semibold">
                            {o.value}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{o.note}</p>
                        </div>
                      ))}
                    </div>
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
