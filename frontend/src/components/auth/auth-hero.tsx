import { Link } from "@tanstack/react-router";
import { Users, Briefcase, Star, TrendingUp, Search, CheckCircle2 } from "lucide-react";

export function GoogleGIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.27 21.39 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.61 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm0 18.15c-1.49 0-2.96-.4-4.25-1.16l-.3-.18-3.15.83.84-3.07-.2-.31a8.19 8.19 0 01-1.26-4.35c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 012.41 5.83c.02 4.54-3.68 8.23-8.15 8.23zm4.51-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29z" />
    </svg>
  );
}

interface AuthHeroProps {
  variant: "login" | "signup";
}

export function AuthHero({ variant }: AuthHeroProps) {
  const isLogin = variant === "login";

  return (
    <div className="flex flex-col justify-between h-full space-y-8 select-none">
      {/* Top Logo / Branding */}
      <Link to="/" className="inline-flex items-center gap-3 group focus:outline-none w-fit">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#7c3aed] to-[#a855f7] flex items-center justify-center text-white shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform">
          <span className="font-extrabold text-2xl font-serif tracking-tight">B</span>
        </div>
        <div>
          <div className="font-extrabold text-xl text-slate-900 tracking-tight leading-none">
            Beauty<span className="text-[#8b5cf6]">Folio</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium tracking-tight mt-1">
            Beauty Professionals. Found by Clients.
          </div>
        </div>
      </Link>

      {/* Main Hero Section: Headline + Features on Left & Visual on Right */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Left Side: Headline & Features */}
        <div className="md:col-span-6 space-y-6">
          {/* Headline */}
          {isLogin ? (
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.14]">
                Your Beauty <br />
                Business, <br />
                <span className="text-[#8b5cf6] bg-gradient-to-r from-[#8b5cf6] via-[#7c3aed] to-[#6d28d9] bg-clip-text text-transparent">
                  More Visible
                </span>{" "}
                <br />
                on Google
              </h1>
              <p className="text-slate-600 text-sm sm:text-base mt-4 leading-relaxed font-normal">
                Manage your portfolio, showcase your services and get real client inquiries — all in one place.
              </p>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.14]">
                Create Your <br />
                <span className="text-[#8b5cf6] bg-gradient-to-r from-[#8b5cf6] via-[#7c3aed] to-[#6d28d9] bg-clip-text text-transparent">
                  Beauty Portfolio
                </span>{" "}
                <br />
                in Minutes
              </h1>
              <p className="text-slate-600 text-sm sm:text-base mt-4 leading-relaxed font-normal">
                Join BeautyFolio and showcase your services, get found on Google, and receive more client inquiries.
              </p>
            </div>
          )}

          {/* 4 Feature Items */}
          <div className="space-y-3.5 pt-2">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 shrink-0 shadow-sm border border-rose-100">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm leading-snug">Get more clients</div>
                <div className="text-xs text-slate-500">Be visible on Google searches</div>
              </div>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0 shadow-sm border border-purple-100">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm leading-snug">Professional portfolio</div>
                <div className="text-xs text-slate-500">Showcase your work and services</div>
              </div>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 shrink-0 shadow-sm border border-amber-100">
                <Star className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm leading-snug">Build your brand</div>
                <div className="text-xs text-slate-500">Gain trust with reviews and ratings</div>
              </div>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 shrink-0 shadow-sm border border-emerald-100">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm leading-snug">Grow your business</div>
                <div className="text-xs text-slate-500">Receive enquiries directly</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side of Hero: Center Mockup / Visual Card */}
        <div className="md:col-span-6 relative flex flex-col items-center justify-center pt-2">
          {/* Soft purple radial aura background */}
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-72 h-80 bg-purple-200/50 rounded-full blur-3xl -z-10 pointer-events-none" />

          {/* Bride Photo Container */}
          <div className="relative w-full max-w-[340px] flex flex-col items-center">
            {/* Elegant Handwritten Callout */}
            <div className="absolute -top-4 right-0 sm:-right-4 z-10 text-right rotate-3 pointer-events-none">
              <span className="font-serif italic font-bold text-[#7c3aed] text-xs sm:text-sm drop-shadow-sm whitespace-nowrap block">
                Turn ♡
              </span>
              <span className="font-serif italic font-bold text-[#7c3aed] text-xs sm:text-sm drop-shadow-sm whitespace-nowrap block">
                Your Passion
              </span>
              <span className="font-serif italic font-semibold text-[#8b5cf6] text-xs drop-shadow-sm whitespace-nowrap block">
                into Opportunities
              </span>
              {/* Decorative curved arrow */}
              <svg
                viewBox="0 0 50 30"
                className="w-8 h-6 text-[#8b5cf6] ml-auto -mt-1 -scale-x-100"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 5 C 20 2, 40 10, 42 24" />
                <path d="M37 20 L 42 24 L 46 19" />
              </svg>
            </div>

            {/* Bride Portrait with organic pill/arch shape */}
            <div className="w-48 h-56 sm:w-56 sm:h-64 rounded-t-full rounded-b-[40px] overflow-hidden shadow-2xl border-4 border-white/90 bg-gradient-to-b from-purple-100 to-purple-200">
              <img
                src="/auth-hero-bride.jpg"
                alt="Bridal Makeup BeautyFolio"
                className="w-full h-full object-cover object-top hover:scale-105 transition-transform duration-500"
                onError={(e) => {
                  // Fallback if needed
                  (e.currentTarget as HTMLImageElement).src = "/demo/dharti-portrait.jpg";
                }}
              />
            </div>

            {/* Floating Google Search Bar */}
            <div className="-mt-7 z-20 w-full max-w-[280px] bg-white/95 backdrop-blur-md rounded-full px-3.5 py-2 shadow-lg shadow-purple-900/10 border border-slate-200/80 flex items-center gap-2">
              <GoogleGIcon className="w-4 h-4 shrink-0" />
              <span className="text-[11px] sm:text-xs font-medium text-slate-800 truncate flex-1">
                Bridal makeup artist in Ahmedabad
              </span>
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>

            {/* Floating Google Result Card (Riya Sharma) */}
            <div className="mt-3.5 w-full bg-white rounded-2xl shadow-xl shadow-purple-950/10 border border-slate-100 p-3 sm:p-3.5 z-20">
              <div className="flex items-center gap-3">
                <img
                  src="/demo/dharti-portrait.jpg"
                  alt="Riya Sharma"
                  className="w-12 h-14 rounded-lg object-cover border border-slate-100 shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/auth-hero-bride.jpg";
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">Riya Sharma</span>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-semibold">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Verified
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    Bridal Makeup Artist • Ahmedabad
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="flex text-amber-400 text-xs">★★★★★</div>
                    <span className="text-[10px] font-semibold text-slate-700">4.8</span>
                    <span className="text-[10px] text-slate-400">(120 reviews)</span>
                  </div>
                </div>
              </div>

              {/* Portfolio thumbnails with tags */}
              <div className="grid grid-cols-3 gap-1.5 mt-3">
                <div className="relative rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                  <img
                    src="/demo/gallery-1.jpg"
                    alt="Bridal Makeup"
                    className="w-full h-14 object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/auth-hero-bride.jpg";
                    }}
                  />
                  <div className="p-1 bg-white/95 text-center">
                    <span className="text-[9px] font-medium text-slate-700 block truncate">
                      Bridal Makeup
                    </span>
                  </div>
                </div>

                <div className="relative rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                  <img
                    src="/demo/gallery-2.jpg"
                    alt="Party Makeup"
                    className="w-full h-14 object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/auth-hero-bride.jpg";
                    }}
                  />
                  <div className="p-1 bg-white/95 text-center">
                    <span className="text-[9px] font-medium text-slate-700 block truncate">
                      Party Makeup
                    </span>
                  </div>
                </div>

                <div className="relative rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                  <img
                    src="/demo/gallery-3.jpg"
                    alt="Engagement Makeup"
                    className="w-full h-14 object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/auth-hero-bride.jpg";
                    }}
                  />
                  <div className="p-1 bg-white/95 text-center">
                    <span className="text-[9px] font-medium text-slate-700 block truncate">
                      Engagement
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Stats Row */}
      <div className="flex items-center gap-6 sm:gap-12 pt-6 border-t border-slate-200/70">
        <div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">10K+</div>
          <div className="text-[11px] sm:text-xs text-slate-500 font-medium">Beauty Professionals</div>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">50K+</div>
          <div className="text-[11px] sm:text-xs text-slate-500 font-medium">Monthly Searches</div>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">5K+</div>
          <div className="text-[11px] sm:text-xs text-slate-500 font-medium">Client Inquiries</div>
        </div>
      </div>
    </div>
  );
}
