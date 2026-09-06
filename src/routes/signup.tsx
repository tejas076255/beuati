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
  component: SignupPage,
});

const ensurePortfolioFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureOwnPortfolio } = await import("@/data/dashboard/provisioning.server");
    return ensureOwnPortfolio(context.supabase, context.userId);
  });

const signupSchema = z.object({
  display_name: z.string().min(1, "Enter your full name"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function SignupPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  // Only set when Supabase itself explicitly discloses a duplicate account
  // (its `user_already_exists` error code — see the onSubmit comment below).
  // Distinct from confirmationSent so the two states can carry different,
  // deliberately-worded copy without either one leaking more than Supabase
  // itself already chose to.
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { display_name: "", email: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof signupSchema>) => {
    setFormError(null);
    setDuplicateEmail(false);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { display_name: values.display_name } },
    });
    if (error) {
      // Supabase only returns this specific, structured error code when its
      // own project config has decided disclosure is safe (Confirm email OR
      // Confirm phone disabled) — see the GoTrue SDK's own documented
      // behavior for signUp(). We key off this stable `.code`, never a
      // message substring, and only map this one documented case to
      // friendlier copy; every other error is shown exactly as before.
      if (error.code === "user_already_exists") {
        setDuplicateEmail(true);
        return;
      }
      setFormError(error.message);
      return;
    }
    if (data.session) {
      try {
        await ensurePortfolioFn();
      } catch (provisionError) {
        // Non-fatal: the dashboard layout runs this same check on every
        // visit and will retry — the account/session itself is already fine.
        console.error("[signup] portfolio provisioning failed", provisionError);
      }
      navigate({ to: "/dashboard/profile" });
      return;
    }
    // No session yet. This covers two cases Supabase deliberately makes
    // indistinguishable when both Confirm email and Confirm phone are
    // enabled: a genuine new signup awaiting confirmation, and an
    // obfuscated response for an email that already has an account. The
    // visible message must therefore be identical either way — only the
    // secondary links below are always shown, giving a genuine existing
    // user an escape hatch without the message itself confirming anything.
    setConfirmationSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Sign up to manage your portfolio leads.</CardDescription>
        </CardHeader>
        <CardContent>
          {duplicateEmail ? (
            <div className="space-y-3">
              <p role="status" className="text-sm text-muted-foreground">
                It looks like you already have an account with this email.
              </p>
              <div className="flex flex-col gap-1 text-sm">
                <Link to="/login" className="font-semibold text-primary">
                  Sign in instead
                </Link>
                <Link to="/forgot-password" className="font-semibold text-primary">
                  Forgot your password? Reset it
                </Link>
              </div>
            </div>
          ) : confirmationSent ? (
            <div className="space-y-3">
              <p role="status" className="text-sm text-muted-foreground">
                Check your email to confirm your account, then{" "}
                <Link to="/login" className="font-semibold text-primary">
                  sign in
                </Link>
                .
              </p>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span>
                  Already registered?{" "}
                  <Link to="/login" className="font-semibold text-primary">
                    Sign in
                  </Link>
                </span>
                <span>
                  Forgot your password?{" "}
                  <Link to="/forgot-password" className="font-semibold text-primary">
                    Reset it
                  </Link>
                </span>
              </div>
            </div>
          ) : (
            <>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="display_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name</FormLabel>
                        <FormControl>
                          <Input autoComplete="name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
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
                    control={form.control}
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
                    <p role="alert" className="text-sm font-medium text-destructive">
                      {formError}
                    </p>
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
                    <Link to="/terms" className="font-medium text-primary underline">
                      Terms of Service
                    </Link>{" "}
                    and acknowledge the{" "}
                    <Link to="/privacy" className="font-medium text-primary underline">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              </Form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-primary">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
