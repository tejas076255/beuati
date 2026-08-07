import { useState } from "react";
import { motion } from "motion/react";
import { BarChart3, Check, MessageCircle, Star, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DeviceSwitcher } from "@/components/home/device-switcher";
import { PortfolioPreview } from "@/components/home/portfolio-preview";
import { heroBadges, type DeviceKey } from "@/data/home";

const floatCards = [
  { Icon: TrendingUp, title: "Google Ranking", value: "#2 · bridal makeup Ahmedabad", pos: "-left-4 top-24 sm:-left-10" },
  { Icon: BarChart3, title: "Portfolio Views", value: "4,318 this month", pos: "right-2 top-6 sm:right-4" },
  { Icon: MessageCircle, title: "WhatsApp Leads", value: "62 new enquiries", pos: "right-2 bottom-28 sm:right-4" },
  { Icon: Star, title: "Reviews", value: "4.9 average · 214", pos: "-left-3 bottom-12 sm:-left-8" },
];

export function Hero() {
  const [device, setDevice] = useState<DeviceKey>("desktop");

  return (
    <section id="top" className="bg-gradient-soft relative overflow-hidden pt-32 pb-20 lg:pt-40">
      <div
        aria-hidden="true"
        className="bg-gradient-brand pointer-events-none absolute -top-40 -right-40 h-[32rem] w-[32rem] rounded-full opacity-10 blur-3xl"
      />
      <div className="section-shell grid items-center gap-16 lg:grid-cols-[1.05fr_1fr] [&>*]:min-w-0">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="eyebrow"
          >
            India&rsquo;s digital growth platform for beauty professionals
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-6 text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl"
          >
            Your Talent Deserves
            <br />
            More Than <span className="text-gradient-brand">Instagram.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-6 max-w-xl text-lg text-muted-foreground"
          >
            Create a professional beauty portfolio, rank on Google, and receive direct client
            enquiries without paying marketplace commissions.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Button variant="hero" size="xl">
              Create Free Portfolio
            </Button>
            <Button variant="softline" size="xl">
              Book Demo
            </Button>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="mt-8 flex flex-wrap gap-x-6 gap-y-3"
          >
            {heroBadges.map((badge) => (
              <li key={badge} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                {badge}
              </li>
            ))}
          </motion.ul>
        </div>

        <div className="relative">
          <div className="mb-4 flex justify-center lg:justify-end">
            <DeviceSwitcher value={device} onChange={setDevice} label="Hero portfolio preview device" />
          </div>

          <div className="relative px-2">
            <PortfolioPreview device={device} compact />

            {floatCards.map(({ Icon, title, value, pos }, i) => (
              <motion.div
                key={title}
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.35 + i * 0.12 }}
                className={`absolute ${pos} hidden rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-soft backdrop-blur md:block`}
              >
                <div className="flex items-center gap-2">
                  <span className="bg-secondary flex h-7 w-7 items-center justify-center rounded-lg">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <div>
                    <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      {title}
                    </p>
                    <p className="text-xs font-semibold">{value}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
