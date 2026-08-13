import { createFileRoute } from "@tanstack/react-router";

import {
  AboutSection,
  AvailabilitySection,
  FaqSection,
  FinalCtaSection,
  GallerySection,
  MobileStickyCta,
  PackagesSection,
  PortfolioHeroSection,
  ReviewsSection,
  ServiceAreasSection,
  ServicesSection,
  TransformationsSection,
  VideosSection,
  WhatsAppButton,
  WhyChooseSection,
} from "@/components/portfolio/portfolio-sections";
import { SiteFooter } from "@/components/site/site-footer";
import { dhartiProfile, type BeauticianProfile } from "@/data/portfolio";

const profile: BeauticianProfile = dhartiProfile;
const path = `/portfolio/${profile.slug}`;

const title = `${profile.name} — ${profile.headline} | BeautyFolio`;
const description = `Discover ${profile.name}, a ${profile.role.toLowerCase()} in ${profile.primaryCity} specialising in ${profile.specializations
  .slice(0, 3)
  .join(", ")
  .toLowerCase()}. View her portfolio, services, reviews and availability.`;

const services = profile.serviceGroups.flatMap((g) => g.items);

export const Route = createFileRoute("/portfolio/dharti-panchal")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: path },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: path }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify([
          {
            "@context": "https://schema.org",
            "@type": ["BeautySalon", "LocalBusiness"],
            name: profile.name,
            description,
            url: path,
            telephone: profile.phone,
            email: profile.email,
            priceRange: "₹₹",
            openingHours: "Mo-Su 08:00-21:00",
            address: {
              "@type": "PostalAddress",
              streetAddress: profile.studio,
              addressLocality: profile.primaryCity,
              addressRegion: profile.region,
              addressCountry: profile.country,
            },
            areaServed: profile.areas.map((a) => ({ "@type": "City", name: a })),
            founder: {
              "@type": "Person",
              name: profile.name,
              jobTitle: profile.role,
              knowsAbout: profile.specializations,
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: profile.rating,
              reviewCount: profile.reviewCount,
            },
            review: profile.reviews.map((r) => ({
              "@type": "Review",
              author: { "@type": "Person", name: r.name },
              reviewBody: r.text,
              datePublished: r.date,
              reviewRating: { "@type": "Rating", ratingValue: r.rating },
            })),
            makesOffer: services.map((s) => ({
              "@type": "Offer",
              priceCurrency: "INR",
              price: s.price.replace(/[^0-9]/g, ""),
              itemOffered: {
                "@type": "Service",
                name: s.name,
                description: s.detail,
                serviceType: s.name,
                areaServed: profile.primaryCity,
                provider: { "@type": "Person", name: profile.name },
              },
            })),
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: profile.faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "BeautyFolio", item: "/" },
              { "@type": "ListItem", position: 2, name: "Portfolios", item: "/portfolio" },
              { "@type": "ListItem", position: 3, name: profile.name, item: path },
            ],
          },
        ]),
      },
    ],
  }),
  component: PortfolioPage,
});

const navItems = [
  { label: "About", href: "#about" },
  { label: "Gallery", href: "#gallery" },
  { label: "Transformations", href: "#transformations" },
  { label: "Services", href: "#services" },
  { label: "Packages", href: "#packages" },
  { label: "Reviews", href: "#reviews" },
  { label: "FAQ", href: "#faq" },
];

function PortfolioPage() {
  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="section-shell flex h-16 items-center justify-between gap-4">
          <a href="#top" className="font-display text-sm font-semibold whitespace-nowrap">
            {profile.name}
          </a>
          <nav aria-label="Portfolio sections" className="hidden gap-1 lg:flex">
            {navItems.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <a
            href="#availability"
            className="hidden text-sm font-semibold text-primary md:inline"
          >
            Check availability
          </a>
        </div>
      </header>

      <main className="pb-20 md:pb-0">
        <PortfolioHeroSection profile={profile} />
        <AboutSection profile={profile} />
        <WhyChooseSection profile={profile} />
        <GallerySection profile={profile} />
        <TransformationsSection profile={profile} />
        <ServicesSection profile={profile} />
        <PackagesSection profile={profile} />
        <ReviewsSection profile={profile} />
        <VideosSection profile={profile} />
        <ServiceAreasSection profile={profile} />
        <AvailabilitySection profile={profile} />
        <FaqSection profile={profile} />
        <FinalCtaSection profile={profile} />
      </main>

      <WhatsAppButton profile={profile} />
      <MobileStickyCta profile={profile} />
      <SiteFooter />
    </div>
  );
}
