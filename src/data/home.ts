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
  { value: 12400, suffix: "+", label: "Beauticians Joined" },
  { value: 180, suffix: "+", label: "Cities Covered" },
  { value: 2400000, suffix: "+", label: "Portfolio Views" },
  { value: 460000, suffix: "+", label: "Monthly Visitors" },
  { value: 38000, suffix: "+", label: "Verified Reviews" },
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
  { title: "SEO Optimized", detail: "Technical SEO, metadata and schema handled automatically." },
  { title: "Google Business Ready", detail: "Sync your profile, service areas and hours." },
  { title: "AI Search Ready", detail: "Answer-first content built for AI assistants." },
  { title: "Portfolio Builder", detail: "Drag, drop, publish. No design skills needed." },
  { title: "Analytics", detail: "Rankings, views and enquiry sources at a glance." },
  { title: "Reviews", detail: "Verified client testimonials with rich snippets." },
  { title: "Blog", detail: "Publish authority content that keeps ranking." },
  { title: "Personal Branding", detail: "A brand that looks as good as your work." },
  { title: "Fast Loading", detail: "Sub-second pages on Indian mobile networks." },
  { title: "Professional Design", detail: "Premium templates crafted for beauty." },
  { title: "Custom Domain Ready", detail: "Bring yourname.in whenever you're ready." },
];

export const testimonials = [
  {
    name: "Ritika Sharma",
    role: "Bridal Makeup Artist",
    location: "Ahmedabad, Gujarat",
    quote:
      "I had 40k Instagram followers and barely 3 bridal bookings a month. Within 90 days on BeautyFolio I ranked on page one for “bridal makeup artist Ahmedabad”.",
    metric: "3 → 19 bookings / month",
    rating: 5,
  },
  {
    name: "Meera Nair",
    role: "Salon Owner",
    location: "Kochi, Kerala",
    quote:
      "Google now sends me clients who are ready to book. My portfolio does the selling before they even call the salon.",
    metric: "6.4× more enquiries",
    rating: 5,
  },
  {
    name: "Arjun Deshmukh",
    role: "Hair Stylist & Academy",
    location: "Pune, Maharashtra",
    quote:
      "Zero commissions, zero middlemen. My academy admissions come straight to WhatsApp from search.",
    metric: "₹4.2L extra revenue",
    rating: 5,
  },
];

export const plans = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    tagline: "Get discoverable",
    features: ["Portfolio page", "Gallery (12 photos)", "WhatsApp button", "Basic SEO"],
  },
  {
    name: "Starter",
    price: "₹399",
    period: "/month",
    tagline: "Look professional",
    features: ["Everything in Free", "Services & packages", "Reviews module", "Basic analytics"],
  },
  {
    name: "Silver",
    price: "₹799",
    period: "/month",
    tagline: "Get found locally",
    features: ["Everything in Starter", "Local SEO pages", "Google Business sync", "Video section"],
    popular: true,
  },
  {
    name: "Gold",
    price: "₹1,499",
    period: "/month",
    tagline: "Build authority",
    features: ["Everything in Silver", "Blog & content engine", "AI search optimisation", "Priority support"],
  },
  {
    name: "Platinum",
    price: "₹2,999",
    period: "/month",
    tagline: "Dominate your city",
    features: ["Everything in Gold", "Custom domain", "Dedicated SEO manager", "Monthly growth report"],
  },
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
    links: ["Portfolio Builder", "Local SEO", "Reviews", "Analytics", "WhatsApp Leads"],
  },
  { title: "Resources", links: ["Blog", "SEO Guides", "Portfolio Examples", "Help Center"] },
  { title: "Company", links: ["About", "Careers", "Partners", "Contact"] },
  { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Refund Policy"] },
  { title: "Support", links: ["Book a Demo", "WhatsApp Support", "Community", "Status"] },
];
