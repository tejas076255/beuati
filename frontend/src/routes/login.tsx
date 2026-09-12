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
  phone: z
    .string()
    .min(10, "Enter a valid phone number")
    .regex(/^[0-9+\s\-()]+$/, "Enter a valid phone number"),
  password: z.string().min(1, "Password required"),
});

type LoginValues = z.infer<typeof loginSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

function LoginPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-redirect if already logged in.
  // 5 s timeout guards against getSession() hanging on slow auth servers.
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
    defaultValues: { phone: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);

    const phone = normalizePhone(values.phone);
    const email = phoneToFakeEmail(phone);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: values.password,
    });

    if (error) {
      // Show a friendly message — don't expose internal email to the user
      setFormError("Invalid phone number or password.");
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

              {/* Phone */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone number</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        autoComplete="tel"
                        placeholder="9876543210"
                        {...field}
                      />
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
