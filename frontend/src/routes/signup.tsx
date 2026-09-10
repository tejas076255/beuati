import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: SignupPage,
});

const ensurePortfolioFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureOwnPortfolio } = await import("@/data/dashboard/provisioning.server");
    return ensureOwnPortfolio(context.supabase, context.userId);
  });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const signupSchema = z.object({
  display_name: z.string().min(1, "Enter your full name"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const otpSchema = z.object({
  otp: z.string().length(6, "Enter the 6-digit code"),
});

// ─── Component ────────────────────────────────────────────────────────────────

function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // ── Signup form ───────────────────────────────────────────────────────────
  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { display_name: "", email: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof signupSchema>) => {
    setFormError(null);
    setDuplicateEmail(false);

    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { display_name: values.display_name },
        // emailRedirectTo not needed — OTP flow handles verification inline
      },
    });

    if (error) {
      if (error.code === "user_already_exists") { setDuplicateEmail(true); return; }
      setFormError(error.message);
      return;
    }

    // Supabase sends a 6-digit OTP to the email when "Email OTP" is enabled.
    // Show the OTP entry screen.
    setPendingEmail(values.email);
    setStep("otp");
    startResendCooldown();
  };

  // ── OTP form ──────────────────────────────────────────────────────────────
  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  });

  const onOtpSubmit = async (values: z.infer<typeof otpSchema>) => {
    setFormError(null);
    const { data, error } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: values.otp,
      type: "signup",
    });
    if (error) { setFormError(error.message); return; }
    if (data.session) {
      try { await ensurePortfolioFn(); } catch (e) {
        console.error("[signup] portfolio provisioning failed", e);
      }
      navigate({ to: "/dashboard/profile" });
    }
  };

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setFormError(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
    });
    if (error) { setFormError(error.message); return; }
    startResendCooldown();
  };

  function startResendCooldown() {
    setResendCooldown(30);
    const id = setInterval(() => {
      setResendCooldown((c) => { if (c <= 1) { clearInterval(id); return 0; } return c - 1; });
    }, 1000);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            {step === "otp" ? "Check your email" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {step === "otp"
              ? `We sent a 6-digit code to ${pendingEmail}.`
              : "Sign up to manage your portfolio leads."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ── OTP step ── */}
          {step === "otp" && (
            <Form {...otpForm}>
              <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
                <FormField control={otpForm.control} name="otp" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification code</FormLabel>
                    <FormControl>
                      <InputOTP maxLength={6} value={field.value} onChange={field.onChange} inputMode="numeric">
                        <InputOTPGroup>
                          {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
                        </InputOTPGroup>
                      </InputOTP>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                {formError && (
                  <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>
                )}
                <Button type="submit" variant="hero" className="w-full" disabled={otpForm.formState.isSubmitting}>
                  {otpForm.formState.isSubmitting ? "Verifying…" : "Verify & go to dashboard"}
                </Button>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => { setStep("form"); setFormError(null); otpForm.reset(); }}
                    className="hover:text-foreground"
                  >
                    ← Change email
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

          {/* ── Duplicate email ── */}
          {step === "form" && duplicateEmail && (
            <div className="space-y-3">
              <p role="status" className="text-sm text-muted-foreground">
                It looks like you already have an account with this email.
              </p>
              <div className="flex flex-col gap-1 text-sm">
                <Link to="/login" className="font-semibold text-primary">Sign in instead</Link>
                <Link to="/forgot-password" className="font-semibold text-primary">Forgot your password? Reset it</Link>
              </div>
            </div>
          )}

          {/* ── Main signup form ── */}
          {step === "form" && !duplicateEmail && (
            <>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="display_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <PasswordInput autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {formError && (
                    <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>
                  )}

                  <Button type="submit" variant="hero" className="w-full" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Creating account…" : "Sign up"}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    By creating an account, you agree to the{" "}
                    <Link to="/terms" className="font-medium text-primary underline">Terms of Service</Link>{" "}
                    and acknowledge the{" "}
                    <Link to="/privacy" className="font-medium text-primary underline">Privacy Policy</Link>.
                  </p>
                </form>
              </Form>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-primary">Sign in</Link>
              </p>
            </>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
