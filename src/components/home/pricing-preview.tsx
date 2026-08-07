import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/home/motion-primitives";
import { plans } from "@/data/home";
import { cn } from "@/lib/utils";

export function PricingPreview() {
  return (
    <section id="pricing" className="py-24">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Pricing</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            Start free. Upgrade when Google starts sending clients.
          </h2>
          <p className="mt-4 text-muted-foreground">
            No commissions on any plan — every enquiry belongs to you.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.07} className="h-full">
              <article
                className={cn(
                  "flex h-full flex-col rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1",
                  plan.popular
                    ? "border-primary/40 bg-card shadow-lift"
                    : "border-border bg-card shadow-soft",
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                  {plan.popular && (
                    <span className="bg-gradient-brand rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                      Most popular
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-semibold">{plan.price}</span>
                  <span className="text-xs text-muted-foreground">{plan.period}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.popular ? "hero" : "softline"}
                  className="mt-6 w-full"
                >
                  {plan.name === "Free" ? "Create Free Portfolio" : "Choose " + plan.name}
                </Button>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 text-center">
          <Button variant="plum" size="lg">
            View Pricing
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
