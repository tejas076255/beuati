import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: z.infer<typeof forgotPasswordSchema>) => {
    // redirectTo is always derived from the current origin — never accepted
    // from a query param or any other caller-suppliable input, closing the
    // open-redirect vector regardless of what Supabase's own allowlist does.
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, { redirectTo });
    if (error) {
      // Never surfaced to the user — showing the same generic message
      // whether or not this call actually found a matching account is the
      // whole point of this flow (Supabase's own API is designed the same
      // way: it does not report success/failure differently for an
      // unknown email). Logged only for local debugging.
      console.error("[forgot-password] resetPasswordForEmail failed", error);
    }
    // Always the same outcome, regardless of whether the email exists or
    // the call succeeded — this must never disclose account existence.
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Reset your password</CardTitle>
          <CardDescription>
            Enter your account email and we'll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <p role="status" className="text-sm text-muted-foreground">
              If an account is associated with that email, you'll receive instructions to reset your
              password. Be sure to check your spam folder.{" "}
              <Link to="/login" className="font-semibold text-primary">
                Back to sign in
              </Link>
              .
            </p>
          ) : (
            <>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  <Button
                    type="submit"
                    variant="hero"
                    className="w-full"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
                  </Button>
                </form>
              </Form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Remembered your password?{" "}
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
