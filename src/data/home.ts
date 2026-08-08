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
  { label: "Resources", href: "#how-it-works" },
  { label: "Blog", href: "#stories" },
  { label: "About", href: "#why" },
];

export const heroBadges = [
  "Free Forever Plan",
  "SEO Optimized",
  "Mobile Friendly",
  "No Technical Skills Required",
];

export const stats = [
  {
    value: 12400,
    suffix: "+",
    label: "Beauticians Joined",
    detail: "Artists, salons and academies building an owned digital identity.",
    icon: "Users",
  },
  {
    value: 180,
    suffix: "+",
    label: "Cities Covered",
    detail: "From metros to tier-3 towns with real local search demand.",
    icon: "MapPin",
  },
  {
    value: 2400000,
    suffix: "+",
    label: "Portfolio Views",
    detail: "Search-driven visits landing on portfolios, not feeds.",
    icon: "Eye",
  },
  {
    value: 460000,
    suffix: "+",
    label: "Monthly Visitors",
    detail: "High-intent clients actively looking to book a professional.",
    icon: "TrendingUp",
  },
  {
    value: 38000,
    suffix: "+",
    label: "Verified Reviews",
    detail: "Structured reviews that feed rich snippets and AI answers.",
    icon: "Star",
  },
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

export const discoverySurfaces = [
  {
    title: "Google Search",
    detail: "Rank for city, area and service keywords with schema-backed pages.",
    metric: "Position #2",
    icon: "Search",
  },
  {
    title: "Google Maps & Local",
    detail: "Service-area pages that reinforce your Google Business Profile.",
    metric: "Top 3 local pack",
    icon: "MapPin",
  },
  {
    title: "AI Search Answers",
    detail: "Answer-first content ChatGPT, Gemini and AI Overviews can quote.",
    metric: "Cited 41 times",
    icon: "Sparkles",
  },
];

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
    description: "City, area and service pages tuned for “bridal makeup near me” searches.",
    icon: "MapPin",
  },
  {
    title: "Google Visibility",
    description: "Clean, crawlable pages and schema so Google understands your services.",
    icon: "Search",
  },
  {
    title: "Reviews",
    description: "Collect, display and syndicate client reviews that build instant trust.",
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
    description: "See views, keywords, calls and enquiries in one simple dashboard.",
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
  { title: "Build Portfolio", detail: "Add services, gallery, packages and reviews with guided prompts." },
  { title: "Rank on Google", detail: "We handle SEO, schema, speed and local optimisation for you." },
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
  { title: "Google Business Ready", detail: "Sync profile, service areas and hours.", icon: "MapPin" },
  { title: "AI Search Ready", detail: "Answer-first content built for AI assistants.", icon: "Sparkles", kind: "ai" },
  { title: "Portfolio Builder", detail: "Drag, drop, publish. No design skills needed.", icon: "LayoutTemplate" },
  { title: "Analytics", detail: "Rankings, views and enquiry sources at a glance.", icon: "BarChart3", kind: "chart" },
  { title: "Reviews", detail: "Verified testimonials with rich snippets.", icon: "Star" },
  { title: "Blog", detail: "Publish authority content that keeps ranking.", icon: "PenLine" },
  { title: "Personal Branding", detail: "A brand that looks as good as your work.", icon: "Crown" },
  { title: "Fast Loading", detail: "Sub-second pages on Indian mobile networks.", icon: "Zap" },
  { title: "Professional Design", detail: "Premium templates crafted for beauty.", icon: "Palette" },
  { title: "Custom Domain Ready", detail: "Bring yourname.in whenever you\u2019re ready.", icon: "Globe" },
];

