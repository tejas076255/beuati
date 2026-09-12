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
    return ensureOwnPortfolio(context.supabase, context.userId, "Direct");
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
 * has to enter one. The domain is internal-only and never receives mail.
 */
function phoneToFakeEmail(normalizedPhone: string): string {
  // Strip leading '+' so the local part is a plain number string.
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
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignupValues = z.infer<typeof signupSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

function SignupPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicatePhone, setDuplicatePhone] = useState(false);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { display_name: "", phone: "", password: "" },
  });

  const onSubmit = async (values: SignupValues) => {
    setFormError(null);
    setDuplicatePhone(false);

    const phone = normalizePhone(values.phone);
    const email = phoneToFakeEmail(phone);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: values.password,
      options: {
        data: {
          display_name: values.display_name,
          phone,
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
        await ensurePortfolioFn();
      } catch (e) {
        console.error("[signup] portfolio provisioning failed", e);
      }
      navigate({ to: "/onboarding" });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Sign up to manage your portfolio leads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {duplicatePhone ? (
            <div className="space-y-3">
              <p role="status" className="text-sm text-muted-foreground">
                An account with this phone number already exists.
              </p>
              <div className="flex flex-col gap-1 text-sm">
                <Link to="/login" className="font-semibold text-primary">Sign in instead</Link>
                <Link to="/forgot-password" className="font-semibold text-primary">
                  Forgot your password? Reset it
                </Link>
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                {/* Full name */}
                <FormField control={form.control} name="display_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                    <FormControl>
                      <Input autoComplete="name" placeholder="Priya Sharma" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Phone */}
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone number <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
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
                )} />

                {/* Password */}
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                    <FormControl>
                      <PasswordInput autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {formError && (
                  <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>
                )}

                <Button
                  type="submit"
                  variant="hero"
                  className="w-full"
                  disabled={form.formState.isSubmitting}
                >
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
          )}

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-primary">Sign in</Link>
          </p>

        </CardContent>
      </Card>
    </div>
  );
}
