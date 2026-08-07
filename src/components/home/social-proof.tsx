import { Counter, Reveal } from "@/components/home/motion-primitives";
import { stats } from "@/data/home";

export function SocialProof() {
  return (
    <section aria-label="BeautyFolio in numbers" className="border-y border-border bg-background py-14">
      <div className="section-shell grid grid-cols-2 gap-8 md:grid-cols-5">
        {stats.map((stat, i) => (
          <Reveal key={stat.label} delay={i * 0.07} className="text-center">
            <p className="font-display text-3xl font-semibold text-gradient-brand sm:text-4xl">
              <Counter value={stat.value} suffix={stat.suffix} />
            </p>
            <p className="mt-2 text-xs tracking-wide text-muted-foreground uppercase">
              {stat.label}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
