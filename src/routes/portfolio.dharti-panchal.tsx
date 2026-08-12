import { createFileRoute } from "@tanstack/react-router";

import {
  AboutSection,
  ContactSection,
  GallerySection,
  PackagesSection,
  PortfolioHeroSection,
  ReviewsSection,
  ServicesSection,
  VideosSection,
  WhatsAppButton,
} from "@/components/portfolio/portfolio-sections";
import { SiteFooter } from "@/components/site/site-footer";
import { artist, reviews, services } from "@/data/portfolio";

const title = "Dharti Panchal — Bridal Makeup Artist in Ahmedabad";
const description =
  "HD and airbrush bridal makeup by Dharti Panchal in Satellite, Ahmedabad. View gallery, services, packages, reviews and book directly on WhatsApp.";

export const Route = createFileRoute("/portfolio/dharti-panchal")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: "/portfolio/dharti-panchal" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BeautySalon",
          name: artist.name,
          description,
          image: [],
          telephone: artist.phone,
          email: artist.email,
          address: {
            "@type": "PostalAddress",
            streetAddress: artist.studio,
            addressLocality: "Ahmedabad",
            addressRegion: "Gujarat",
            addressCountry: "IN",
          },
          areaServed: artist.areas,
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: artist.rating,
            reviewCount: artist.reviewCount,
          },
          review: reviews.slice(0, 2).map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.name },
            reviewBody: r.text,
            reviewRating: { "@type": "Rating", ratingValue: 5 },
          })),
          makesOffer: services.map((s) => ({
            "@type": "Offer",
            name: s.name,
            price: s.price.replace(/[^0-9]/g, ""),
            priceCurrency: "INR",
          })),
        }),
      },
    ],
  }),
  component: PortfolioPage,
});

const navItems = [
  { label: "About", href: "#about" },
  { label: "Gallery", href: "#gallery" },
  { label: "Services", href: "#services" },
  { label: "Packages", href: "#packages" },
  { label: "Reviews", href: "#reviews" },
  { label: "Videos", href: "#videos" },
  { label: "Contact", href: "#contact" },
];

function PortfolioPage() {
  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="section-shell flex h-16 items-center justify-between gap-4">
          <a href="#top" className="font-display text-sm font-semibold whitespace-nowrap">
            {artist.name}
          </a>
          <nav aria-label="Portfolio sections" className="hidden gap-1 md:flex">
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
          <span className="text-xs text-muted-foreground">{artist.city}</span>
        </div>
      </header>

      <main>
        <PortfolioHeroSection />
        <AboutSection />
        <GallerySection />
        <ServicesSection />
        <PackagesSection />
        <ReviewsSection />
        <VideosSection />
        <ContactSection />
      </main>

      <WhatsAppButton />
      <SiteFooter />
    </div>
  );
}
