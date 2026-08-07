import { motion } from "motion/react";
import { MapPin, MessageCircle, Phone, Star } from "lucide-react";

import heroImg from "@/assets/portfolio-hero.jpg";
import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery3 from "@/assets/gallery-3.jpg";
import { deviceWidths, type DeviceKey } from "@/data/home";

const galleryImages = [gallery1, gallery2, gallery3];

export function PortfolioPreview({
  device,
  compact = false,
}: {
  device: DeviceKey;
  compact?: boolean;
}) {
  return (
    <motion.div
      layout
      animate={{ maxWidth: deviceWidths[device] }}
      transition={{ type: "spring", stiffness: 180, damping: 24 }}
      className="mx-auto w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lift"
    >
      <div className="flex items-center gap-2 border-b border-border bg-secondary/70 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/30" />
        <span className="ml-3 truncate rounded-md bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
          beautyfolio.in/ritika-sharma-bridal-makeup-ahmedabad
        </span>
      </div>

      <div className="relative">
        <img
          src={heroImg}
          alt="Bridal makeup artist portfolio hero"
          width={1024}
          height={768}
          className="h-44 w-full object-cover sm:h-56"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-plum-deep/85 to-transparent p-4">
          <p className="font-display text-base font-semibold text-primary-foreground sm:text-lg">
            Ritika Sharma
          </p>
          <p className="text-[11px] text-primary-foreground/80">
            Bridal Makeup Artist · Ahmedabad
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5">
          {["About", "Gallery", "Services", "Packages", "Reviews", "Videos", "Contact"].map(
            (item) => (
              <span
                key={item}
                className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground"
              >
                {item}
              </span>
            ),
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {galleryImages.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`Portfolio work sample ${i + 1}`}
              loading="lazy"
              width={640}
              height={640}
              className="aspect-square w-full rounded-lg object-cover"
            />
          ))}
        </div>

        {!compact && (
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: "HD Bridal Package", price: "₹18,000" },
              { label: "Engagement Makeup", price: "₹8,500" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[11px]"
              >
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground">{s.price}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-[11px]">
          <div className="flex text-accent" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-current" />
            ))}
          </div>
          <span className="text-muted-foreground">4.9 · 214 verified reviews</span>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Satellite, Ahmedabad · Serving 12 areas
        </div>

        <div className="flex gap-2">
          <span className="bg-gradient-brand inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold text-primary-foreground">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
          </span>
          <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call now
          </span>
        </div>
      </div>
    </motion.div>
  );
}
