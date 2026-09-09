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

const emailSchema = z.object({
  display_name: z.string().min(1, "Enter your full name"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const phoneSchema = z.object({
  display_name: z.string().min(1, "Enter your full name"),
  phone: z.string().min(10, "Enter a valid phone number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const otpSchema = z.object({
  otp: z.string().length(6, "Enter the 6-digit code"),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return `+91${digits}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

function SignupPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"email" | "phone">("email");

  // Email flow states
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState(false);

  // Phone flow states
  const [phoneStep, setPhoneStep] = useState<"form" | "otp">("form");
  const [pendingPhone, setPendingPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // ── Email form ────────────────────────────────────────────────────────────
  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { display_name: "", email: "", password: "" },
  });

  const onEmailSubmit = async (values: z.infer<typeof emailSchema>) => {
    setFormError(null);
    setDuplicateEmail(false);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { display_name: values.display_name } },
    });
    if (error) {
      if (error.code === "user_already_exists") { setDuplicateEmail(true); return; }
      setFormError(error.message);
      return;
    }
    if (data.session) {
      try { await ensurePortfolioFn(); } catch (e) {
        console.error("[signup] portfolio provisioning failed", e);
      }
      navigate({ to: "/dashboard/profile" });
      return;
    }
    setConfirmationSent(true);
  };

  // ── Phone form ────────────────────────────────────────────────────────────
  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { display_name: "", phone: "", password: "" },
  });

  const onPhoneSubmit = async (values: z.infer<typeof phoneSchema>) => {
    setPhoneError(null);
    const phone = toE164(values.phone);
    const { error } = await supabase.auth.signUp({
      phone,
      password: values.password,
      options: { data: { display_name: values.display_name } },
    });
    if (error) { setPhoneError(error.message); return; }
    setPendingPhone(phone);
    setPhoneStep("otp");
    startResendCooldown();
  };

  // ── OTP form ──────────────────────────────────────────────────────────────
  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  });

  const onOtpSubmit = async (values: z.infer<typeof otpSchema>) => {
    setPhoneError(null);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: pendingPhone,
      token: values.otp,
      type: "sms",
    });
    if (error) { setPhoneError(error.message); return; }
    if (data.session) {
      try { await ensurePortfolioFn(); } catch (e) {
        console.error("[signup] portfolio provisioning failed", e);
      }
      navigate({ to: "/dashboard/profile" });
    }
  };

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setPhoneError(null);
    const { error } = await supabase.auth.resend({ type: "sms", phone: pendingPhone });
    if (error) { setPhoneError(error.message); return; }
    startResendCooldown();
  };

  function startResendCooldown() {
    setResendCooldown(30);
    const id = setInterval(() => {
      setResendCooldown((c) => { if (c <= 1) { clearInterval(id); return 0; } return c - 1; });
    }, 1000);
  }

  const switchMode = (m: "email" | "phone") => {
    setMode(m);
    setFormError(null);
    setPhoneError(null);
    setConfirmationSent(false);
    setDuplicateEmail(false);
    setPhoneStep("form");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Sign up to manage your portfolio leads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ── Mode toggle (only when not in post-submit states) ── */}
          {!confirmationSent && !duplicateEmail && (
            <div className="flex rounded-lg border border-border bg-muted p-1">
              {(["email", "phone"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
                    mode === m ? "bg-background shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {m === "email" ? "Email" : "Phone"}
                </button>
              ))}
            </div>
          )}

          {/* ══ EMAIL MODE ══ */}
          {mode === "email" && (
            <>
              {duplicateEmail ? (
                <div className="space-y-3">
                  <p role="status" className="text-sm text-muted-foreground">
                    It looks like you already have an account with this email.
                  </p>
                  <div className="flex flex-col gap-1 text-sm">
                    <Link to="/login" className="font-semibold text-primary">Sign in instead</Link>
                    <Link to="/forgot-password" className="font-semibold text-primary">Forgot your password? Reset it</Link>
                  </div>
                </div>
              ) : confirmationSent ? (
                <div className="space-y-3">
                  <p role="status" className="text-sm text-muted-foreground">
                    Check your email to confirm your account, then{" "}
                    <Link to="/login" className="font-semibold text-primary">sign in</Link>.
                  </p>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <span>Already registered?{" "}<Link to="/login" className="font-semibold text-primary">Sign in</Link></span>
                    <span>Forgot your password?{" "}<Link to="/forgot-password" className="font-semibold text-primary">Reset it</Link></span>
                  </div>
                </div>
              ) : (
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                    <FormField control={emailForm.control} name="display_name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name</FormLabel>
                        <FormControl><Input autoComplete="name" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={emailForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={emailForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {formError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
                    <Button type="submit" variant="hero" className="w-full" disabled={emailForm.formState.isSubmitting}>
                      {emailForm.formState.isSubmitting ? "Creating account…" : "Sign up"}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      By creating an account, you agree to the{" "}
                      <Link to="/terms" className="font-medium text-primary underline">Terms of Service</Link>{" "}
                      and acknowledge the{" "}
                      <Link to="/privacy" className="font-medium text-primary underline">Privacy Policy</Link>.
                    </p>
                  </form>
                </Form>
              )}
            </>
          )}

          {/* ══ PHONE MODE — Step 1: form ══ */}
          {mode === "phone" && phoneStep === "form" && (
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                <FormField control={phoneForm.control} name="display_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl><Input autoComplete="name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={phoneForm.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone number</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 shrink-0 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                          +91
                        </span>
                        <Input type="tel" placeholder="9876543210" autoComplete="tel-national" inputMode="numeric" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={phoneForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                {phoneError && <p role="alert" className="text-sm font-medium text-destructive">{phoneError}</p>}
                <Button type="submit" variant="hero" className="w-full" disabled={phoneForm.formState.isSubmitting}>
                  {phoneForm.formState.isSubmitting ? "Sending code…" : "Send verification code"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  By creating an account, you agree to the{" "}
                  <Link to="/terms" className="font-medium text-primary underline">Terms of Service</Link>{" "}
                  and acknowledge the{" "}
                  <Link to="/privacy" className="font-medium text-primary underline">Privacy Policy</Link>.
                </p>
              </form>
            </Form>
          )}

          {/* ══ PHONE MODE — Step 2: OTP ══ */}
          {mode === "phone" && phoneStep === "otp" && (
            <Form {...otpForm}>
              <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to <span className="font-medium text-foreground">{pendingPhone}</span>.
                </p>
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
                {phoneError && <p role="alert" className="text-sm font-medium text-destructive">{phoneError}</p>}
                <Button type="submit" variant="hero" className="w-full" disabled={otpForm.formState.isSubmitting}>
                  {otpForm.formState.isSubmitting ? "Verifying…" : "Verify & create account"}
                </Button>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button type="button" onClick={() => { setPhoneStep("form"); setPhoneError(null); otpForm.reset(); }} className="hover:text-foreground">
                    ← Change number
                  </button>
                  <button type="button" onClick={resendOtp} disabled={resendCooldown > 0} className="disabled:opacity-50 hover:text-foreground">
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            </Form>
          )}

          {/* Sign-in link */}
          {!(mode === "email" && (confirmationSent || duplicateEmail)) && (
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-primary">Sign in</Link>
            </p>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
