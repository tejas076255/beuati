import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Lock, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AuthHero } from "@/components/auth/auth-hero";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: LoginPage,
});

// ─── Helpers (must match signup.tsx exactly) ──────────────────────────────────

/** Normalize phone to E.164 — prefix +91 if no country code. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s/g, "");
  return `+91${trimmed.replace(/\D/g, "")}`;
}

/**
 * Reconstruct the same deterministic fake email that signup.tsx created.
 * Must stay byte-for-byte identical to the signup helper.
 */
function phoneToFakeEmail(normalizedPhone: string): string {
  const digits = normalizedPhone.replace(/^\+/, "");
  return `${digits}@beuati.app`;
}

// ─── Post-login redirect ──────────────────────────────────────────────────────

async function getPostLoginRedirect(): Promise<string> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "/dashboard";

    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (adminRole) return "/admin";

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!profile) return "/dashboard";

    const { data: bp } = await supabase
      .from("beautician_profiles")
      .select("status, professional_title")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (!bp) return "/dashboard";
    if (bp.status === "draft") return "/dashboard/profile";
    return "/dashboard";
  } catch {
    return "/dashboard";
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  phoneOrEmail: z
    .string()
    .min(3, "Enter your phone number or email")
    .refine((val) => {
      const trimmed = val.trim();
      if (trimmed.includes("@")) {
        return z.string().email().safeParse(trimmed).success;
      }
      return /^[0-9+\s\-()]{10,}$/.test(trimmed);
    }, "Enter a valid phone number or email address"),
  password: z.string().min(1, "Password required"),
});

type LoginValues = z.infer<typeof loginSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

function LoginPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Auto-redirect if already logged in.
  useEffect(() => {
    const timeout = setTimeout(() => setChecking(false), 5000);

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        clearTimeout(timeout);
        if (data.session) {
          const to = await getPostLoginRedirect();
          navigate({ to });
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        setChecking(false);
      });

    return () => clearTimeout(timeout);
  }, [navigate]);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phoneOrEmail: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);

    const input = values.phoneOrEmail.trim();
    let email = "";

    if (input.includes("@")) {
      email = input.toLowerCase();
    } else {
      const phone = normalizePhone(input);
      email = phoneToFakeEmail(phone);
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: values.password,
    });

    if (error) {
      setFormError("Invalid phone number, email, or password.");
      return;
    }

    const to = await getPostLoginRedirect();
    navigate({ to });
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9fc] text-sm text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-[#8b5cf6]" />
        Checking session…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fcfbfe] via-[#faf8fd] to-[#f4effc] flex items-center justify-center p-4 sm:p-6 lg:p-10 relative overflow-hidden">
      {/* Background soft ambient glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-200/25 rounded-full blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[450px] h-[450px] bg-purple-300/20 rounded-full blur-[100px] -z-10 pointer-events-none" />

      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
        {/* Left Hero Column */}
        <div className="lg:col-span-7 xl:col-span-7">
          <AuthHero variant="login" />
        </div>

        {/* Right Form Card Column */}
        <div className="lg:col-span-5 xl:col-span-5 flex justify-center lg:justify-end">
          <div className="w-full max-w-[460px] bg-white rounded-3xl shadow-2xl shadow-purple-950/5 border border-slate-100 p-8 sm:p-10">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Welcome back
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Log in to your BeautyFolio account.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Phone or Email */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Phone number or Email
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    autoComplete="username"
                    placeholder="Enter your phone number or email"
                    {...form.register("phoneOrEmail")}
                    className="w-full pl-10 pr-4 h-12 bg-slate-50/70 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/30 focus:border-[#8b5cf6] transition-all"
                  />
                </div>
                {form.formState.errors.phoneOrEmail && (
                  <p className="text-xs text-rose-500 font-medium mt-1">
                    {form.formState.errors.phoneOrEmail.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    {...form.register("password")}
                    className="w-full pl-10 pr-11 h-12 bg-slate-50/70 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/30 focus:border-[#8b5cf6] transition-all"
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

                <div className="flex justify-end mt-2">
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-[#8b5cf6] hover:text-[#7c3aed] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

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
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] hover:from-[#7c3aed] hover:to-[#6d28d9] text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <span>Log in</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>

              {/* Footer Switch */}
              <div className="text-center pt-2">
                <span className="text-sm text-slate-500">Don&apos;t have an account? </span>
                <Link
                  to="/signup"
                  className="text-sm font-semibold text-[#8b5cf6] hover:text-[#7c3aed] hover:underline"
                >
                  Sign up
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
