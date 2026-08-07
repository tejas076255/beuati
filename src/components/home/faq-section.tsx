import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/home/motion-primitives";
import { faqs } from "@/data/home";

export function FaqSection() {
  return (
    <section id="faq" className="bg-secondary/40 py-24">
      <div className="section-shell grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <span className="eyebrow">FAQ</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            Questions beauty professionals ask us
          </h2>
          <p className="mt-4 text-muted-foreground">
            Still unsure? Book a 15-minute demo and we&rsquo;ll audit your current Google
            visibility live.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={faq.q} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-base font-medium">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
