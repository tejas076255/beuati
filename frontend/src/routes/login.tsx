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

// ─── Redirect logic ───────────────────────────────────────────────────────────
// Draft/new portfolio → /dashboard/profile to complete setup
// Published portfolio → /dashboard
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

    if (!bp || bp.status === "draft") return "/dashboard/profile";
    return "/dashboard";
  } catch {
    return "/dashboard";
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password required"),
});

type LoginValues = z.infer<typeof loginSchema>;

// ─── Component ────────────────────────────────────────────────────────────────
function LoginPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-redirect if already logged in.
  // 5 s timeout guards against getSession() hanging (slow auth server /
  // new Supabase API key format extra round-trip).
  useEffect(() => {
    const timeout = setTimeout(() => setChecking(false), 5000);

    supabase.auth.getSession().then(async ({ data }) => {
      clearTimeout(timeout);
      if (data.session) {
        const to = await getPostLoginRedirect();
        navigate({ to });
      } else {
        setChecking(false);
      }
    }).catch(() => {
      clearTimeout(timeout);
      setChecking(false);
    });

    return () => clearTimeout(timeout);
  }, [navigate]);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setFormError(error.message);
      return;
    }
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

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link
                        to="/forgot-password"
                        className="text-xs font-medium text-primary hover:underline"
                      >
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

              {formError && (
                <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>
              )}

              <Button
                type="submit"
                variant="hero"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
              </Button>

            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="font-semibold text-primary">Sign up</Link>
          </p>

        </CardContent>
      </Card>
    </div>
  );
}
