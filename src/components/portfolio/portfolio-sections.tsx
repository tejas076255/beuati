import { useMemo, useState } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  Sparkles,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  galleryFilters,
  imageAlt,
  type BeauticianProfile,
  type GalleryCategory,
} from "@/data/portfolio";

type P = { profile: BeauticianProfile };

export function waLink(profile: BeauticianProfile, message?: string) {
  const text =
    message ??
    `Hi ${profile.name.split(" ")[0]}, I'd like to check your availability for my function.`;
  return `https://wa.me/${profile.whatsapp}?text=${encodeURIComponent(text)}`;
}

const telLink = (profile: BeauticianProfile) => `tel:${profile.phone.replace(/\s/g, "")}`;

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

function Stars({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <span className={cn("flex text-accent", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-current" />
      ))}
    </span>
  );
}

/* 1. HERO */
export function PortfolioHeroSection({ profile }: P) {
  return (
    <section id="top" className="bg-gradient-soft bg-beauty-bloom pt-28 pb-16 sm:pt-32">
      <div className="section-shell grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <span className="eyebrow">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {profile.specialty}
          </span>
          <h1 className="mt-5 font-display text-[42px] leading-[1.05] font-semibold sm:text-[56px]">
            {profile.name}
          </h1>
          <p className="mt-2 text-lg font-medium text-primary">{profile.headline}</p>
          <p className="mt-4 max-w-xl text-muted-foreground">{profile.positioning}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <Stars />
              <span className="font-semibold">{profile.rating} Rating</span>
              <span className="text-muted-foreground">({profile.reviewCount}+ clients)</span>
            </span>
            <span className="text-muted-foreground">{profile.experience} experience</span>
            <span className="text-muted-foreground">{profile.primaryCity}</span>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="hero" size="lg" asChild>
              <a href="#availability">
                <Calendar aria-hidden="true" /> Check availability
              </a>
            </Button>
            <Button variant="softline" size="lg" asChild>
              <a href={waLink(profile)} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden="true" /> WhatsApp
              </a>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <a href="#gallery">View work</a>
            </Button>
          </div>

          {/* Hero trust bar */}
          <ul className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border/70 pt-6">
            {profile.trustBar.map((t) => (
              <li key={t.label}>
                <p className="font-display text-base font-semibold">{t.value}</p>
                <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
                  {t.label}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="brand-arc relative mx-auto w-full max-w-md text-primary">
          <img
            src={profile.portrait}
            alt={`${profile.name}, ${profile.role} in ${profile.primaryCity}`}
            width={900}
            height={1100}
            fetchPriority="high"
            decoding="async"
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
export function AboutSection({ profile }: P) {
  return (
    <section id="about" className="py-20">
      <div className="section-shell grid gap-10 lg:grid-cols-[1fr_1fr]">
        <div>
          <SectionHead
            eyebrow="About"
            title={`Meet ${profile.name.split(" ")[0]}`}
            center={false}
          />
          <p className="mt-5 text-muted-foreground">{profile.about.intro}</p>
          <p className="mt-4 text-muted-foreground">{profile.about.second}</p>

          <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { v: profile.experience, l: "Experience" },
              { v: profile.looksDelivered.replace(" bridal looks", ""), l: "Brides" },
              { v: `${profile.rating}★`, l: "Average rating" },
              { v: profile.primaryCity, l: "Based in" },
            ].map((m) => (
              <div key={m.l}>
                <dt className="sr-only">{m.l}</dt>
                <dd className="font-display text-xl font-semibold text-primary">{m.v}</dd>
                <p className="text-[11px] tracking-widest text-muted-foreground uppercase">{m.l}</p>
              </div>
            ))}
          </dl>

          <div className="mt-8">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Specialises in
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {profile.specializations.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-rose-gold/30 bg-card/50 px-3.5 py-1.5 text-[13px] tracking-wide shadow-soft backdrop-blur-sm"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ul className="grid content-start gap-3 sm:grid-cols-2 lg:mt-16">
          {profile.about.highlights.map((h) => (
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

/* 3. WHY CHOOSE ME */
export function WhyChooseSection({ profile }: P) {
  return (
    <section id="why" className="bg-gradient-soft py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Why me"
          title={`Why brides choose ${profile.name.split(" ")[0]}`}
          sub="The details that decide how your makeup looks at hour fourteen — and in every photograph."
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profile.whyChoose.map((w) => (
            <li
              key={w}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card p-6 text-sm shadow-soft transition-shadow hover:shadow-lift"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              {w}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* 4. GALLERY with filters */
export function GallerySection({ profile }: P) {
  const [active, setActive] = useState<"all" | GalleryCategory>("all");
  const items = useMemo(
    () => profile.gallery.filter((g) => active === "all" || g.category === active),
    [profile.gallery, active],
  );

  return (
    <section id="gallery" className="py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Gallery"
          title="Recent work"
          sub="Bridal, engagement and party looks photographed on real clients."
        />

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {galleryFilters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActive(f.id)}
              aria-pressed={active === f.id}
              className={cn(
                "rounded-full border px-4 py-2 text-[13px] tracking-wide transition-colors",
                active === f.id
                  ? "border-primary/30 bg-primary text-primary-foreground shadow-soft"
                  : "border-rose-gold/30 bg-card/50 text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((img, i) => (
            <figure
              key={`${img.label}-${i}`}
              className={cn(
                "animate-in fade-in overflow-hidden rounded-2xl border border-border bg-card shadow-soft duration-500",
                i === 0 && items.length > 3 && "sm:col-span-2 sm:row-span-2",
              )}
            >
              <img
                src={img.src}
                alt={imageAlt(profile, img.label)}
                title={img.label}
                loading="lazy"
                decoding="async"
                width={900}
                height={900}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
              />
              <figcaption className="sr-only">{imageAlt(profile, img.label)}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 5. BEFORE & AFTER */
function BeforeAfter({
  profile,
  item,
}: {
  profile: BeauticianProfile;
  item: BeauticianProfile["transformations"][number];
}) {
  const [pos, setPos] = useState(50);
  return (
    <figure className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <div className="relative aspect-[4/5] w-full select-none">
        <img
          src={item.before}
          alt={imageAlt(profile, `Natural look before ${item.service}`)}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img
            src={item.after}
            alt={imageAlt(profile, `Finished ${item.service} look`)}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            style={{ width: "100%", minWidth: "100%" }}
          />
        </div>
        <span className="absolute top-3 left-3 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-semibold tracking-widest uppercase">
          After
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-plum-deep/70 px-2.5 py-1 text-[11px] font-semibold tracking-widest text-primary-foreground uppercase">
          Before
        </span>
        <span
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-card"
          style={{ left: `${pos}%` }}
          aria-hidden="true"
        />
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`Reveal the ${item.service} transformation`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="flex items-center justify-between gap-3 p-4">
        <span className="text-sm font-semibold">{item.service}</span>
        <span className="text-xs text-muted-foreground">{item.occasion}</span>
      </figcaption>
    </figure>
  );
}

export function TransformationsSection({ profile }: P) {
  return (
    <section id="transformations" className="bg-gradient-soft py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Before & after"
          title="Bridal transformations"
          sub="Drag each image to see the transformation from natural look to the finished bridal look."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {profile.transformations.map((t) => (
            <BeforeAfter key={t.service + t.occasion} profile={profile} item={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* 6. SERVICES (grouped) */
export function ServicesSection({ profile }: P) {
  return (
    <section id="services" className="py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Services"
          title="What I offer"
          sub="Transparent pricing, no hidden travel or product charges within Ahmedabad."
        />
        <div className="mt-10 space-y-12">
          {profile.serviceGroups.map((group) => (
            <div key={group.group}>
              <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                {group.group}
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((s) => (
                  <article
                    key={s.name}
                    className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h4 className="text-base font-semibold">{s.name}</h4>
                      <span className="font-display text-lg font-semibold whitespace-nowrap text-primary">
                        {s.price}
                      </span>
                    </div>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {s.duration}
                    </p>
                    <p className="mt-3 flex-1 text-sm text-muted-foreground">{s.detail}</p>
                    <Button variant="softline" size="sm" className="mt-5 self-start" asChild>
                      <a
                        href={waLink(
                          profile,
                          `Hi ${profile.name.split(" ")[0]}, I'd like to enquire about ${s.name}.`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Enquire
                      </a>
                    </Button>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 7. PACKAGES */
export function PackagesSection({ profile }: P) {
  return (
    <section id="packages" className="bg-gradient-soft py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Packages"
          title="Wedding packages"
          sub="Bundled functions at a better rate than booking each look separately."
        />
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {profile.packages.map((p) => (
            <article
              key={p.name}
              className={cn(
                "flex flex-col rounded-3xl border p-7 shadow-soft",
                p.featured
                  ? "border-primary/30 bg-card shadow-lift ring-1 ring-primary/10"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.featured && (
                  <span className="bg-gradient-brand rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                    {p.note}
                  </span>
                )}
              </div>
              <p className="mt-3 font-display text-3xl font-semibold text-primary">{p.price}</p>
              {!p.featured && <p className="text-xs text-muted-foreground">{p.note}</p>}
              <p className="mt-4 text-xs tracking-wide text-muted-foreground">
                <span className="font-semibold text-foreground">Best for:</span> {p.bestFor}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-muted-foreground">
                {p.includes.map((i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {i}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col gap-2">
                <Button variant={p.featured ? "hero" : "plum"} asChild>
                  <a href="#availability">Check availability</a>
                </Button>
                <Button variant="softline" asChild>
                  <a
                    href={waLink(
                      profile,
                      `Hi ${profile.name.split(" ")[0]}, I'd like to enquire about the ${p.name}.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Enquire on WhatsApp
                  </a>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 8. REVIEWS */
export function ReviewsSection({ profile }: P) {
  return (
    <section id="reviews" className="py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Reviews"
          title="What clients say"
          sub="Reviews from brides and families across Gujarat."
        />
        <div className="mx-auto mt-8 flex max-w-sm items-center justify-center gap-6 rounded-2xl border border-border bg-card px-6 py-5 shadow-soft">
          <div className="text-center">
            <p className="font-display text-4xl font-semibold text-primary">{profile.rating}</p>
            <p className="text-xs text-muted-foreground">out of 5</p>
          </div>
          <div className="h-10 w-px bg-border" aria-hidden="true" />
          <div>
            <Stars />
            <p className="mt-1 text-sm text-muted-foreground">{profile.reviewCount} reviews</p>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {profile.reviews.map((r) => (
            <blockquote
              key={r.name}
              className="rounded-2xl border border-border bg-card p-6 shadow-soft"
            >
              <div className="flex items-center justify-between gap-3">
                <Stars count={r.rating} />
                {r.verified && (
                  <span className="inline-flex items-center gap-1 text-[11px] tracking-wide text-muted-foreground">
                    <Check className="h-3 w-3 text-primary" aria-hidden="true" /> Verified client
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">“{r.text}”</p>
              <footer className="mt-4 text-sm font-semibold">
                {r.name}
                <span className="ml-2 font-normal text-muted-foreground">{r.event}</span>
                {r.date && (
                  <span className="ml-2 font-normal text-muted-foreground">· {r.date}</span>
                )}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 9. VIDEOS */
export function VideosSection({ profile }: P) {
  return (
    <section id="videos" className="bg-gradient-soft py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="Videos"
          title="Transformations on camera"
          sub="Short reels showing the full process from prep to final look."
        />
        <div className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
          {profile.videos.map((v) => (
            <article
              key={v.title}
              className="w-[78vw] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-soft sm:w-[60vw] md:w-auto"
            >
              <div className="relative">
                <img
                  src={v.thumb}
                  alt={imageAlt(profile, v.title)}
                  loading="lazy"
                  decoding="async"
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
              <div className="p-4">
                <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
                  {v.category}
                </p>
                <p className="mt-1 text-sm font-semibold">{v.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{v.blurb}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 10. SERVICE AREAS */
export function ServiceAreasSection({ profile }: P) {
  return (
    <section id="areas" className="py-20">
      <div className="section-shell grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHead eyebrow="Local" title="Areas I serve" center={false} />
          <p className="mt-5 text-muted-foreground">{profile.travelNote}</p>
          <p className="mt-6 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Primary city
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-primary">
            {profile.primaryCity}, {profile.region}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {profile.areas.map((a) => (
            <li
              key={a}
              className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-soft"
            >
              <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {a}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* 11. AVAILABILITY + CONTACT + MAP */
export function AvailabilitySection({ profile }: P) {
  const [date, setDate] = useState("");
  const [service, setService] = useState("");
  const [location, setLocation] = useState("");
  const [sent, setSent] = useState(false);

  const allServices = profile.serviceGroups.flatMap((g) => g.items.map((i) => i.name));

  const enquiry = waLink(
    profile,
    `Hi ${profile.name.split(" ")[0]}, I'd like to check your availability.\nDate: ${
      date || "—"
    }\nService: ${service || "—"}\nLocation: ${location || "—"}`,
  );

  return (
    <section id="availability" className="bg-gradient-soft py-20">
      <div className="section-shell grid gap-8 lg:grid-cols-2">
        <div>
          <SectionHead
            eyebrow="Availability"
            title="Check availability"
            sub={`Planning your wedding? Check whether ${profile.name.split(" ")[0]} is available for your date.`}
            center={false}
          />

          <form
            className="mt-8 space-y-4 rounded-3xl border border-border bg-card p-6 shadow-soft"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  Event date
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/40"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  Service
                </span>
                <select
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/40"
                >
                  <option value="">Select a service</option>
                  {allServices.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                Location
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={`Venue or area in ${profile.primaryCity}`}
                required
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/40"
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" variant="hero" className="sm:flex-1">
                <Calendar aria-hidden="true" /> Check availability
              </Button>
              <Button variant="softline" asChild className="sm:flex-1">
                <a href={enquiry} target="_blank" rel="noreferrer">
                  <MessageCircle aria-hidden="true" /> WhatsApp
                </a>
              </Button>
            </div>

            {sent && (
              <p
                role="status"
                className="rounded-xl border border-primary/20 bg-secondary/60 px-4 py-3 text-sm"
              >
                Thanks — your date request is noted. Send it straight through on WhatsApp for the
                fastest reply.
              </p>
            )}
          </form>
        </div>

        <div id="contact">
          <ul className="space-y-3 text-sm lg:mt-[4.5rem]">
            {[
              { icon: Phone, label: profile.phone, href: telLink(profile) },
              { icon: Mail, label: profile.email, href: `mailto:${profile.email}` },
              { icon: MapPin, label: profile.studio },
              { icon: Clock, label: profile.hours },
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

          <div
            id="location"
            className="mt-4 overflow-hidden rounded-3xl border border-border shadow-lift"
          >
            <iframe
              title={`Map showing ${profile.name}'s studio in ${profile.primaryCity}`}
              src={`https://www.google.com/maps?q=${encodeURIComponent(profile.mapQuery)}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[320px] w-full border-0"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* 12. FAQ */
export function FaqSection({ profile }: P) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-20">
      <div className="section-shell">
        <SectionHead
          eyebrow="FAQ"
          title="Frequently asked questions"
          sub={`Pricing, travel and booking questions brides ask ${profile.name.split(" ")[0]} most often.`}
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {profile.faqs.map((f, i) => (
            <div key={f.q} className="rounded-2xl border border-border bg-card shadow-soft">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold"
              >
                {f.q}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-primary transition-transform",
                    open === i && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
              {open === i && (
                <p className="px-5 pb-5 text-sm text-muted-foreground">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 13. FINAL CTA */
export function FinalCtaSection({ profile }: P) {
  return (
    <section className="bg-gradient-soft bg-beauty-bloom py-20">
      <div className="section-shell">
        <div className="brand-arc relative mx-auto max-w-3xl rounded-3xl border border-border bg-card px-8 py-12 text-center text-primary shadow-lift">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Ready to plan your bridal look?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Check availability and connect directly with {profile.name.split(" ")[0]} for your
            wedding date.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="hero" size="lg" asChild>
              <a href="#availability">
                <Calendar aria-hidden="true" /> Check availability
              </a>
            </Button>
            <Button variant="softline" size="lg" asChild>
              <a href={waLink(profile)} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden="true" /> WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* 14. MOBILE STICKY CTA */
export function MobileStickyCta({ profile }: P) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-3 items-center gap-2 px-3 py-2.5">
        <a
          href={waLink(profile)}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 flex-col items-center justify-center rounded-xl border border-border text-[11px] font-semibold"
        >
          <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
          WhatsApp
        </a>
        <a
          href={telLink(profile)}
          className="flex min-h-11 flex-col items-center justify-center rounded-xl border border-border text-[11px] font-semibold"
        >
          <Phone className="h-4 w-4 text-primary" aria-hidden="true" />
          Call
        </a>
        <a
          href="#availability"
          className="bg-gradient-brand flex min-h-11 items-center justify-center rounded-xl px-2 text-center text-[11px] font-semibold text-primary-foreground"
        >
          Check availability
        </a>
      </div>
    </div>
  );
}

/* 15. DESKTOP WHATSAPP FLOATING BUTTON */
export function WhatsAppButton({ profile }: P) {
  return (
    <a
      href={waLink(profile)}
      target="_blank"
      rel="noreferrer"
      aria-label={`Chat with ${profile.name} on WhatsApp`}
      className="bg-gradient-brand animate-pulse-ring fixed right-5 bottom-5 z-40 hidden items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-lift md:inline-flex"
    >
      <MessageCircle className="h-5 w-5" aria-hidden="true" />
      <span>WhatsApp</span>
    </a>
  );
}
