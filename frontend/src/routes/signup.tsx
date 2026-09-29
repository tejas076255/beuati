import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Phone, Lock, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AuthHero, WhatsAppIcon } from "@/components/auth/auth-hero";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: SignupPage,
});

const ensurePortfolioFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { whatsapp_number?: string }) => data)
  .handler(async ({ context, data }) => {
    const { ensureOwnPortfolio } = await import("@/data/dashboard/provisioning.server");
    const result = await ensureOwnPortfolio(context.supabase, context.userId, "Direct");
    if (data?.whatsapp_number && result.profile) {
      try {
        await context.supabase
          .from("beautician_profiles")
          .update({ whatsapp_number: data.whatsapp_number })
          .eq("id", result.profile.id);
      } catch (err) {
        console.error("[signup] failed to save whatsapp_number", err);
      }
    }
    return result;
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize phone to digits-only E.164 format (prefix +91 if no country code). */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s/g, "");
  return `+91${trimmed.replace(/\D/g, "")}`;
}

/**
 * Supabase requires an email for password-based auth. We derive a stable,
 * deterministic fake email from the normalized phone number so the user never
 * has to enter one.
 */
function phoneToFakeEmail(normalizedPhone: string): string {
  const digits = normalizedPhone.replace(/^\+/, "");
  return `${digits}@beuati.app`;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const signupSchema = z.object({
  display_name: z.string().min(1, "Enter your full name"),
  phone: z
    .string()
    .min(10, "Enter a valid phone number")
    .regex(/^[0-9+\s\-()]+$/, "Enter a valid phone number"),
  whatsapp: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[0-9+\s\-()]{10,}$/.test(val),
      "Enter a valid 10-digit phone number",
    ),
  password: z.string().min(6, "Minimum 6 characters"),
});

type SignupValues = z.infer<typeof signupSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

function SignupPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicatePhone, setDuplicatePhone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { display_name: "", phone: "", whatsapp: "", password: "" },
  });

  const onSubmit = async (values: SignupValues) => {
    setFormError(null);
    setDuplicatePhone(false);

    const phone = normalizePhone(values.phone);
    const whatsapp = values.whatsapp?.trim() ? normalizePhone(values.whatsapp) : phone;
    const email = phoneToFakeEmail(phone);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: values.password,
      options: {
        data: {
          display_name: values.display_name,
          phone,
          whatsapp_number: whatsapp,
        },
      },
    });

    if (error) {
      if (error.code === "user_already_exists") {
        setDuplicatePhone(true);
        return;
      }
      setFormError(error.message);
      return;
    }

    if (data.session) {
      try {
        await ensurePortfolioFn({ data: { whatsapp_number: whatsapp } });
      } catch (e) {
        console.error("[signup] portfolio provisioning failed", e);
      }
      navigate({ to: "/onboarding" });
    }
  };

  const handleCopyPhoneToWhatsapp = () => {
    const currentPhone = form.getValues("phone");
    if (currentPhone) {
      form.setValue("whatsapp", currentPhone, { shouldValidate: true });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fcfbfe] via-[#faf8fd] to-[#fdf2f8] flex items-center justify-center p-4 sm:p-6 lg:p-10 relative overflow-hidden">
      {/* Background soft ambient glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-pink-200/25 rounded-full blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[450px] h-[450px] bg-rose-200/20 rounded-full blur-[100px] -z-10 pointer-events-none" />

      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
        {/* Left Hero Column */}
        <div className="lg:col-span-7 xl:col-span-7">
          <AuthHero variant="signup" />
        </div>

        {/* Right Form Card Column */}
        <div className="lg:col-span-5 xl:col-span-5 flex justify-center lg:justify-end">
          <div className="w-full max-w-[480px] bg-white rounded-3xl shadow-2xl shadow-pink-950/5 border border-slate-100 p-8 sm:p-10">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Create your account
                </h2>
                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-400 block leading-tight">Already have an account?</span>
                  <Link
                    to="/login"
                    className="text-xs sm:text-sm font-bold text-pink-600 hover:text-pink-700 hover:underline"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Sign up to manage your portfolio and start receiving client inquiries.
              </p>
            </div>

            {duplicatePhone ? (
              <div className="space-y-4 p-5 rounded-2xl bg-pink-50/60 border border-pink-100 text-center">
                <p role="status" className="text-sm font-medium text-slate-700">
                  An account with this phone number already exists.
                </p>
                <div className="flex flex-col gap-2 pt-1 text-sm font-semibold">
                  <Link
                    to="/login"
                    className="h-11 rounded-xl bg-pink-600 hover:bg-pink-700 text-white flex items-center justify-center shadow-md transition-colors"
                  >
                    Sign in instead
                  </Link>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-pink-600 hover:underline pt-1"
                  >
                    Forgot your password? Reset it
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1">
                    Full name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder="Enter your full name"
                      {...form.register("display_name")}
                      className="w-full pl-10 pr-4 h-11 bg-slate-50/70 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500 transition-all"
                    />
                  </div>
                  {form.formState.errors.display_name && (
                    <p className="text-xs text-rose-500 font-medium mt-1">
                      {form.formState.errors.display_name.message}
                    </p>
                  )}
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1">
                    Phone number <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 h-11 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 shrink-0 select-none">
                      <span className="text-sm">🇮🇳</span>
                      <span>+91</span>
                      <span className="text-slate-400 text-xs">▾</span>
                    </div>
                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        autoComplete="tel"
                        placeholder="98765 43210"
                        {...form.register("phone")}
                        className="w-full pl-10 pr-4 h-11 bg-slate-50/70 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500 transition-all"
                      />
                    </div>
                  </div>
                  {form.formState.errors.phone && (
                    <p className="text-xs text-rose-500 font-medium mt-1">
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                </div>

                {/* WhatsApp Number */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-800">
                      WhatsApp number
                    </label>
                    <button
                      type="button"
                      onClick={handleCopyPhoneToWhatsapp}
                      className="text-[11px] font-semibold text-pink-600 hover:underline cursor-pointer"
                    >
                      Same as phone
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 h-11 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 shrink-0 select-none">
                      <span className="text-sm">🇮🇳</span>
                      <span>+91</span>
                      <span className="text-slate-400 text-xs">▾</span>
                    </div>
                    <div className="relative flex-1">
                      <WhatsAppIcon className="w-4 h-4 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        placeholder="98765 43210"
                        {...form.register("whatsapp")}
                        className="w-full pl-10 pr-4 h-11 bg-slate-50/70 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500 transition-all"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    (Same as phone number if applicable)
                  </p>
                  {form.formState.errors.whatsapp && (
                    <p className="text-xs text-rose-500 font-medium mt-1">
                      {form.formState.errors.whatsapp.message}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1">
                    Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Create a password"
                      {...form.register("password")}
                      className="w-full pl-10 pr-11 h-11 bg-slate-50/70 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Minimum 6 characters</p>
                  {form.formState.errors.password && (
                    <p className="text-xs text-rose-500 font-medium mt-1">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                {/* Form Error */}
                {formError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-600 text-xs font-medium"
                  >
                    {formError}
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-pink-500 via-pink-600 to-pink-700 hover:from-pink-600 hover:to-pink-800 text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer mt-2"
                >
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating account…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign up</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>

                {/* Disclaimer */}
                <p className="text-center text-[11px] leading-relaxed text-slate-500 pt-1">
                  By creating an account, you agree to the{" "}
                  <Link to="/terms" className="font-semibold text-pink-600 hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and acknowledge the{" "}
                  <Link to="/privacy" className="font-semibold text-pink-600 hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );

}
