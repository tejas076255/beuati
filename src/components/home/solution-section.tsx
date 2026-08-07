import {
  BarChart3,
  Crown,
  LayoutTemplate,
  MapPin,
  MessageCircle,
  Search,
  Sparkles,
  Star,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/home/motion-primitives";
import { features } from "@/data/home";

const icons: Record<string, LucideIcon> = {
  LayoutTemplate,
  MapPin,
  Search,
  Star,
  Sparkles,
  MessageCircle,
  BarChart3,
  Crown,
  Workflow,
};

export function SolutionSection() {
  return (
    <section id="features" className="bg-secondary/40 py-24">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">The platform</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            Everything You Need to Grow Your Beauty Business
          </h2>
          <p className="mt-4 text-muted-foreground">
            Not a listing site. Not an agency. A digital growth platform that turns your craft into
            a discoverable, enquiry-generating brand.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => {
            const Icon = icons[feature.icon] ?? Sparkles;
            return (
              <Reveal key={feature.title} delay={(i % 3) * 0.08}>
                <article className="group h-full rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift">
                  <span className="bg-secondary group-hover:bg-gradient-brand flex h-11 w-11 items-center justify-center rounded-xl transition-colors">
                    <Icon
                      className="h-5 w-5 text-primary transition-colors group-hover:text-primary-foreground"
                      aria-hidden="true"
                    />
                  </span>
                  <h3 className="mt-5 text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
