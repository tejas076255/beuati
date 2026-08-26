import { createFileRoute } from "@tanstack/react-router";

import { absoluteUrl } from "@/lib/site-url";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Hero } from "@/components/home/hero";
import { SocialProof } from "@/components/home/social-proof";
import { ProblemSection } from "@/components/home/problem-section";
import { SolutionSection } from "@/components/home/solution-section";
import { DiscoverySection } from "@/components/home/discovery-section";
import { SearchVisibilityShowcase } from "@/components/home/search-visibility";
import { PortfolioShowcase } from "@/components/home/portfolio-showcase";

import { HowItWorks } from "@/components/home/how-it-works";
import { WhyBeautyFolio } from "@/components/home/why-beautyfolio";
import { SuccessStories } from "@/components/home/success-stories";
import { PricingPreview } from "@/components/home/pricing-preview";
import { FaqSection } from "@/components/home/faq-section";
import { FinalCta } from "@/components/home/final-cta";
import { faqs } from "@/data/home";

const title = "BeautyFolio — SEO Portfolios for India's Beauty Professionals";
const description =
  "Create a free SEO-optimized beauty portfolio, rank on Google and local search, and get direct client enquiries with zero marketplace commissions.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: absoluteUrl("/") },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/") }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "BeautyFolio",
          url: absoluteUrl("/"),
          description,
          areaServed: "IN",
          sameAs: [],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.q,
            acceptedAnswer: { "@type": "Answer", text: faq.a },
          })),
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "/" }],
        }),
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <SocialProof />
        <ProblemSection />
        <DiscoverySection />
        <SolutionSection />
        <SearchVisibilityShowcase />
        <PortfolioShowcase />

        <HowItWorks />
        <WhyBeautyFolio />
        <SuccessStories />
        <PricingPreview />
        <FaqSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
