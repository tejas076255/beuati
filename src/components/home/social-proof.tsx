import { Eye, MapPin, Star, TrendingUp, Users, type LucideIcon } from "lucide-react";

import { Counter, Reveal } from "@/components/home/motion-primitives";
import { stats } from "@/data/home";

const icons: Record<string, LucideIcon> = { Users, MapPin, Eye, TrendingUp, Star };

export function SocialProof() {
  return (
    <section aria-label="BeautyFolio in numbers" className="border-y border-border bg-card py-20">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Traction</span>
          <h2 className="mt-5 text-2xl font-semibold sm:text-3xl">
            Search demand, turned into booked work
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {stats.map((stat, i) => {
            const Icon = icons[stat.icon] ?? Users;
            return (
              <Reveal key={stat.label} delay={i * 0.07} className="h-full">
                <article className="flex h-full flex-col rounded-2xl border border-border bg-background p-6 transition-colors hover:border-primary/30">
                  <span className="bg-secondary flex h-10 w-10 items-center justify-center rounded-xl">
                    <Icon className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
                  </span>
                  <p className="font-display mt-5 text-3xl font-semibold tracking-tight">
                    <Counter value={stat.value} suffix={stat.suffix} />
                  </p>
                  <p className="mt-1 text-sm font-semibold">{stat.label}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {stat.detail}
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
