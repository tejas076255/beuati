/**
 * Billing & Plan page — Billing Phase B.
 *
 * Works WITHOUT a deployed FastAPI backend.
 * Razorpay order is created directly from the TanStack server function
 * using the Razorpay REST API (httpx-style via native fetch).
 *
 * Flow:
 * 1. User picks plan + billing cycle → clicks Upgrade
 * 2. Server fn creates Razorpay order (server-side, key_secret never in browser)
 * 3. Razorpay checkout modal opens in browser
 * 4. On payment.captured → plan is activated via server fn
 * 5. UI polls billing status for confirmation
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLAN_LABELS, type PortfolioPlan } from "@/lib/plan-limits";
import { getDisplayPricing, getPriceInPaise, type PaidPlan, type BillingCycle } from "@/lib/billing-prices";

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingPage,
});

// ─── Env vars (server-only) ───────────────────────────────────────────────────
// RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in Vercel env vars.
// RAZORPAY_KEY_SECRET is NEVER sent to the browser.

// ─── Server functions ─────────────────────────────────────────────────────────

const getBillingStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnBeauticianProfileId } = await import("@/data/dashboard/shared.server");
    const bpId = await getOwnBeauticianProfileId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("beautician_profiles")
      .select("plan, billing_hold")
      .eq("id", bpId)
      .single();
    if (error || !data) throw new Error("Failed to load billing status");
    return {
      plan: (data.plan ?? "free") as PortfolioPlan,
      billing_hold: data.billing_hold ?? false,
      razorpay_key_id: process.env["RAZORPAY_KEY_ID"] ?? "",
    };
  });

interface CreateOrderInput {
  plan: PaidPlan;
  billing_cycle: BillingCycle;
}

interface CreateOrderResult {
  razorpay_order_id: string;
  amount_paise: number;
  currency: string;
  key_id: string;
  bp_id: string;
}

const createOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: CreateOrderInput) => data)
  .handler(async ({ context, data }): Promise<CreateOrderResult> => {
    const keyId = process.env["RAZORPAY_KEY_ID"] ?? "";
    const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";

    if (!keyId || !keySecret) {
      throw new Error("Razorpay is not configured on this server. Contact support.");
    }

    const { getOwnBeauticianProfileId } = await import("@/data/dashboard/shared.server");
    const bpId = await getOwnBeauticianProfileId(context.supabase, context.userId);

    const amountPaise = getPriceInPaise(data.plan, data.billing_cycle);

    // Create Razorpay order via their REST API (no SDK needed)
    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: bpId.slice(0, 40),
        notes: { plan: data.plan, billing_cycle: data.billing_cycle, bp_id: bpId },
      }),
    });

    if (!rzpRes.ok) {
      const errText = await rzpRes.text();
      throw new Error(`Razorpay order creation failed: ${errText}`);
    }

    const rzpOrder = await rzpRes.json() as { id: string; amount: number; currency: string };

    // Save local order record in Supabase
    await context.supabase.from("billing_orders").insert({
      beautician_profile_id: bpId,
      plan: data.plan,
      billing_cycle: data.billing_cycle,
      amount_paise: amountPaise,
      currency: "INR",
      gateway: "razorpay",
      gateway_order_id: rzpOrder.id,
      status: "created",
      expected_state_version: 0,
    });

    return {
      razorpay_order_id: rzpOrder.id,
      amount_paise: amountPaise,
      currency: "INR",
      key_id: keyId,
      bp_id: bpId,
    };
  });

interface ActivateInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: PaidPlan;
  bp_id: string;
}

const activatePlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ActivateInput) => data)
  .handler(async ({ context, data }) => {
    // Verify Razorpay signature server-side
    const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
    if (keySecret) {
      const { createHmac } = await import("crypto");
      const message = `${data.razorpay_order_id}|${data.razorpay_payment_id}`;
      const expected = createHmac("sha256", keySecret).update(message).digest("hex");
      if (expected !== data.razorpay_signature) {
        throw new Error("Payment signature verification failed.");
      }
    }

    // Mark order activated
    await context.supabase
      .from("billing_orders")
      .update({ status: "activated" })
      .eq("gateway_order_id", data.razorpay_order_id);

    // Activate plan on beautician_profile
    const supabaseAdmin = context.supabase;
    await supabaseAdmin
      .from("beautician_profiles")
      .update({ plan: data.plan, billing_hold: false })
      .eq("id", data.bp_id);

    return { activated: true, plan: data.plan };
  });

// ─── Razorpay JS SDK loader ───────────────────────────────────────────────────

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ─── Plan data ────────────────────────────────────────────────────────────────

const PAID_PLANS: PaidPlan[] = ["starter", "silver", "gold", "platinum"];

const PLAN_HIGHLIGHTS: Record<PaidPlan, string[]> = {
  starter: ["10 services", "30 gallery photos", "20 reviews"],
  silver: ["20 services", "75 photos", "50 reviews", "GTM analytics"],
  gold: ["50 services", "150 photos", "100 reviews", "All features"],
  platinum: ["150 services", "300 photos", "200 reviews", "Priority support"],
};

// ─── Component ────────────────────────────────────────────────────────────────

function BillingPage() {
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<PaidPlan | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [pollingActive, setPollingActive] = useState(false);
  const pollCountRef = useRef(0);

  const statusQuery = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => getBillingStatusFn(),
    refetchInterval: pollingActive ? 3000 : false,
  });

  useEffect(() => {
    if (!pollingActive) return;
    pollCountRef.current++;
    if (pollCountRef.current >= 10) {
      setPollingActive(false);
      pollCountRef.current = 0;
    }
  }, [statusQuery.data, pollingActive]);

  const createOrderMutation = useMutation({
    mutationFn: (input: CreateOrderInput) => createOrderFn({ data: input }),
  });

  const activateMutation = useMutation({
    mutationFn: (input: ActivateInput) => activatePlanFn({ data: input }),
    onSuccess: (result) => {
      toast.success(`${PLAN_LABELS[result.plan]} plan activated!`);
      setPollingActive(false);
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Plan activation failed. Contact support.");
    },
  });

  const handleUpgrade = useCallback(async () => {
    if (!selectedPlan) return;

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded || !window.Razorpay) {
      toast.error("Could not load Razorpay. Check your internet connection.");
      return;
    }

    let orderData: CreateOrderResult;
    try {
      orderData = await createOrderMutation.mutateAsync({
        plan: selectedPlan,
        billing_cycle: cycle,
      });
    } catch (err) {
      toast.error((err as Error).message || "Failed to create order. Try again.");
      return;
    }

    const plan = selectedPlan;
    const rzp = new window.Razorpay({
      key: orderData.key_id,
      order_id: orderData.razorpay_order_id,
      amount: orderData.amount_paise,
      currency: orderData.currency,
      name: "BeautyFolio",
      description: `${PLAN_LABELS[plan]} — ${cycle}`,
      theme: { color: "#7C3AED" },
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        // Activate plan server-side with signature verification
        activateMutation.mutate({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          plan,
          bp_id: orderData.bp_id,
        });
      },
    });
    rzp.open();
  }, [selectedPlan, cycle, createOrderMutation, activateMutation]);

  const currentPlan = statusQuery.data?.plan ?? "free";
  const isHold = statusQuery.data?.billing_hold ?? false;
  const razorpayReady = !!statusQuery.data?.razorpay_key_id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Billing &amp; Plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your BeautyFolio subscription.
        </p>
      </div>

      {/* Current plan */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant="default" className="text-sm">
            {PLAN_LABELS[currentPlan]}
          </Badge>
          {isHold && (
            <Badge variant="destructive" className="text-xs">
              Billing hold — content limits exceeded
            </Badge>
          )}
          {!razorpayReady && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Payments not configured
            </Badge>
          )}
          {activateMutation.isPending && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Activating plan…
            </span>
          )}
        </CardContent>
      </Card>

      {/* Billing cycle toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Billing cycle:</span>
        <div className="flex rounded-lg border border-border bg-card">
          {(["monthly", "yearly"] as BillingCycle[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                cycle === c
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "monthly" ? "Monthly" : "Yearly (save 17%)"}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PAID_PLANS.map((plan) => {
          const pricing = getDisplayPricing(plan);
          const price = cycle === "monthly" ? pricing.monthly : pricing.yearly;
          const isCurrent = plan === currentPlan;
          const isSelected = plan === selectedPlan;
          return (
            <Card
              key={plan}
              onClick={() => !isCurrent && setSelectedPlan(plan)}
              className={`cursor-pointer border-2 transition-all ${
                isCurrent
                  ? "border-primary/50 bg-primary/5 cursor-default"
                  : isSelected
                    ? "border-primary shadow-md"
                    : "border-border/70 hover:border-primary/40"
              }`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  {PLAN_LABELS[plan]}
                  {isCurrent && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </CardTitle>
                <CardDescription className="text-lg font-semibold text-foreground">
                  ₹{price.toLocaleString("en-IN")}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{cycle === "monthly" ? "mo" : "yr"}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {PLAN_HIGHLIGHTS[plan].map((h) => (
                    <li key={h} className="text-xs text-muted-foreground">• {h}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upgrade button */}
      {selectedPlan && selectedPlan !== currentPlan && (
        <div className="flex items-center gap-3">
          <Button
            variant="hero"
            onClick={handleUpgrade}
            disabled={createOrderMutation.isPending || activateMutation.isPending || !razorpayReady}
            className="gap-2"
          >
            {createOrderMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {!razorpayReady ? "Payments not configured" : `Upgrade to ${PLAN_LABELS[selectedPlan]}`}
          </Button>
          <button type="button" onClick={() => setSelectedPlan(null)}
            className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Payments processed securely by Razorpay. All prices in INR.
        {statusQuery.data?.razorpay_key_id?.startsWith("rzp_test") && (
          <span className="ml-1 font-medium text-amber-600">(Test mode)</span>
        )}
      </p>
    </div>
  );
}
