import { getDisplayPricing } from "@/lib/billing-prices";

export type DeviceKey = "desktop" | "tablet" | "mobile";

export const deviceWidths: Record<DeviceKey, string> = {
  desktop: "100%",
  tablet: "34rem",
  mobile: "20rem",
};

export const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Portfolio", href: "#portfolio" },
  { label: "Pricing", href: "#pricing" },
  { label: "How it works", href: "#how-it-works" },
  { label: "About", href: "#why" },
];

export const heroTrustSignals = ["Free to start", "No credit card required", "Ready in 10 minutes"];

export const heroBadges = [
  "Free Forever Plan",
  "SEO Optimized",
  "Mobile Friendly",
  "No Technical Skills Required",
];

export const instagramJourney = [
  { step: "Post", detail: "You publish today's bridal look." },
  { step: "Wait", detail: "The algorithm decides who sees it." },
  { step: "Hope", detail: "Maybe a DM. Maybe nothing at all." },
];

export const googleJourney = [
  { step: "Search", detail: "\u201cBridal makeup artist near me\u201d at 11pm." },
  { step: "Intent", detail: "She compares portfolios, prices and reviews." },
  { step: "Booking", detail: "She calls or WhatsApps you directly." },
];

// Capability-oriented labels only — no ranking position, local-pack
// placement, or citation-count numbers, since none of those are
// measurable/guaranteed outcomes this product can verify or promise.
export const discoverySurfaces = [
  {
    title: "Google Search",
    detail:
      "Every portfolio ships with schema-backed service and location details, so Google understands exactly what you offer and where.",
    metric: "Search-ready structure",
    icon: "Search",
    kind: "serp",
  },
  {
    title: "Google Maps & Local",
    detail:
      "Your service areas and business details are structured consistently to support your existing Google Business Profile.",
    metric: "Local business signals",
    icon: "MapPin",
    kind: "score",
  },
  {
    title: "AI Search Answers",
    detail:
      "Answer-first, structured content that AI assistants like ChatGPT and Gemini can read and quote.",
    metric: "AI-crawlable content",
    icon: "Sparkles",
    kind: "chart",
  },
];

// Illustrative example only — a mockup of what a well-optimized search
// result and portfolio page can look like, not a real customer's data.
// The `outcomes` list is deliberately capability-oriented rather than a
// specific percentage, since no such figure has a verified source.
export const searchVisibility = {
  query: "Bridal Makeup Artist in Ahmedabad",
  result: {
    rank: "#3",
    source: "BeautyFolio Portfolio",
    breadcrumb: "beautyfolio.in › your-name › bridal-makeup-ahmedabad",
    title: "Your Name — Bridal Makeup Artist in Ahmedabad | BeautyFolio",
    description:
      "12 years of bridal experience. HD & airbrush bridal packages from ₹18,000. Book directly on WhatsApp — no commission.",
    rating: "4.9",
    reviews: "Client reviews",
    chips: ["Years of experience", "HD & Airbrush", "Serving your areas", "Book Now"],
  },
  outcomes: [
    {
      label: "Portfolio Views",
      delta: "Search-driven",
      detail: "Visits from people actively searching, not a social feed",
    },
    {
      label: "WhatsApp Enquiries",
      delta: "Direct to you",
      detail: "One-tap enquiries, zero commission",
    },
  ],
};

export const instagramLimits = [
  "Algorithm decides who sees your work",
  "Followers ≠ paying customers",
  "Almost zero search visibility",
  "You never own the audience",
  "Enquiries lost in crowded DMs",
];

export const beautyfolioWins = [
  "High buying-intent Google traffic",
  "Ranks for “near me” local searches",
  "Local SEO built into every page",
  "A professional portfolio you own",
  "Direct WhatsApp & call enquiries",
];

