import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { isCurrentUserAdmin } from "@/lib/require-admin";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

// Account-identity summary only (email/display name/created date) — never
// portfolio/profile content, which stays on the existing Profile page.
const getOwnAccountSummaryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnAccountSummary } = await import("@/data/dashboard/account.server");
    return getOwnAccountSummary(context.supabase, context.userId);
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

function ChangePasswordForm({ email }: { email: string | null }) {
  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const onSubmit = async (values: z.infer<typeof changePasswordSchema>) => {
    if (!email) {
      toast.error("Could not verify your account email. Please refresh and try again.");
      return;
    }

    // Current-password re-verification: Supabase's updateUser() trusts the
    // live session outright and does not itself require the current
    // password, so this re-authentication is a deliberate extra step
    // (not an SDK requirement) guarding against a shared-device/left-open-
    // session scenario. signInWithPassword operates only on this same
    // account (its own email), so it can never target another user, and it
    // never touches role/profile/beautician_profile ownership/plan/
    // verification/completion_score — only auth.users.encrypted_password
    // and the session tokens are affected either way.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: values.currentPassword,
    });
    if (verifyError) {
      form.setError("currentPassword", { message: "Current password is incorrect" });
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: values.newPassword,
    });
    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    toast.success("Password updated");
    form.reset({ currentPassword: "", newPassword: "" });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
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
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Updating…" : "Change password"}
        </Button>
      </form>
    </Form>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const accountQuery = useQuery({
    queryKey: ["own-account-summary"],
    queryFn: () => getOwnAccountSummaryFn(),
  });
  // Same query key the dashboard shell already uses — a warm cache hit
  // whenever Settings is reached via the sidebar, a fresh (still cheap)
  // fetch when this page is opened directly.
  const isAdminQuery = useQuery({
    queryKey: ["is-current-user-admin"],
    queryFn: () => isCurrentUserAdmin(),
  });

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">Account Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account credentials. To edit your portfolio, go to Profile instead.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{accountQuery.data?.email ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{accountQuery.data?.display_name ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary">{isAdminQuery.data ? "Admin" : "Professional"}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Account created</span>
            <span className="font-medium">
              {accountQuery.data?.created_at
                ? new Date(accountQuery.data.created_at).toLocaleDateString()
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Enter your current password, then choose a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm email={accountQuery.data?.email ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign out</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Log out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
