import { createFileRoute } from "@tanstack/react-router";

import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { legalConfig } from "@/lib/legal-config";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: `Refund & Cancellation Policy | ${legalConfig.serviceName}` },
      {
        name: "description",
        content: `${legalConfig.serviceName}'s current refund and cancellation policy.`,
      },
    ],
  }),
  component: RefundPolicyPage,
});

function RefundPolicyPage() {
  return (
    <LegalPageLayout title="Refund & Cancellation Policy">
      <section>
        <h2>Free plan</h2>
        <p>No payment is collected for the Free plan, so no refund ever applies to it.</p>
      </section>

      <section>
        <h2>Manually activated paid plans</h2>
        <p>
          Where a paid plan is purchased directly through the {legalConfig.serviceName} team, a full
          refund may be requested before the paid plan is activated.
        </p>
        <p>
          Once the paid plan has been activated, payments are non-refundable, except where a refund
          is required under applicable law.
        </p>
      </section>

      <section>
        <h2>How paid plans work today</h2>
        <ul>
          <li>Paid-plan activation is currently handled manually by our team.</li>
          <li>There is currently no automatic subscription renewal system.</li>
          <li>There is currently no self-serve cancellation or payment workflow.</li>
        </ul>
      </section>

      <section>
        <h2>Future self-serve billing</h2>
        <p>
          If and when {legalConfig.serviceName} introduces self-serve billing, that system may come
          with updated commercial terms — including subscription renewal and cancellation rules
          appropriate to an automated payment flow. Updated terms will be published on this page
          before self-serve billing is introduced, and will apply only going forward.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about a payment or this policy can be sent to{" "}
          <a href={`mailto:${legalConfig.supportEmail}`} className="text-primary underline">
            {legalConfig.supportEmail}
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
