import { motion } from "motion/react";

import { Reveal } from "@/components/home/motion-primitives";
import { steps } from "@/data/home";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-secondary/40 py-24">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">How it works</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">Five steps to being found</h2>
        </Reveal>

        <ol className="mt-14 grid gap-6 md:grid-cols-5">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.09}>
              <li className="relative h-full rounded-2xl border border-border bg-card p-6">
                {i < steps.length - 1 && (
                  <motion.span
                    aria-hidden="true"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 + i * 0.12 }}
                    className="bg-gradient-brand absolute top-1/2 -right-6 hidden h-[2px] w-6 origin-left md:block"
                  />
                )}
                <span className="bg-gradient-brand font-display inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.detail}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