export const testimonials = [
  {
    name: "Ritika Sharma",
    role: "Bridal Makeup Artist",
    location: "Ahmedabad, Gujarat",
    quote:
      "I had 40k Instagram followers and barely 3 bridal bookings a month. Within 90 days on BeautyFolio I ranked on page one for \u201cbridal makeup artist Ahmedabad\u201d.",
    metric: "3 \u2192 19 bookings / month",
    before: { label: "Monthly leads", value: "2" },
    after: { label: "Monthly leads", value: "47" },
    rating: 5,
  },
  {
    name: "Meera Nair",
    role: "Salon Owner",
    location: "Kochi, Kerala",
    quote:
      "Google now sends me clients who are ready to book. My portfolio does the selling before they even call the salon.",
    metric: "6.4\u00d7 more enquiries",
    before: { label: "Google visits", value: "90/mo" },
    after: { label: "Google visits", value: "2,140/mo" },
    rating: 5,
  },
  {
    name: "Arjun Deshmukh",
    role: "Hair Stylist & Academy",
    location: "Pune, Maharashtra",
    quote:
      "Zero commissions, zero middlemen. My academy admissions come straight to WhatsApp from search.",
    metric: "\u20b94.2L extra revenue",
    before: { label: "Admissions", value: "6/batch" },
    after: { label: "Admissions", value: "31/batch" },
    rating: 5,
  },
];

export const plans = [
  {
    name: "Free",
    monthly: 0,
    yearly: 0,
    tagline: "Get discoverable",
    features: ["Portfolio page", "Gallery (12 photos)", "WhatsApp button", "Basic SEO"],
  },
  {
    name: "Starter",
    monthly: 399,
    yearly: 3990,
    tagline: "Look professional",
    features: ["Everything in Free", "Services & packages", "Reviews module", "Basic analytics"],
  },
  {
    name: "Silver",
    monthly: 799,
    yearly: 7990,
    tagline: "Get found locally",
    features: ["Everything in Starter", "Local SEO pages", "Google Business sync", "Video section"],
    popular: true,
  },
  {
    name: "Gold",
    monthly: 1499,
    yearly: 14990,
    tagline: "Build authority",
    features: ["Everything in Silver", "Blog & content engine", "AI search optimisation", "Priority support"],
  },
  {
    name: "Platinum",
    monthly: 2999,
    yearly: 29990,
    tagline: "Dominate your city",
    features: ["Everything in Gold", "Custom domain", "Dedicated SEO manager", "Monthly growth report"],
  },
];

export const planComparison: { label: string; values: (string | boolean)[] }[] = [
  { label: "Portfolio pages", values: ["1", "1", "3", "8", "Unlimited"] },
  { label: "Local SEO pages", values: [false, false, true, true, true] },
  { label: "AI search optimisation", values: [false, false, false, true, true] },
  { label: "Custom domain", values: [false, false, false, false, true] },
  { label: "Commission on bookings", values: ["0%", "0%", "0%", "0%", "0%"] },
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
    a: "Yes. The Free Forever plan includes a live portfolio, gallery and WhatsApp enquiries with no card required. Upgrade only when you want deeper SEO and growth tools.",
  },
  {
    q: "Do you take commission on my bookings?",
    a: "Never. BeautyFolio is not a marketplace. Every enquiry goes directly to your phone, WhatsApp or inbox — you keep 100% of your earnings.",
  },
  {
    q: "Will my portfolio work well on mobile?",
    a: "Most of your clients search on mobile, so every portfolio is mobile-first, loads in under a second and is designed for one-tap calling and WhatsApp.",
  },
  {
    q: "Can I upgrade or add a custom domain later?",
    a: "Yes. You can move between plans anytime and connect your own domain on Platinum. Your content, rankings and reviews carry over.",
  },
];

export const footerColumns = [
  {
    title: "Platform",
    links: ["Portfolio Builder", "Local SEO", "Google Business Sync", "Reviews", "Analytics", "WhatsApp Leads"],
  },
  {
    title: "Resources",
    links: ["Blog", "Learning Center", "SEO Guides", "BeautyFolio Academy", "Portfolio Examples", "Keyword Ideas"],
  },
  {
    title: "For Professionals",
    links: ["Bridal Makeup Artists", "Salon Owners", "Hair Stylists", "Nail Artists", "Mehndi Artists", "Academies"],
  },
  { title: "Company", links: ["About", "Careers", "Partners", "Press", "Contact"] },
  { title: "Support", links: ["Help Center", "Book a Demo", "WhatsApp Support", "Community", "Status"] },
  { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Refund Policy", "Sitemap"] },
];
