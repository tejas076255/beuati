import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery3 from "@/assets/gallery-3.jpg";
import gallery4 from "@/assets/dharti-gallery-4.jpg";
import gallery5 from "@/assets/dharti-gallery-5.jpg";
import gallery6 from "@/assets/dharti-gallery-6.jpg";

export const artist = {
  name: "Dharti Panchal",
  role: "Bridal & Party Makeup Artist",
  city: "Satellite, Ahmedabad",
  tagline: "HD & airbrush bridal makeup that lasts from the haldi to the last dance.",
  rating: 4.9,
  reviewCount: 214,
  experience: "8+ years",
  brides: "600+",
  areas: ["Satellite", "Bopal", "Prahlad Nagar", "SG Highway", "Vastrapur", "Thaltej"],
  phone: "+91 98250 41200",
  whatsapp: "919825041200",
  email: "hello@dhartipanchal.in",
  studio: "204, Silver Arc, Satellite Road, Ahmedabad, Gujarat 380015",
  hours: "Mon–Sun · 8:00 AM – 9:00 PM (by appointment)",
};

export const about = {
  intro:
    "I'm Dharti — a Gujarat-based makeup artist who has worked with more than 600 brides across Ahmedabad, Gandhinagar and Baroda. My work is skin-first: clean prep, breathable HD or airbrush base, and detailing that photographs beautifully in both daylight mandaps and evening receptions.",
  second:
    "Every booking starts with a free consultation where we match your outfit, jewellery and venue lighting to a look that still feels like you. Trials, hair styling and draping are handled in-house by my two-person team.",
  highlights: [
    "Certified in HD & airbrush artistry (Lakmé Academy)",
    "Sensitive-skin friendly, cruelty-free product kit",
    "Travels across Gujarat for destination weddings",
    "Same-day trial slots for last-minute functions",
  ],
};

export const gallery = [
  { src: gallery4, alt: "Bridal HD makeup close-up with rose gold eyes" },
  { src: gallery1, alt: "Bridal makeup look with traditional jewellery" },
  { src: gallery5, alt: "Engagement soft glam makeup look" },
  { src: gallery2, alt: "Party makeup look with glossy finish" },
  { src: gallery6, alt: "Sangeet night makeup with hair styling" },
  { src: gallery3, alt: "Reception makeup with sculpted base" },
];

export const services = [
  {
    name: "HD Bridal Makeup",
    duration: "3 hrs",
    detail: "Full face HD base, lashes, hairstyling and saree/lehenga draping at your venue.",
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
    detail: "Soft glam or bold glam with hair styling, ideal for evening lighting.",
    price: "₹8,500",
  },
  {
    name: "Party & Sangeet Makeup",
    duration: "90 mins",
    detail: "Studio or on-location glam for sangeet, haldi and cocktail nights.",
    price: "₹5,500",
  },
  {
    name: "Family & Guest Makeup",
    duration: "45 mins each",
    detail: "Coordinated looks for mothers, sisters and bridesmaids.",
    price: "₹3,000",
  },
  {
    name: "Makeup Trial",
    duration: "60 mins",
    detail: "Look planning with your outfit and jewellery, adjusted on the spot.",
    price: "₹2,500",
  },
];

export const packages = [
  {
    name: "Engagement Package",
    price: "₹12,000",
    note: "Single function",
    includes: ["Engagement makeup", "Hair styling", "Draping", "Touch-up kit"],
  },
  {
    name: "Complete Bridal Package",
    price: "₹38,000",
    note: "Most booked",
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
    includes: ["4 guest makeup looks", "Hair styling", "Draping for 2", "Same-venue service"],
  },
];

export const reviews = [
  {
    name: "Priya Mehta",
    event: "Wedding · Ahmedabad",
    text: "Best bridal look I could have asked for. The airbrush base held up through a 14-hour day and every photo came out flawless.",
  },
  {
    name: "Aisha Khan",
    event: "Reception · Gandhinagar",
    text: "Booked directly on WhatsApp, got a quote in ten minutes. Dharti understood my brief instantly and the hair styling was stunning.",
  },
  {
    name: "Nidhi Shah",
    event: "Sangeet · Baroda",
    text: "She did makeup for me and six family members and still finished ahead of schedule. Calm, professional and genuinely talented.",
  },
  {
    name: "Rutvi Patel",
    event: "Engagement · Ahmedabad",
    text: "I have very sensitive skin and nothing irritated it. The trial made me feel completely relaxed about the big day.",
  },
];

export const videos = [
  { title: "Full bridal transformation — Ahmedabad", length: "3:42", thumb: gallery4 },
  { title: "Airbrush base routine for humid weather", length: "2:15", thumb: gallery5 },
  { title: "Sangeet glam in 45 minutes", length: "4:08", thumb: gallery6 },
];
