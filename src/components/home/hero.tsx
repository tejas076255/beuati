import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart3,
  Check,
  MessageCircle,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DeviceSwitcher } from "@/components/home/device-switcher";
import { PortfolioPreview } from "@/components/home/portfolio-preview";
import { heroBadges, heroTrustSignals, type DeviceKey } from "@/data/home";

const floatCards = [
  {
    Icon: TrendingUp,
    title: "Google Ranking",
    value: "#3 · bridal makeup Ahmedabad",
    pos: "-left-4 top-16 sm:-left-10",
  },
  {
    Icon: Star,
    title: "Google Reviews",
    value: "stars",
    pos: "right-2 top-2 sm:right-4",
  },
  {
    Icon: Users,
    title: "New Leads",
    value: "12 this week",
    pos: "-left-4 top-[44%] sm:-left-12",
  },
  {
    Icon: BarChart3,
    title: "Portfolio Views",
    value: "counter",
    pos: "-left-3 bottom-24 sm:-left-8",
  },
  {
    Icon: MessageCircle,
    title: "WhatsApp Enquiries",
    value: "38 this month",
    pos: "-right-2 top-[62%] sm:-right-6",
  },
  {
    Icon: Sparkles,
    title: "AI SEO Score",
    value: "94 / 100 · Excellent",
    pos: "right-2 bottom-32 sm:right-4",
  },
];


const enquiries = [
  "Priya · Bridal trial, 14 Feb",
  "Aisha · Reception makeup",
  "Neha · Sangeet + haldi package",
];

function LiveViews() {
  const [views, setViews] = useState(4318);
  useEffect(() => {
    const id = setInterval(() => setViews((v) => v + 1 + Math.floor(Math.random() * 3)), 2200);
    return () => clearInterval(id);
  }, []);
  return <>{views.toLocaleString("en-IN")} this month</>;
}

function EnquiryToast() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % enquiries.length), 3800);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-4 left-1/2 hidden w-64 -translate-x-1/2 md:block"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-lift"
        >
          <span className="animate-pulse-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/20">
            <MessageCircle className="h-3.5 w-3.5 text-accent-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-wide text-accent-foreground uppercase">
              New WhatsApp enquiry
            </p>
            <p className="truncate text-xs font-medium">{enquiries[i]}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function Hero() {
  const [device, setDevice] = useState<DeviceKey>("desktop");

  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-24 lg:pt-40">
      <div aria-hidden="true" className="bg-beauty-bloom pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="bg-beauty-grid pointer-events-none absolute inset-0" />

      <div className="section-shell relative grid items-center gap-16 lg:grid-cols-[1.05fr_1fr] [&>*]:min-w-0">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="eyebrow"
          >
            India&rsquo;s digital growth platform for beauty professionals
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-7 text-[2.75rem] leading-[1.04] font-semibold tracking-tight text-foreground sm:text-6xl lg:text-[4.25rem]"
          >
            Every day thousands of brides search Google for makeup artists.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display mt-6 text-2xl leading-snug font-medium sm:text-3xl"
          >
            Will they find you &mdash; or{" "}
            <span className="text-gradient-brand">your competitor?</span>
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground"
          >
            BeautyFolio builds you an SEO-optimised portfolio that ranks on Google, Maps and AI
            search &mdash; so high-intent clients call and WhatsApp you directly, with zero
            marketplace commission.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.22 }}
            className="mt-9 flex flex-wrap gap-3"
          >
            <Button variant="hero" size="xl">
              Create My Free Portfolio
            </Button>
            <Button variant="softline" size="xl" asChild>
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="mt-5 flex flex-wrap gap-x-6 gap-y-2"
          >
            {heroTrustSignals.map((signal) => (
              <li
                key={signal}
                className="flex items-center gap-1.5 text-sm font-medium text-foreground/80"
              >
                <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                {signal}
              </li>
            ))}
          </motion.ul>

          <motion.ul
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.34 }}
            className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-border/70 pt-6"
          >
            {heroBadges.map((badge) => (
              <li key={badge} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-primary/70" aria-hidden="true" />
                {badge}
              </li>
            ))}
          </motion.ul>
        </div>

        <div className="relative">
          <div className="mb-4 flex justify-center lg:justify-end">
            <DeviceSwitcher value={device} onChange={setDevice} label="Hero portfolio preview device" />
          </div>

          <div className="relative px-2 pb-8">
            <PortfolioPreview device={device} compact />

            {floatCards.map(({ Icon, title, value, pos }, i) => (
              <motion.div
                key={title}
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.35 + i * 0.12 }}
                className={`absolute ${pos} animate-float hidden rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-soft backdrop-blur md:block`}
                style={{ animationDelay: `${i * 0.8}s` }}
              >
                <div className="flex items-center gap-2">
                  <span className="bg-secondary flex h-7 w-7 items-center justify-center rounded-lg">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <div>
                    <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      {title}
                    </p>
                    <p className="text-xs font-semibold">
                      {value === "counter" ? (
                        <LiveViews />
                      ) : value === "stars" ? (
                        <span className="flex items-center gap-1">
                          <span className="flex text-accent">
                            {Array.from({ length: 5 }).map((_, s) => (
                              <Star key={s} className="h-3 w-3 fill-current" />
                            ))}
                          </span>
                          4.9 · 214
                        </span>
                      ) : (
                        value
                      )}

                    </p>
                  </div>
                </div>
              </motion.div>
            ))}

            <EnquiryToast />
          </div>
        </div>
      </div>
    </section>
  );
}
