import {
  BadgeIndianRupee,
  HelpCircle,
  Search,
  Smartphone,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/home/motion-primitives";
import { faqs } from "@/data/home";

const faqIcons: LucideIcon[] = [
  Sparkles,
  Search,
  TrendingUp,
  BadgeIndianRupee,
  BadgeIndianRupee,
  Smartphone,
  HelpCircle,
];

export function FaqSection() {
  return (
    <section id="faq" className="bg-secondary/40 py-28">
      <div className="section-shell grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <span className="eyebrow">FAQ</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            Questions beauty professionals ask us
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Still unsure? Book a 15-minute demo and we&rsquo;ll audit your current Google
            visibility live.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <Accordion type="single" collapsible className="w-full space-y-3">
            {faqs.map((faq, i) => {
              const Icon = faqIcons[i] ?? HelpCircle;
              return (
                <AccordionItem
                  key={faq.q}
                  value={`item-${i}`}
                  className="rounded-2xl border border-border bg-card px-5 data-[state=open]:shadow-soft"
                >
                  <AccordionTrigger className="gap-4 py-5 text-left text-base font-medium hover:no-underline">
                    <span className="flex items-center gap-3">
                      <span className="bg-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      </span>
                      {faq.q}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 pl-11 text-sm leading-relaxed text-muted-foreground">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
