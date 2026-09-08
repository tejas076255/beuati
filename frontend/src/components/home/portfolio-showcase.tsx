import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";

import { DeviceSwitcher } from "@/components/home/device-switcher";
import { PortfolioPreview } from "@/components/home/portfolio-preview";
import { Reveal } from "@/components/home/motion-primitives";
import { type DeviceKey } from "@/data/home";
import { cn } from "@/lib/utils";

const sections = [
  { name: "Hero", note: "Name, city and speciality above the fold." },
  { name: "About", note: "Your story, training and signature style." },
  { name: "Gallery", note: "Before/after work, optimised and lazy-loaded." },
  { name: "Services", note: "Structured service data Google can read." },
  { name: "Packages", note: "Transparent pricing that pre-qualifies clients." },
  { name: "Reviews", note: "Verified reviews with rich-snippet schema." },
  { name: "Videos", note: "Reels and testimonials embedded natively." },
  { name: "Contact", note: "Call, WhatsApp and enquiry form in one tap." },
  { name: "Google Map", note: "Service areas mapped for local search." },
  { name: "WhatsApp Button", note: "Sticky, commission-free enquiry button." },
];

export function PortfolioShowcase() {
  const [device, setDevice] = useState<DeviceKey>("desktop");
  const [active, setActive] = useState(0);

  return (
    <section id="portfolio" className="py-28">
      <div className="section-shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Portfolio examples</span>
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
            A portfolio that sells while you work
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every BeautyFolio page ships with the ten sections clients look for before they book.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
          <Reveal>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {sections.map((s, i) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-pressed={active === i}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all",
                      active === i
                        ? "border-primary/40 bg-card shadow-soft"
                        : "border-border bg-card/60 hover:border-primary/25",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold",
                        active === i
                          ? "bg-gradient-brand text-primary-foreground"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {active === i ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
                    </span>
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="bg-gradient-soft overflow-hidden rounded-3xl border border-border p-4 sm:p-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={active}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="text-xs text-muted-foreground"
                  >
                    <span className="font-semibold text-foreground">{sections[active]?.name}</span>{" "}
                    · {sections[active]?.note}
                  </motion.p>
                </AnimatePresence>
                <DeviceSwitcher
                  value={device}
                  onChange={setDevice}
                  label="Portfolio showcase device"
                />
              </div>
              <PortfolioPreview device={device} />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
