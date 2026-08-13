import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery3 from "@/assets/gallery-3.jpg";
import gallery4 from "@/assets/dharti-gallery-4.jpg";
import gallery5 from "@/assets/dharti-gallery-5.jpg";
import gallery6 from "@/assets/dharti-gallery-6.jpg";
import portrait from "@/assets/dharti-portrait.jpg";

/* ---------------------------------------------------------------
   Data-driven beautician profile.
   Every portfolio page renders from a profile object of this shape.
---------------------------------------------------------------- */

export type GalleryCategory =
  | "bridal"
  | "party"
  | "hd"
  | "hair"
  | "nails"
  | "before-after";

export interface GalleryItem {
  src: string;
  /** Short human label used to build descriptive alt text. */
  label: string;
  category: GalleryCategory;
}

export interface ServiceItem {
  name: string;
  duration: string;
  detail: string;
  price: string;
}

export interface ServiceGroup {
  group: string;
  items: ServiceItem[];
}

export interface BeauticianProfile {
  slug: string;
  name: string;
  role: string;
  specialty: string;
  headline: string;
  positioning: string;
  portrait: string;
  city: string;
  primaryCity: string;
  region: string;
  country: string;
  rating: number;
  reviewCount: number;
  experience: string;
  looksDelivered: string;
  clients: string;
  specializations: string[];
  areas: string[];
  travelNote: string;
  phone: string;
  whatsapp: string;
  email: string;
  studio: string;
  hours: string;
  mapQuery: string;
  trustBar: { label: string; value: string }[];
  about: { intro: string; second: string; highlights: string[] };
  whyChoose: string[];
  gallery: GalleryItem[];
  transformations: {
    before: string;
    after: string;
    service: string;
    occasion: string;
  }[];
  serviceGroups: ServiceGroup[];
  packages: {
    name: string;
    price: string;
    note: string;
    bestFor: string;
    featured?: boolean;
    includes: string[];
  }[];
  reviews: {
    name: string;
    event: string;
    text: string;
    rating: number;
    date?: string;
    verified?: boolean;
  }[];
  videos: { title: string; length: string; thumb: string; category: string; blurb: string }[];
  faqs: { q: string; a: string }[];
}

