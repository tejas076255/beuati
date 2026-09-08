import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/home/motion-primitives";
import { planComparison, plans } from "@/data/home";
import { cn } from "@/lib/utils";

export function PricingPreview() {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="py-28">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Pricing</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            Start free. Grow into more capacity as you need it.
          </h2>
          <p className="mt-4 text-muted-foreground">
            No commissions on any plan — every enquiry belongs to you.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Paid plan upgrades are currently activated by the BeautyFolio team. Self-serve payments
            are coming later.
          </p>
        </Reveal>

        <div className="mt-10 flex justify-center">
          <div
            role="group"
            aria-label="Billing period"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1"
          >
            {[
              { key: false, label: "Monthly" },
              { key: true, label: "Yearly · 2 months free" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={yearly === option.key}
                onClick={() => setYearly(option.key)}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                  yearly === option.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {plans.map((plan, i) => {
            const amount = yearly ? plan.yearly : plan.monthly;
            return (
              <Reveal key={plan.name} delay={i * 0.06} className="h-full">
                <article
                  className={cn(
                    "relative flex h-full flex-col rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1",
                    plan.popular
                      ? "border-accent/40 bg-card shadow-glow"
                      : "border-border bg-card shadow-soft",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                    {plan.popular && (
                      <span className="bg-gradient-brand rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                        Most popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="font-display text-3xl font-semibold">
                      ₹{amount.toLocaleString("en-IN")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {amount === 0 ? "forever" : yearly ? "/year" : "/month"}
                    </span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={plan.popular ? "hero" : "softline"}
                    className="mt-6 w-full"
                    asChild
                  >
                    <Link to="/signup">Start Free</Link>
                  </Button>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={0.1} className="mt-12">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <caption className="sr-only">Plan feature comparison</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Compare plans
                  </th>
                  {plans.map((plan) => (
                    <th key={plan.name} scope="col" className="px-4 py-4 text-center font-semibold">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planComparison.map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <th scope="row" className="px-5 py-3.5 font-medium text-muted-foreground">
                      {row.label}
                    </th>
                    {row.values.map((value, i) => (
                      <td key={i} className="px-4 py-3.5 text-center">
                        {typeof value === "boolean" ? (
                          value ? (
                            <Check className="mx-auto h-4 w-4 text-primary" aria-label="Included" />
                          ) : (
                            <Minus
                              className="mx-auto h-4 w-4 text-muted-foreground/50"
                              aria-label="Not included"
                            />
                          )
                        ) : (
                          <span className="font-medium">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal className="mt-10 text-center">
          <Button variant="plum" size="lg" asChild>
            <Link to="/signup">Start Free</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
