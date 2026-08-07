import { Reveal } from "@/components/home/motion-primitives";
import { bento } from "@/data/home";
import { cn } from "@/lib/utils";

const spans = [
  "md:col-span-2 md:row-span-2",
  "md:col-span-2",
  "md:col-span-2",
  "md:col-span-2",
  "md:col-span-2",
  "md:col-span-2",
  "md:col-span-2",
  "md:col-span-2",
  "md:col-span-2",
  "md:col-span-3",
  "md:col-span-3",
];

export function WhyBeautyFolio() {
  return (
    <section id="why" className="py-24">
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

        <div className="mt-14 grid gap-4 md:auto-rows-[minmax(9rem,auto)] md:grid-cols-6">
          {bento.map((card, i) => (
            <Reveal
              key={card.title}
              delay={(i % 3) * 0.06}
              className={cn(spans[i], "h-full")}
            >
              <article
                className={cn(
                  "flex h-full flex-col justify-between rounded-2xl border border-border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-soft",
                  i === 0 ? "bg-gradient-brand text-primary-foreground" : "bg-card",
                )}
              >
                <h3
                  className={cn(
                    "font-display font-semibold",
                    i === 0 ? "text-2xl" : "text-base",
                  )}
                >
                  {card.title}
                </h3>
                <p
                  className={cn(
                    "mt-3 text-sm",
                    i === 0 ? "text-primary-foreground/85" : "text-muted-foreground",
                  )}
                >
                  {card.detail}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
