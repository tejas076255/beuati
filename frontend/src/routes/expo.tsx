import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export const Route = createFileRoute("/expo")({
  head: () => ({
    // Expo sign-up is a short-lived booth/event page — never indexed.
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: ExpoSignupPage,
});

// ─── Server function — provision portfolio after account creation ─────────────
const ensurePortfolioFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureOwnPortfolio } = await import("@/data/dashboard/provisioning.server");
    return ensureOwnPortfolio(context.supabase, context.userId);
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize to E.164 format — defaults to +91 (India) when no country code. */
function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return `+91${digits}`;
}

// ─── Step schemas ─────────────────────────────────────────────────────────────

const phoneSchema = z.object({
  phone: z
    .string()
    .min(10, "Enter a valid phone number")
    .refine(
      (v) => /^\d{10,15}$/.test(v.replace(/\D/g, "")),
      "Enter a valid phone number",
    ),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters"),
});

const otpSchema = z.object({
  otp: z.string().length(6, "Enter the 6-digit code"),
});

const profileSchema = z.object({
  display_name: z.string().min(1, "Enter your full name"),
  salon_name: z.string().optional(),
  city: z.string().optional(),
});

// ─── Step indicators ─────────────────────────────────────────────────────────

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Phone", "Verify", "Details"];
  return (
    <ol className="flex items-center gap-1 text-xs text-muted-foreground mb-1" aria-label="Sign-up steps">
      {steps.map((label, i) => {
        const num = (i + 1) as 1 | 2 | 3;
        const done = num < current;
        const active = num === current;
        return (
          <li key={label} className="flex items-center gap-1">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {done ? "✓" : num}
            </span>
            <span className={active ? "font-medium text-foreground" : ""}>{label}</span>
            {i < steps.length - 1 && <span className="mx-0.5">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

type Step = "phone" | "otp" | "details" | "done";

function ExpoSignupPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<Step>("phone");
  const [pendingPhone, setPendingPhone] = useState(""); // E.164
  const [formError, setFormError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Auto-redirect if already logged in — same pattern as login.tsx
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/dashboard/profile" });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  // ── Step 1: phone + password ───────────────────────────────────────────────
  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "", password: "" },
  });

  const onPhoneSubmit = async (values: z.infer<typeof phoneSchema>) => {
    setFormError(null);
    const phone = toE164(values.phone);

    // signUp with phone sends an OTP; the password is set at this point so the
    // resulting account supports phone+password login (no passwordless required).
    const { error } = await supabase.auth.signUp({ phone, password: values.password });
    if (error) {
      setFormError(error.message);
      return;
    }

    setPendingPhone(phone);
    setStep("otp");
    startResendCooldown();
  };

  // ── Step 2: OTP verification ───────────────────────────────────────────────
  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  });

  const onOtpSubmit = async (values: z.infer<typeof otpSchema>) => {
    setFormError(null);
    const { error } = await supabase.auth.verifyOtp({
      phone: pendingPhone,
      token: values.otp,
      type: "sms",
    });
    if (error) {
      setFormError(error.message);
      return;
    }
    setStep("details");
  };

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setFormError(null);
    const { error } = await supabase.auth.resend({ type: "sms", phone: pendingPhone });
    if (error) { setFormError(error.message); return; }
    startResendCooldown();
  };

  function startResendCooldown() {
    setResendCooldown(30);
    const id = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { clearInterval(id); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  // ── Step 3: name / salon / city ────────────────────────────────────────────
  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { display_name: "", salon_name: "", city: "" },
  });

  const onProfileSubmit = async (values: z.infer<typeof profileSchema>) => {
    setFormError(null);

    // Store name + salon metadata on the Supabase Auth user. The profiles
    // trigger will pick up display_name automatically; salon_name / city are
    // stored in user_metadata for the profile builder to prefill later.
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        display_name: values.display_name,
        salon_name: values.salon_name || undefined,
        city: values.city || undefined,
      },
    });
    if (updateError) { setFormError(updateError.message); return; }

    // Provision the beautician_profiles draft row (same as the regular signup).
    try {
      await ensurePortfolioFn();
    } catch (err) {
      // Non-fatal — dashboard layout will retry.
      console.error("[expo] portfolio provisioning failed", err);
    }

    setStep("done");
    // Small pause so the user sees the success state, then navigate.
    setTimeout(() => navigate({ to: "/dashboard/profile" }), 1800);
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* ── Left brand panel (desktop only) ─────────────────────────────── */}
      <div className="bg-gradient-brand relative hidden flex-col justify-between overflow-hidden p-10 text-primary-foreground lg:flex lg:w-2/5">
        {/* Background decoration */}
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle at 70% 20%, white 0%, transparent 55%), radial-gradient(circle at 20% 80%, white 0%, transparent 50%)",
          }}
        />

        {/* Top: logo */}
        <div className="relative">
          <span className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              BeautyFolio
            </span>
          </span>
        </div>

        {/* Middle: value prop */}
        <div className="relative space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
              For beauty professionals
            </p>
            <h1 className="font-display mt-3 text-3xl font-semibold leading-tight text-white">
              Your portfolio.<br />Your clients.<br />Your growth.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/80">
              Sign up in 30 seconds — get a free SEO portfolio that ranks on Google and brings direct client enquiries.
            </p>
          </div>

          {/* Social proof pills */}
          <div className="flex flex-wrap gap-2">
            {["Free to start", "No tech skills needed", "Go live in minutes"].map((pill) => (
              <span
                key={pill}
                className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white"
              >
                ✓ {pill}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom: tagline */}
        <p className="relative text-xs text-white/50">
          BeautyFolio · Digital Growth for Indian Beauty Professionals
        </p>
      </div>

      {/* ── Right: form panel ────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        {/* Mobile-only logo */}
        <div className="mb-6 lg:hidden">
          <Logo />
        </div>

        <div className="w-full max-w-sm">
          {/* Step title + description */}
          <div className="mb-6">
            <h2 className="font-display text-2xl font-semibold text-foreground">
              {step === "phone" && "Create your free account"}
              {step === "otp" && "Enter verification code"}
              {step === "details" && "A bit about you"}
              {step === "done" && "You're in! 🎉"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "phone" && "Phone number, password — done in seconds."}
              {step === "otp" && `We sent a 6-digit code to ${pendingPhone}.`}
              {step === "details" && "Optional — you can fill these in your dashboard too."}
              {step === "done" && "Taking you to your portfolio builder…"}
            </p>
          </div>

          {/* Step indicator */}
          {step !== "done" && (
            <div className="mb-5">
              <Steps current={step === "phone" ? 1 : step === "otp" ? 2 : 3} />
            </div>
          )}

          {/* ── Step 1 ── */}
          {step === "phone" && (
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone number</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <span className="flex h-9 shrink-0 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                            +91
                          </span>
                          <Input
                            type="tel"
                            placeholder="9876543210"
                            autoComplete="tel-national"
                            inputMode="numeric"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={phoneForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <PasswordInput autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError && (
                  <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>
                )}
                <Button
                  type="submit"
                  variant="hero"
                  className="w-full"
                  disabled={phoneForm.formState.isSubmitting}
                >
                  {phoneForm.formState.isSubmitting ? "Sending code…" : "Send verification code"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  By signing up you agree to the{" "}
                  <Link to="/terms" className="font-medium text-primary underline">Terms</Link>
                  {" "}and{" "}
                  <Link to="/privacy" className="font-medium text-primary underline">Privacy Policy</Link>.
                </p>
              </form>
            </Form>
          )}

          {/* ── Step 2 ── */}
          {step === "otp" && (
            <Form {...otpForm}>
              <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
                <FormField
                  control={otpForm.control}
                  name="otp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification code</FormLabel>
                      <FormControl>
                        <InputOTP
                          maxLength={6}
                          value={field.value}
                          onChange={field.onChange}
                          inputMode="numeric"
                        >
                          <InputOTPGroup>
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                              <InputOTPSlot key={i} index={i} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError && (
                  <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>
                )}
                <Button
                  type="submit"
                  variant="hero"
                  className="w-full"
                  disabled={otpForm.formState.isSubmitting}
                >
                  {otpForm.formState.isSubmitting ? "Verifying…" : "Verify & continue"}
                </Button>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => { setStep("phone"); setFormError(null); otpForm.reset(); }}
                    className="hover:text-foreground"
                  >
                    ← Change number
                  </button>
                  <button
                    type="button"
                    onClick={resendOtp}
                    disabled={resendCooldown > 0}
                    className="disabled:opacity-50 hover:text-foreground"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            </Form>
          )}

          {/* ── Step 3 ── */}
          {step === "details" && (
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                <FormField
                  control={profileForm.control}
                  name="display_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your full name</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" placeholder="Priya Sharma" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="salon_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Salon / studio name{" "}
                        <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input autoComplete="organization" placeholder="Glamour Studio" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        City{" "}
                        <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input autoComplete="address-level2" placeholder="Mumbai" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError && (
                  <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={profileForm.formState.isSubmitting}
                    onClick={async () => {
                      await onProfileSubmit({
                        display_name: profileForm.getValues("display_name") || "Beautician",
                        salon_name: profileForm.getValues("salon_name") || "",
                        city: profileForm.getValues("city") || "",
                      });
                    }}
                  >
                    Skip for now
                  </Button>
                  <Button
                    type="submit"
                    variant="hero"
                    className="flex-1"
                    disabled={profileForm.formState.isSubmitting}
                  >
                    {profileForm.formState.isSubmitting ? "Setting up…" : "Finish"}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div className="py-6 text-center">
              <div className="mb-4 text-5xl">✨</div>
              <p className="text-sm text-muted-foreground">
                Your BeautyFolio account is ready. Redirecting to your profile builder…
              </p>
            </div>
          )}

          {/* Sign-in link — only on first step */}
          {step === "phone" && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-primary">Sign in</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
