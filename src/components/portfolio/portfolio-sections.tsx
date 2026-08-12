import {
  Check,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  Sparkles,
  Star,
} from "lucide-react";

import portrait from "@/assets/dharti-portrait.jpg";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  about,
  artist,
  gallery,
  packages,
  reviews,
  services,
  videos,
} from "@/data/portfolio";

const waHref = `https://wa.me/${artist.whatsapp}?text=${encodeURIComponent(
  `Hi ${artist.name.split(" ")[0]}, I'd like to check your availability.`,
)}`;

function SectionHead({
  eyebrow,
  title,
  sub,
  center = true,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Stars({ className }: { className?: string }) {
  return (
    <span className={cn("flex text-accent", className)} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-current" />
      ))}
    </span>
  );
}

/* 1. HERO */
export function PortfolioHeroSection() {
  return (
    <section id="top" className="bg-gradient-soft bg-beauty-bloom pt-28 pb-16 sm:pt-32">
      <div className="section-shell grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <span className="eyebrow">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {artist.city}
          </span>
          <h1 className="mt-5 font-display text-[42px] leading-[1.05] font-semibold sm:text-[56px]">
            {artist.name}
          </h1>
          <p className="mt-2 text-lg font-medium text-primary">{artist.role}</p>
          <p className="mt-4 max-w-xl text-muted-foreground">{artist.tagline}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <Stars />
              <span className="font-semibold">{artist.rating}</span>
              <span className="text-muted-foreground">({artist.reviewCount} reviews)</span>
            </span>
            <span className="text-muted-foreground">{artist.experience} experience</span>
            <span className="text-muted-foreground">{artist.brides} brides</span>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="hero" size="lg" asChild>
              <a href={waHref} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden="true" /> Book on WhatsApp
              </a>
            </Button>
            <Button variant="softline" size="lg" asChild>
              <a href={`tel:${artist.phone.replace(/\s/g, "")}`}>
                <Phone aria-hidden="true" /> Call now
              </a>
            </Button>
          </div>

          <ul className="mt-7 flex flex-wrap gap-3">
            {["Free consultation", "Travels across Gujarat", "Airbrush & HD"].map((t) => (
              <li
                key={t}
                className="inline-flex items-center gap-2 rounded-full border border-rose-gold/30 bg-card/50 px-3.5 py-1.5 text-[13px] tracking-wide shadow-soft backdrop-blur-sm"
              >
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="brand-arc relative mx-auto w-full max-w-md text-primary">
          <img
            src={portrait}
            alt={`${artist.name}, ${artist.role} in ${artist.city}`}
            width={900}
            height={1100}
            className="w-full rounded-3xl object-cover shadow-lift"
          />
          <div className="absolute -bottom-5 left-1/2 w-[88%] -translate-x-1/2 rounded-2xl border border-border bg-card px-4 py-3 text-center shadow-lift">
            <p className="text-xs text-muted-foreground">Next available date</p>
            <p className="text-sm font-semibold">Booking for this wedding season</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* 2. ABOUT */
export function AboutSection() {
  return (
    <section id="about" className="py-20">
      <div className="section-shell grid gap-10 lg:grid-cols-[1fr_1fr]">
        <div>
          <SectionHead eyebrow="About" title={`Meet ${artist.name.split(" ")[0]}`} center={false} />
          <p className="mt-5 text-muted-foreground">{about.intro}</p>
          <p className="mt-4 text-muted-foreground">{about.second}</p>
        </div>
        <ul className="grid content-start gap-3 sm:grid-cols-2 lg:mt-16">
          {about.highlights.map((h) => (
            <li
              key={h}
              className="rounded-2xl border border-border bg-card p-5 text-sm shadow-soft"
            >
              <Check className="mb-3 h-5 w-5 text-primary" aria-hidden="true" />
              {h}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* 3. GALLERY */
export function GallerySection() {
  return (
    <section id="gallery" className="bg-gradient-soft py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Gallery"
          title="Recent work"
          sub="Bridal, engagement and party looks photographed on real clients."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gallery.map((img, i) => (
            <figure
              key={img.alt}
              className={cn(
                "overflow-hidden rounded-2xl border border-border bg-card shadow-soft",
                i === 0 && "sm:col-span-2 sm:row-span-2",
              )}
            >
              <img
                src={img.src}
                alt={img.alt}
                loading="lazy"
                width={900}
                height={900}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
              />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 4. SERVICES */
export function ServicesSection() {
  return (
    <section id="services" className="py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Services"
          title="What I offer"
          sub="Transparent pricing, no hidden travel or product charges within Ahmedabad."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <article
              key={s.name}
              className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-semibold">{s.name}</h3>
                <span className="font-display text-lg font-semibold text-primary">{s.price}</span>
              </div>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {s.duration}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">{s.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 5. PACKAGES */
export function PackagesSection() {
  return (
    <section id="packages" className="bg-gradient-soft py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Packages"
          title="Wedding packages"
          sub="Bundled functions at a better rate than booking each look separately."
        />
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {packages.map((p) => (
            <article
              key={p.name}
              className={cn(
                "flex flex-col rounded-3xl border p-7 shadow-soft",
                p.featured
                  ? "border-primary/30 bg-card shadow-lift ring-1 ring-primary/10"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.featured && (
                  <span className="bg-gradient-brand rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                    {p.note}
                  </span>
                )}
              </div>
              <p className="mt-3 font-display text-3xl font-semibold text-primary">{p.price}</p>
              {!p.featured && <p className="text-xs text-muted-foreground">{p.note}</p>}
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-muted-foreground">
                {p.includes.map((i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {i}
                  </li>
                ))}
              </ul>
              <Button variant={p.featured ? "hero" : "softline"} className="mt-6" asChild>
                <a href={waHref} target="_blank" rel="noreferrer">
                  Enquire about this package
                </a>
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 6. REVIEWS */
export function ReviewsSection() {
  return (
    <section id="reviews" className="py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Reviews"
          title={`${artist.rating} from ${artist.reviewCount} clients`}
          sub="Verified reviews from brides and families across Gujarat."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {reviews.map((r) => (
            <blockquote
              key={r.name}
              className="rounded-2xl border border-border bg-card p-6 shadow-soft"
            >
              <Stars />
              <p className="mt-3 text-sm text-muted-foreground">“{r.text}”</p>
              <footer className="mt-4 text-sm font-semibold">
                {r.name}
                <span className="ml-2 font-normal text-muted-foreground">{r.event}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 7. VIDEOS */
export function VideosSection() {
  return (
    <section id="videos" className="bg-gradient-soft py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Videos"
          title="Transformations on camera"
          sub="Short reels showing the full process from prep to final look."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {videos.map((v) => (
            <article
              key={v.title}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
            >
              <div className="relative">
                <img
                  src={v.thumb}
                  alt={v.title}
                  loading="lazy"
                  width={900}
                  height={506}
                  className="aspect-video w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-plum-deep/35">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card/90">
                    <Play className="h-5 w-5 fill-current text-primary" aria-hidden="true" />
                  </span>
                </span>
                <span className="absolute right-2 bottom-2 rounded bg-plum-deep/80 px-1.5 py-0.5 text-[11px] text-primary-foreground">
                  {v.length}
                </span>
              </div>
              <p className="p-4 text-sm font-medium">{v.title}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 8. CONTACT + 9. MAP */
export function ContactSection() {
  return (
    <section id="contact" className="py-20">
      <div className="section-shell grid gap-8 lg:grid-cols-2">
        <div>
          <SectionHead
            eyebrow="Contact"
            title="Check your date"
            sub="Share your function date and venue — you'll get a reply the same day."
            center={false}
          />
          <ul className="mt-8 space-y-3 text-sm">
            {[
              { icon: Phone, label: artist.phone, href: `tel:${artist.phone.replace(/\s/g, "")}` },
              { icon: Mail, label: artist.email, href: `mailto:${artist.email}` },
              { icon: MapPin, label: artist.studio },
              { icon: Clock, label: artist.hours },
            ].map(({ icon: Icon, label, href }) => (
              <li
                key={label}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {href ? (
                  <a href={href} className="hover:text-primary">
                    {label}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{label}</span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Areas served
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {artist.areas.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 9. GOOGLE MAP */}
        <div id="location" className="overflow-hidden rounded-3xl border border-border shadow-lift">
          <iframe
            title={`Map showing ${artist.name}'s studio in Ahmedabad`}
            src="https://www.google.com/maps?q=Satellite,%20Ahmedabad,%20Gujarat&output=embed"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-[420px] w-full border-0"
          />
        </div>
      </div>
    </section>
  );
}

/* 10. WHATSAPP FLOATING BUTTON */
export function WhatsAppButton() {
  return (
    <a
      href={waHref}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with Dharti Panchal on WhatsApp"
      className="bg-gradient-brand animate-pulse-ring fixed right-5 bottom-5 z-50 inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-lift"
    >
      <MessageCircle className="h-5 w-5" aria-hidden="true" />
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}