export const features = [
  {
    title: "Professional Portfolio",
    description: "A premium, ready-to-share website for your beauty brand in minutes.",
    icon: "LayoutTemplate",
  },
  {
    title: "Local SEO",
    description: "Service and location details tuned for “bridal makeup near me” searches.",
    icon: "MapPin",
  },
  {
    title: "Google Visibility",
    description: "Clean, crawlable pages and schema so Google understands your services.",
    icon: "Search",
  },
  {
    title: "Reviews",
    description: "Showcase client testimonials that build instant trust.",
    icon: "Star",
  },
  {
    title: "AI Search Ready",
    description: "Structured content that AI assistants can read, quote and recommend.",
    icon: "Sparkles",
  },
  {
    title: "WhatsApp Leads",
    description: "One-tap enquiries that land straight in your WhatsApp, commission free.",
    icon: "MessageCircle",
  },
  {
    title: "Analytics",
    description: "See portfolio views, calls and enquiries in one simple dashboard.",
    icon: "BarChart3",
  },
  {
    title: "Personal Branding",
    description: "Tell your story with bio, videos, awards and signature work.",
    icon: "Crown",
  },
  {
    title: "Future CRM",
    description: "Enquiry pipeline, follow-ups and bookings — coming to every plan.",
    icon: "Workflow",
  },
] as const;

export const steps = [
  { title: "Create Account", detail: "Sign up free in under a minute — no card, no code." },
  {
    title: "Build Portfolio",
    detail: "Add services, gallery, packages and reviews with guided prompts.",
  },
  {
    title: "Rank on Google",
    detail: "We handle SEO, schema, speed and local optimisation for you.",
  },
  { title: "Receive Enquiries", detail: "Clients call or WhatsApp you directly. Zero commission." },
  { title: "Grow Business", detail: "Track what works and scale with content and reputation." },
];

export const bento = [
  {
    title: "Ranked on Google, not buried in a feed",
    detail:
      "Technical SEO, metadata, schema and internal linking are generated for every portfolio \u2014 so your name shows up the moment a client searches your city and service.",
    icon: "Search",
    kind: "rank",
  },
  {
    title: "AI Search Ready",
    detail: "Answer-first content built for AI assistants.",
    icon: "Sparkles",
    kind: "ai",
  },
  {
    title: "Portfolio Builder",
    detail: "Drag, drop, publish. No design skills needed.",
    icon: "LayoutTemplate",
  },
  {
    title: "Analytics",
    detail: "Views and enquiry sources at a glance.",
    icon: "BarChart3",
    kind: "chart",
  },
  { title: "Reviews", detail: "Client testimonials with rich snippets.", icon: "Star" },
  { title: "Personal Branding", detail: "A brand that looks as good as your work.", icon: "Crown" },
  { title: "Fast Loading", detail: "Built for fast performance on mobile networks.", icon: "Zap" },
  {
    title: "Professional Design",
    detail: "Premium templates crafted for beauty.",
    icon: "Palette",
  },
];

export interface PricingPlanCard {
  name: string;
  monthly: number;
  yearly: number;
  tagline: string;
  features: string[];
  popular?: boolean;
}

export const plans: PricingPlanCard[] = [
  {
    name: "Start",
    monthly: 0,
    yearly: 0,
    tagline: "Build Your Online Presence",
    features: [
      "Professional BeautyFolio portfolio",
      "Photo & video showcase",
      "Services & service areas",
      "WhatsApp & Call enquiries",
      "Basic search-engine-ready setup",
    ],
  },
  {
    name: "Search Ready",
    ...getDisplayPricing("starter"),
    tagline: "Become Search Ready",
    features: [
      "Everything in Start",
      "Enhanced portfolio SEO",
      "Service & location optimization",
      "Reviews + search-friendly FAQs",
      "Lead inbox & basic follow-up",
    ],
  },
  {
    name: "Lead Growth",
    ...getDisplayPricing("silver"),
    tagline: "Get Found. Generate Leads.",
    features: [
      "Everything in Search Ready",
      "Advanced local-search readiness",
      "Enhanced SEO & structured data",
      "Lead management dashboard",
      "Lead-source & performance tracking",
    ],
    popular: true,
  },
  {
    name: "Client Growth",
    ...getDisplayPricing("gold"),
    tagline: "Turn More Leads Into Clients",
    features: [
      "Everything in Lead Growth",
      "Advanced search optimization",
      "Lead status tracking, incl. Won & Lost",
      "Overdue & follow-up reminders",
      "Higher content capacity across every module",
    ],
  },
  {
    name: "Brand Growth",
    ...getDisplayPricing("platinum"),
    tagline: "Build Your Own Beauty Brand",
    features: [
      "Everything in Client Growth",
      "Independent branded website",
      "Your own custom domain",
      "BeautyFolio lead management",
      "Monthly growth consultation",
    ],
  },
];

