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
