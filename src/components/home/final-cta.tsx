import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/home/motion-primitives";

const trustPoints = ["Free Forever", "No Credit Card", "Setup in 10 Minutes"];

export function FinalCta() {
  return (
    <section className="py-24">
      <div className="section-shell">
        <Reveal>
          <div className="bg-gradient-brand brand-arc relative overflow-hidden rounded-3xl px-6 py-20 text-center shadow-lift sm:px-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-background/15 blur-2xl"
            />
            <h2 className="font-display mx-auto max-w-3xl text-3xl leading-tight font-semibold text-primary-foreground sm:text-5xl">
              Start Building Your Digital Beauty Brand Today.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-primary-foreground/85">
              Join 12,400+ Indian beauty professionals turning Google searches into direct,
              commission-free bookings.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button variant="invert" size="xl">
                Create Free Portfolio
              </Button>
              <Button
                variant="ghost"
                size="xl"
                className="border border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                Book Demo
              </Button>
            </div>

            <ul className="mt-8 flex flex-wrap justify-center gap-x-7 gap-y-3">
              {trustPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-2 text-sm font-medium text-primary-foreground/90"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