// Every row below corresponds to a real, code-enforced distinction in
// src/lib/plan-limits.ts — never a claim without a marketing claim without a matching entitlement.
export const planComparison: { label: string; values: (string | boolean)[] }[] = [
  { label: "Professional portfolio",          values: [true,  true,  true,  true,  true]  },
  { label: "Photo & video showcase",          values: [true,  true,  true,  true,  true]  },
  { label: "SEO foundation",                  values: [true,  true,  true,  true,  true]  },
  { label: "Enhanced search readiness",       values: [false, true,  true,  true,  true]  },
  { label: "Local search optimization",       values: ["—",   "Basic","Advanced","Advanced","Advanced"] },
  { label: "Reviews + FAQs",                  values: ["Basic", true, true,  true,  true]  },
  { label: "Lead capture",                    values: [true,  true,  true,  true,  true]  },
  { label: "Lead management dashboard",       values: [true,  true,  true,  true,  true]  },
  { label: "Lead source tracking",            values: [true,  true,  true,  true,  true]  },
  { label: "Follow-up & overdue tracking",    values: [true,  true,  true,  true,  true]  },
  { label: "Lead status tracking (incl. Won & Lost)", values: [true, true, true, true, true] },
  { label: "Advanced tracking support (GTM)", values: [false, false, true,  true,  true]  },
  { label: "Monthly growth consultation",     values: [false, false, false, false, true]  },
  { label: "Independent branded website",     values: [false, false, false, false, true]  },
  { label: "Custom domain",                   values: [false, false, false, false, true]  },
];

export const faqs = [
  {
    q: "What exactly is a BeautyFolio portfolio?",
    a: "It is your own SEO-optimised beauty website — hero, about, gallery, services, packages, reviews, videos, contact, map and a WhatsApp button — published on a fast, mobile-first page you fully own.",
  },
  {
    q: "Do I need SEO knowledge to rank on Google?",
    a: "No. Metadata, schema, image optimisation, page speed and local signals are built in. You add your work and services; we handle the technical SEO.",
  },
  {
    q: "How long before I start ranking on Google?",
    a: "Most professionals see indexing within days and meaningful local ranking movement in 60–120 days, depending on city competition and how complete their portfolio is.",
  },
  {
    q: "Is the free plan really free?",
    a: "Yes. The Free Forever plan includes a live portfolio, gallery and WhatsApp enquiries with no card required. Move to a paid plan later if you want higher content limits and more capacity.",
  },
  {
    q: "Do you take commission on my bookings?",
    a: "Never. BeautyFolio is not a marketplace. Every enquiry goes directly to your phone, WhatsApp or inbox — you keep 100% of your earnings.",
  },
  {
    q: "Will my portfolio work well on mobile?",
    a: "Most of your clients search on mobile, so every portfolio is mobile-first and designed for one-tap calling and WhatsApp.",
  },
  {
    q: "Can I upgrade my plan later?",
    a: "Yes. You can move between plans anytime. Paid plan upgrades are currently activated by the BeautyFolio team — self-serve payments are coming later. Your content and reviews carry over.",
  },
];

// Every link below points to a real, existing destination (an in-app
// route or an actual anchor on this page) — no placeholder links. A
// column/link is included only if it has one; see the implementation
// report for what was removed and why (Blog, Careers, Privacy Policy,
// etc. have no real destination yet).
export const footerColumns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "Portfolio Builder", href: "#portfolio" },
      { label: "Local SEO", href: "#discovery" },
      { label: "Reviews", href: "#features" },
      { label: "Analytics", href: "#features" },
      { label: "WhatsApp Leads", href: "#features" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "About", href: "#why" }],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Refund Policy", href: "/refund-policy" },
    ],
  },
];
