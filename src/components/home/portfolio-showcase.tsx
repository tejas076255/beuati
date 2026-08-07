import { useState } from "react";

import { DeviceSwitcher } from "@/components/home/device-switcher";
import { PortfolioPreview } from "@/components/home/portfolio-preview";
import { Reveal } from "@/components/home/motion-primitives";
import { type DeviceKey } from "@/data/home";

const sections = [
  "Hero",
  "About",
  "Gallery",
  "Services",
  "Packages",
  "Reviews",
  "Videos",
  "Contact",
  "Google Map",
  "WhatsApp Button",
];

export function PortfolioShowcase() {
  const [device, setDevice] = useState<DeviceKey>("desktop");

  return (
    <section id="portfolio" className="py-24">
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

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <Reveal>
            <ul className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {sections.map((s) => (
                <li
                  key={s}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:border-primary/30"
                >
                  {s}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-3xl border border-border bg-gradient-soft p-4 sm:p-8">
              <div className="mb-4 flex justify-center">
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
