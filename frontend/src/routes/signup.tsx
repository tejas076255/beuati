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
      if (error.code === "user_already_exists") { setDuplicateEmail(true); return; }
      setFormError(error.message);
      return;
    }

    if (data.session) {
      try { await ensurePortfolioFn(); } catch (e) {
        console.error("[signup] portfolio provisioning failed", e);
      }
      navigate({ to: "/dashboard/profile" });
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

          {duplicateEmail ? (
            <div className="space-y-3">
              <p role="status" className="text-sm text-muted-foreground">
                It looks like you already have an account with this email.
              </p>
              <div className="flex flex-col gap-1 text-sm">
                <Link to="/login" className="font-semibold text-primary">Sign in instead</Link>
                <Link to="/forgot-password" className="font-semibold text-primary">
                  Forgot your password? Reset it
                </Link>
              </div>
            </div>
          ) : (
            <>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="display_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl><Input autoComplete="name" {...field} /></FormControl>
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