export const dhartiProfile: BeauticianProfile = {
  slug: "dharti-panchal",
  name: "Dharti Panchal",
  role: "Bridal Makeup Artist",
  specialty: "Bridal & Luxury Makeup",
  headline: "Bridal Makeup Artist in Ahmedabad",
  positioning:
    "Bridal and luxury makeup artist creating timeless, camera-ready looks for weddings and special occasions across Ahmedabad.",
  portrait,
  city: "Satellite, Ahmedabad",
  primaryCity: "Ahmedabad",
  region: "Gujarat",
  country: "IN",
  rating: 4.9,
  reviewCount: 214,
  experience: "8+ years",
  looksDelivered: "500+ bridal looks",
  clients: "600+",
  specializations: ["Bridal Makeup", "HD Makeup", "Airbrush Makeup", "Wedding Makeup"],
  areas: [
    "Ahmedabad",
    "Bodakdev",
    "Satellite",
    "Prahlad Nagar",
    "Bopal",
    "Thaltej",
    "Gandhinagar",
    "Chandkheda",
  ],
  travelNote:
    "Available for bridal makeup appointments across Ahmedabad and nearby areas, including destination weddings in Gujarat.",
  phone: "+91 98250 41200",
  whatsapp: "919825041200",
  email: "hello@dhartipanchal.in",
  studio: "204, Silver Arc, Satellite Road, Ahmedabad, Gujarat 380015",
  hours: "Mon–Sun · 8:00 AM – 9:00 PM (by appointment)",
  mapQuery: "Satellite, Ahmedabad, Gujarat",
  trustBar: [
    { label: "Experience", value: "8+ Years" },
    { label: "Bridal looks", value: "500+" },
    { label: "Rating", value: "4.9★" },
    { label: "Based in", value: "Ahmedabad & nearby" },
  ],
  about: {
    intro:
      "I'm Dharti — I've spent the last eight years doing bridal makeup in Ahmedabad, and I still start every wedding the same way: understanding the bride, her outfit and how she wants to feel when she walks in.",
    second:
      "My work is skin-first — clean prep, a breathable HD or airbrush base, and detailing built to survive a fourteen-hour function and photograph beautifully in both daylight mandaps and evening receptions. Trials, hair and draping are handled in-house by my two-person team.",
    highlights: [
      "Certified in HD & airbrush artistry (Lakmé Academy)",
      "Sensitive-skin friendly, cruelty-free product kit",
      "Travels across Gujarat for destination weddings",
      "Same-day trial slots for last-minute functions",
    ],
  },
  whyChoose: [
    "8+ years of professional bridal experience",
    "Premium professional products only",
    "HD & airbrush makeup specialist",
    "Personalised bridal consultation before every wedding",
    "On-location service at your home or venue",
    "Camera-ready makeup built for wedding photography",
  ],
  gallery: [
    { src: gallery4, label: "HD bridal makeup with rose gold eyes", category: "hd" },
    { src: gallery1, label: "Bridal makeup with traditional jewellery", category: "bridal" },
    { src: gallery5, label: "Engagement soft glam makeup", category: "party" },
    { src: gallery2, label: "Party makeup with glossy finish", category: "party" },
    { src: gallery6, label: "Sangeet makeup with bridal hairstyle", category: "hair" },
    { src: gallery3, label: "Reception makeup with sculpted base", category: "bridal" },
    { src: gallery1, label: "Bridal nail art and hand styling", category: "nails" },
    { src: gallery4, label: "Bridal transformation before and after", category: "before-after" },
  ],
  transformations: [
    {
      before: gallery2,
      after: gallery4,
      service: "HD Bridal Makeup",
      occasion: "Wedding · Satellite, Ahmedabad",
    },
    {
      before: gallery3,
      after: gallery5,
      service: "Airbrush Bridal Makeup",
      occasion: "Reception · Bodakdev",
    },
    {
      before: gallery1,
      after: gallery6,
      service: "Sangeet Makeup & Hair",
      occasion: "Sangeet · Gandhinagar",
    },
  ],
  serviceGroups: [
    {
      group: "Makeup",
      items: [
        {
          name: "HD Bridal Makeup",
          duration: "3 hrs",
          detail: "Full face HD base, lashes, hairstyling and draping at your venue.",
          price: "₹18,000",
        },
        {
          name: "Airbrush Bridal Makeup",
          duration: "3.5 hrs",
          detail: "Weightless airbrush finish built for long shoots and humid mandap mornings.",
          price: "₹22,000",
        },
        {
          name: "Engagement & Reception",
          duration: "2 hrs",
          detail: "Soft glam or bold glam, tuned for evening lighting.",
          price: "₹8,500",
        },
        {
          name: "Party & Sangeet Makeup",
          duration: "90 mins",
          detail: "Studio or on-location glam for sangeet, haldi and cocktail nights.",
          price: "₹5,500",
        },
      ],
    },
    {
      group: "Hair",
      items: [
        {
          name: "Bridal Hairstyle",
          duration: "60 mins",
          detail: "Classic or contemporary bridal setting with jewellery placement.",
          price: "₹4,500",
        },
        {
          name: "Hair Styling",
          duration: "45 mins",
          detail: "Blow-dry, curls or sleek styling for family and guests.",
          price: "₹2,000",
        },
        {
          name: "Hair Extensions",
          duration: "45 mins",
          detail: "Volume and length matching for heavier bridal hairstyles.",
          price: "₹3,000",
        },
      ],
    },
    {
      group: "Additional services",
      items: [
        {
          name: "Saree & Lehenga Draping",
          duration: "30 mins",
          detail: "Structured draping with pleating and pinning that holds all day.",
          price: "₹1,500",
        },
        {
          name: "Lash Application",
          duration: "20 mins",
          detail: "Individual or strip lashes matched to your eye shape.",
          price: "₹800",
        },
        {
          name: "Bridal Nail Art",
          duration: "45 mins",
          detail: "Coordinated nail art to finish the bridal look.",
          price: "₹1,200",
        },
      ],
    },
  ],
  packages: [
    {
      name: "Engagement Package",
      price: "₹12,000",
      note: "Single function",
      bestFor: "Brides with one main function to cover",
      includes: ["Engagement makeup", "Hair styling", "Draping", "Touch-up kit"],
    },
    {
      name: "Complete Bridal Package",
      price: "₹38,000",
      note: "Most popular",
      bestFor: "Full multi-day weddings from haldi to reception",
      featured: true,
      includes: [
        "Haldi, mehendi, wedding & reception looks",
        "Free trial before the wedding",
        "Airbrush base for the wedding day",
        "Hair, draping & jewellery setting",
        "On-site touch-up assistant",
      ],
    },
    {
      name: "Family Package",
      price: "₹12,000",
      note: "Up to 4 people",
      bestFor: "Mothers, sisters and bridesmaids on the same day",
      includes: ["4 guest makeup looks", "Hair styling", "Draping for 2", "Same-venue service"],
    },
  ],
  reviews: [
    {
      name: "Priya Mehta",
      event: "HD Bridal Makeup · Wedding, Ahmedabad",
      rating: 5,
      date: "March 2026",
      verified: true,
      text: "Best bridal look I could have asked for. The airbrush base held up through a 14-hour day and every photo came out flawless.",
    },
    {
      name: "Aisha Khan",
      event: "Reception Makeup · Gandhinagar",
      rating: 5,
      date: "February 2026",
      verified: true,
      text: "Booked directly on WhatsApp and got a quote in ten minutes. Dharti understood my brief instantly and the hair styling was stunning.",
    },
    {
      name: "Nidhi Shah",
      event: "Sangeet Makeup · Baroda",
      rating: 5,
      date: "January 2026",
      verified: true,
      text: "She did makeup for me and six family members and still finished ahead of schedule. Calm, professional and genuinely talented.",
    },
    {
      name: "Rutvi Patel",
      event: "Engagement Makeup · Ahmedabad",
      rating: 5,
      date: "December 2025",
      verified: true,
      text: "I have very sensitive skin and nothing irritated it. The trial made me feel completely relaxed about the big day.",
    },
  ],
  videos: [
    {
      title: "Bridal Makeup Transformation",
      category: "HD Bridal Makeup",
      blurb: "Full prep-to-finish bridal look shot on a real wedding morning in Ahmedabad.",
      length: "3:42",
      thumb: gallery4,
    },
    {
      title: "HD Bridal Look for Humid Weather",
      category: "Airbrush Bridal Makeup",
      blurb: "The airbrush base routine I use when the mandap is outdoors.",
      length: "2:15",
      thumb: gallery5,
    },
    {
      title: "Wedding Reception Makeup",
      category: "Reception Glam",
      blurb: "Evening reception glam and hair styling done in 45 minutes.",
      length: "4:08",
      thumb: gallery6,
    },
  ],
  faqs: [
    {
      q: "How much does bridal makeup cost in Ahmedabad?",
      a: "My HD bridal makeup starts at ₹18,000 and airbrush bridal makeup at ₹22,000, including hair, lashes and draping. Complete multi-function wedding packages start at ₹38,000.",
    },
    {
      q: "Do you travel to the bride's location?",
      a: "Yes. On-location service across Ahmedabad, Gandhinagar and nearby areas is included with no extra travel charge within the city. Destination weddings in Gujarat are quoted separately.",
    },
    {
      q: "How early should I book bridal makeup?",
      a: "For peak wedding season (November to February) I recommend booking 3–6 months ahead. Off-season dates are usually available with 3–4 weeks' notice.",
    },
    {
      q: "Do you offer HD or airbrush makeup?",
      a: "Both. HD suits indoor and evening functions, while airbrush is my recommendation for long daytime functions and humid outdoor mandaps.",
    },
    {
      q: "What is included in the bridal package?",
      a: "The Complete Bridal Package covers haldi, mehendi, wedding and reception looks, a pre-wedding trial, airbrush base on the wedding day, hair, draping, jewellery setting and an on-site touch-up assistant.",
    },
    {
      q: "Do you offer bridal makeup trials?",
      a: "Yes. A standalone trial is ₹2,500 and it's included free with the Complete Bridal Package. We plan the look with your actual outfit and jewellery.",
    },
    {
      q: "Do you provide hairstyling and draping?",
      a: "Yes — hair styling and saree or lehenga draping are done in-house by my two-person team, so you don't need to book anyone separately.",
    },
  ],
};

/** Builds descriptive, SEO-friendly alt text from profile data. */
export function imageAlt(profile: BeauticianProfile, label: string) {
  return `${label} by ${profile.name}, ${profile.role.toLowerCase()} in ${profile.primaryCity}`;
}

export const galleryFilters: { id: "all" | GalleryCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "bridal", label: "Bridal" },
  { id: "party", label: "Party" },
  { id: "hd", label: "HD" },
  { id: "hair", label: "Hair" },
  { id: "nails", label: "Nails" },
  { id: "before-after", label: "Before & After" },
];
