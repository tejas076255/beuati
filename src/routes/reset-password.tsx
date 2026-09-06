import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

// This project's Supabase client (src/integrations/supabase/client.ts) does
// not configure `flowType`, so it uses the SDK's default `implicit` flow
// with `detectSessionInUrl: true` — the recovery link's tokens arrive as a
// URL hash fragment, and the client auto-consumes them during its own
// initialization (before any of our code runs). `getSession()` internally
// awaits that initialization (`await this.initializePromise`), so calling
// it here is guaranteed to reflect a just-established recovery session
// with no manual hash-parsing or race condition — this is NOT the PKCE
// code-exchange flow, so there is no `exchangeCodeForSession()` call here.
const resetPasswordSchema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RecoveryStatus = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    let cancelled = false;

    // Defensive/best-practice per Supabase's documented pattern: a
    // PASSWORD_RECOVERY event fires once the recovery session is
    // established. This is a secondary signal only — the authoritative
    // check is the getSession() call below, which awaits the SDK's own
    // initialization and therefore cannot race the hash-fragment parsing.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !cancelled) {
        setStatus("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(data.session ? "ready" : "invalid");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (values: z.infer<typeof resetPasswordSchema>) => {
    setFormError(null);
    // Operates only on the current (recovery) session's own user — there is
    // no user-id/target parameter anywhere in this call, so it can never
    // affect any account other than the one that owns this recovery link.
    // This never touches role, profile ownership, beautician_profile
    // ownership, plan, verification, or completion_score — none of those
    // are read or written by updateUser({ password }).
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError(error.message);
      return;
    }
    navigate({ to: "/dashboard/leads" });
  };

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Checking your reset link…</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">Link expired</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>This reset link is no longer valid</AlertTitle>
              <AlertDescription>
                It may have already been used or expired. Request a new one to continue.
              </AlertDescription>
            </Alert>
            <Link to="/forgot-password" className="mt-4 block text-center">
              <Button variant="hero" className="w-full">
                Request a new link
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Set a new password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <PasswordInput autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
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
                {form.formState.isSubmitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
