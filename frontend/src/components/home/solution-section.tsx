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

/** Tiny mock UI previews so each feature shows the product, not just a claim. */
function FeaturePreview({ id }: { id: string }) {
  const shell =
    "mt-6 rounded-xl border border-border bg-background/70 p-3 text-[10px] transition-transform duration-300 group-hover:-translate-y-0.5";

  switch (id) {
    case "Local SEO":
    case "Google Visibility":
      return (
        <div className={shell} aria-hidden="true">
          {["bridal makeup ahmedabad", "makeup artist near me", "hd makeup satellite"].map(
            (kw, i) => (
              <div key={kw} className="flex items-center justify-between py-1">
                <span className="truncate text-muted-foreground">{kw}</span>
                <span className="ml-2 rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                  #{i + 2}
                </span>
              </div>
            ),
          )}
        </div>
      );
    case "Analytics":
      return (
        <div className={`${shell} flex h-20 items-end gap-1.5`} aria-hidden="true">
          {[30, 48, 40, 66, 78, 92, 100].map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%` }}
              className="bg-gradient-brand w-full rounded-sm opacity-80"
            />
          ))}
        </div>
      );
    case "Reviews":
      return (
        <div className={shell} aria-hidden="true">
          <div className="flex items-center gap-1 text-accent">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-current" />
            ))}
            <span className="ml-1 font-semibold text-foreground">4.9</span>
          </div>
          <p className="mt-2 text-muted-foreground">
            “Flawless bridal look and so professional.” — Priya S.
          </p>
        </div>
      );
    case "WhatsApp Leads":
      return (
        <div className={shell} aria-hidden="true">
          <div className="rounded-lg bg-secondary px-2.5 py-1.5">Hi! Are you free on 14 Feb?</div>
          <div className="bg-gradient-brand mt-1.5 ml-6 rounded-lg px-2.5 py-1.5 text-primary-foreground">
            Yes — sending packages now ✨
          </div>
        </div>
      );
    case "AI Search Ready":
      return (
        <div className={shell} aria-hidden="true">
          <p className="font-semibold text-foreground">AI answer</p>
          <p className="mt-1 text-muted-foreground">
            “Top bridal makeup artists in Ahmedabad include Ritika Sharma…”
          </p>
        </div>
      );
    case "Professional Portfolio":
      return (
        <div className={`${shell} grid grid-cols-3 gap-1.5`} aria-hidden="true">
          <span className="bg-secondary col-span-3 h-6 rounded-md" />
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className="bg-muted aspect-square rounded-md" />
          ))}
        </div>
      );
    case "Personal Branding":
      return (
        <div className={`${shell} flex items-center gap-2`} aria-hidden="true">
          <span className="bg-gradient-brand h-8 w-8 rounded-full" />
          <div>
            <p className="font-semibold text-foreground">Ritika Sharma</p>
            <p className="text-muted-foreground">Bridal Makeup Artist · Ahmedabad</p>
          </div>
        </div>
      );
    default:
      return (
        <div className={shell} aria-hidden="true">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Enquiry pipeline</span>
            <span className="rounded-md bg-accent/20 px-1.5 py-0.5 font-semibold text-accent-foreground">
              Coming soon
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {["New", "Quoted", "Booked"].map((s) => (
              <span key={s} className="bg-muted rounded-md px-1.5 py-1 text-center">
                {s}
              </span>
            ))}
          </div>
        </div>
      );
  }
}

export function SolutionSection() {
  return (
    <section id="features" className="bg-secondary/40 py-28">
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
              <Reveal key={feature.title} delay={(i % 3) * 0.08} className="h-full">
                <article className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift">
                  <span className="bg-secondary group-hover:bg-gradient-brand flex h-11 w-11 items-center justify-center rounded-xl transition-colors">
                    <Icon
                      className="h-5 w-5 text-primary transition-colors group-hover:text-primary-foreground"
                      aria-hidden="true"
                    />
                  </span>
                  <h3 className="mt-5 text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                  <div className="mt-auto">
                    <FeaturePreview id={feature.title} />
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
