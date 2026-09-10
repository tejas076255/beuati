import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
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

// ─── Google SSO helper ────────────────────────────────────────────────────────
async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/dashboard/profile` },
  });
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: LoginPage,
});

// ─── Smarter redirect after login ─────────────────────────────────────────────
// New users (no published portfolio) → /dashboard/profile to complete setup
// Existing users → /dashboard (overview)
async function getPostLoginRedirect(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "/dashboard";

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!profile) return "/dashboard";

    const { data: bp } = await supabase
      .from("beautician_profiles")
      .select("status")
      .eq("profile_id", profile.id)
      .maybeSingle();

    // No portfolio or draft → go to profile page to complete setup
    if (!bp || bp.status === "draft") return "/dashboard/profile";
    return "/dashboard";
  } catch {
    return "/dashboard";
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const emailSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

const phoneSchema = z.object({
  phone: z.string().min(10, "Valid phone number required"),
  password: z.string().min(1, "Password required"),
});

// ─── Component ────────────────────────────────────────────────────────────────

function LoginPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [mode, setMode] = useState<"email" | "phone">("email");

  // Auto-redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const to = await getPostLoginRedirect();
        navigate({ to });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "", password: "" },
  });

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "", password: "" },
  });

  const onEmailSubmit = async (values: z.infer<typeof emailSchema>) => {
    setFormError(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) { setFormError(error.message); return; }
    const to = await getPostLoginRedirect();
    navigate({ to });
  };

  const onPhoneSubmit = async (values: z.infer<typeof phoneSchema>) => {
    setFormError(null);
    // Normalize phone — add +91 if no country code
    const phone = values.phone.startsWith("+") ? values.phone : `+91${values.phone.replace(/\D/g, "")}`;
    const { error } = await supabase.auth.signInWithPassword({ phone, password: values.password });
    if (error) { setFormError(error.message); return; }
    const to = await getPostLoginRedirect();
    navigate({ to });
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Sign in to manage your BeautyFolio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google SSO */}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={signInWithGoogle}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border bg-muted p-1">
            <button
              type="button"
              onClick={() => { setMode("email"); setFormError(null); }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "email" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => { setMode("phone"); setFormError(null); }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "phone" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              Phone
            </button>
          </div>

          {/* Email login */}
          {mode === "email" && (
            <Form {...emailForm}>
              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={emailForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                          Forgot password?
                        </Link>
                      </div>
                      <FormControl>
                        <PasswordInput autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
                <Button type="submit" variant="hero" className="w-full" disabled={emailForm.formState.isSubmitting}>
                  {emailForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Form>
          )}

          {/* Phone login */}
          {mode === "phone" && (
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="9876543210" autoComplete="tel" {...field} />
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
                        <PasswordInput autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
                <Button type="submit" variant="hero" className="w-full" disabled={phoneForm.formState.isSubmitting}>
                  {phoneForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="font-semibold text-primary">Sign up</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
