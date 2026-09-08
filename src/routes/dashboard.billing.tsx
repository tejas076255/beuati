/**
 * Billing & Plan page — Billing Phase B.
 *
 * Shows the current plan, opens Razorpay checkout for upgrades.
 *
 * Flow:
 * 1. User picks a plan + billing cycle
 * 2. "Upgrade" → calls /api/billing/create-order (authenticated via FastAPI)
 * 3. Backend creates local billing_orders row + Razorpay order
 * 4. We open the Razorpay checkout modal (their JS SDK loaded inline)
 * 5. On success → Razorpay fires the webhook → backend activates plan
 * 6. We poll /api/billing/status every 3s for up to 30s to reflect the update
 *
 * Payment confirmation ONLY comes via webhook (never from the success callback
 * alone — that can be forged). The success handler triggers a status poll to
 * give the user real-time feedback without a page reload.
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
import {
  getDisplayPricing,
  type PaidPlan,
  type BillingCycle,
} from "@/lib/billing-prices";
import { callApi } from "@/lib/api-client.server";

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingPage,
});

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
    return { plan: data.plan as PortfolioPlan, billing_hold: data.billing_hold ?? false };
  });

interface CreateOrderInput {
  plan: PaidPlan;
  billing_cycle: BillingCycle;
}

interface CreateOrderResult {
  local_order_id: string;
  razorpay_order_id: string;
  amount_paise: number;
  currency: string;
  key_id: string;
}

const createOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: CreateOrderInput) => data)
  .handler(async ({ context, data }) => {
    // Forward to FastAPI billing endpoint with the user's bearer token
    const result = await callApi<CreateOrderResult>({
      path: "/api/billing/create-order",
      method: "POST",
      body: { plan: data.plan, billing_cycle: data.billing_cycle },
      request: context,
    });
    return result;
  });

// ─── Razorpay checkout helper ─────────────────────────────────────────────────

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

// ─── Plan cards data ───────────────────────────────────────────────────────────

const PAID_PLANS: PaidPlan[] = ["starter", "silver", "gold", "platinum"];

const PLAN_HIGHLIGHTS: Record<PaidPlan, string[]> = {
  starter: ["10 services", "30 gallery photos", "20 reviews", "₹399/mo"],
  silver: ["20 services", "75 photos", "50 reviews", "GTM analytics", "₹799/mo"],
  gold: ["50 services", "150 photos", "100 reviews", "All features", "₹1,499/mo"],
  platinum: ["150 services", "300 photos", "200 reviews", "Priority support", "₹2,999/mo"],
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

  // Stop polling after plan changes or after 10 attempts (~30s)
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

  const handleUpgrade = useCallback(async () => {
    if (!selectedPlan) return;

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded || !window.Razorpay) {
      toast.error("Could not load Razorpay checkout. Please try again.");
      return;
    }

    let orderData: CreateOrderResult;
    try {
      orderData = await createOrderMutation.mutateAsync({
        plan: selectedPlan,
        billing_cycle: cycle,
      });
    } catch (err) {
      toast.error((err as Error).message || "Failed to create order. Please try again.");
      return;
    }

    const rzp = new window.Razorpay({
      key: orderData.key_id,
      order_id: orderData.razorpay_order_id,
      amount: orderData.amount_paise,
      currency: orderData.currency,
      name: "BeautyFolio",
      description: `${PLAN_LABELS[selectedPlan]} plan — ${cycle}`,
      theme: { color: "#7C3AED" },
      handler: () => {
        // Payment success callback — start polling for webhook confirmation
        toast.success("Payment received! Activating your plan…");
        setPollingActive(true);
        pollCountRef.current = 0;
        queryClient.invalidateQueries({ queryKey: ["billing-status"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      },
      modal: {
        ondismiss: () => {
          // User closed checkout without paying — no action needed
        },
      },
    });
    rzp.open();
  }, [selectedPlan, cycle, createOrderMutation, queryClient]);

  const currentPlan = statusQuery.data?.plan ?? "free";
  const isHold = statusQuery.data?.billing_hold ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Billing & Plan</h1>
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
          {pollingActive && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Confirming payment…
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
                  {isCurrent && (
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  )}
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
                    <li key={h} className="text-xs text-muted-foreground">
                      • {h}
                    </li>
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
            disabled={createOrderMutation.isPending}
            className="gap-2"
          >
            {createOrderMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Zap className="h-4 w-4" aria-hidden="true" />
            )}
            Upgrade to {PLAN_LABELS[selectedPlan]}
          </Button>
          <button
            type="button"
            onClick={() => setSelectedPlan(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Payments are processed securely by Razorpay. Your plan activates within seconds of payment
        confirmation. All prices are in Indian Rupees (INR) and include GST.
      </p>
    </div>
  );
}
