import { Link } from "@tanstack/react-router";
import { Users, Briefcase, Star, TrendingUp } from "lucide-react";
import { Logo } from "@/components/site/logo";

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
    <div className="flex flex-col justify-between h-full space-y-6 sm:space-y-8 select-none">
      {/* Top Logo / Original Branding */}
      <Link to="/" className="inline-flex flex-col gap-1 focus:outline-none w-fit group">
        <Logo size="md" />
        <span className="text-[11px] text-slate-500 font-medium tracking-tight">
          Beauty Professionals. Found by Clients.
        </span>
      </Link>

      {/* Main Hero: Headline + 4 Features on Left, and Exact Visual Mockup on Right */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Left Side: Headline & Features */}
        <div className="md:col-span-6 space-y-6">
          {/* Headline */}
          {isLogin ? (
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.14]">
                Your Beauty <br />
                Business, <br />
                <span className="text-pink-600 bg-gradient-to-r from-pink-500 via-pink-600 to-rose-600 bg-clip-text text-transparent">
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
                <span className="text-pink-600 bg-gradient-to-r from-pink-500 via-pink-600 to-rose-600 bg-clip-text text-transparent">
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
              <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center text-pink-600 shrink-0 shadow-sm border border-pink-100">
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

        {/* Right Side: Exact Visual Mockup from Image */}
        <div className="md:col-span-6 relative flex items-center justify-center">
          <div className="relative w-full max-w-[340px] sm:max-w-[380px] flex items-center justify-center">
            {/* Exact artwork from design mockup */}
            <img
              src="/auth-hero-visual.png"
              alt="BeautyFolio on Google"
              className="w-full h-auto object-contain drop-shadow-md select-none pointer-events-none rounded-3xl"
            />
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
