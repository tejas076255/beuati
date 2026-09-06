import { createFileRoute } from "@tanstack/react-router";

import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { legalConfig } from "@/lib/legal-config";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Terms of Service | ${legalConfig.serviceName}` },
      {
        name: "description",
        content: `The terms that govern use of ${legalConfig.serviceName}.`,
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service">
      <section>
        <h2>What {legalConfig.serviceName} is</h2>
        <p>
          {legalConfig.serviceName} is a professional-first portfolio platform for beauty
          professionals, focused on helping you be found on Google and local search and receive
          direct enquiries. {legalConfig.serviceName}{" "}
          <strong>is not a marketplace and not a booking intermediary</strong> — we do not take
          bookings, process payments between you and your clients, or act as an agent for either
          party.
        </p>
      </section>

      <section>
        <h2>No guaranteed outcomes</h2>
        <p>
          We do not guarantee leads, search rankings, bookings, revenue, or any other business
          outcome. An availability or contact request submitted through your portfolio is an enquiry
          only — it is <strong>not a confirmed booking</strong>, and no booking is formed until you
          and the enquirer agree to one directly.
        </p>
      </section>

      <section>
        <h2>Your responsibilities</h2>
        <ul>
          <li>
            You are responsible for the accuracy of your profile, service listings, and pricing
            information.
          </li>
          <li>
            You are solely responsible for the beauty services you actually deliver to your own
            clients — {legalConfig.serviceName} has no role in, and no responsibility for, that
            service delivery.
          </li>
          <li>
            Testimonials on your portfolio are content you supply or curate about your own clients —
            they are not customer-authored reviews collected by {legalConfig.serviceName}. You are
            responsible for having the appropriate basis to publish that information.
          </li>
        </ul>
      </section>

      <section>
        <h2>Verification</h2>
        <p>
          A "Verified" badge, where shown, is granted by {legalConfig.serviceName}'s admin team only
          where we have actually reviewed and approved a profile — it is never automatic or
          self-declared. Verification is separate from, and not affected by, a profile's Completion
          Score, plan tier, or ratings.
        </p>
      </section>

      <section>
        <h2>Plans and limits</h2>
        <p>
          Each plan has associated content limits (for example, the number of services, gallery
          photos, or portfolio items you can add). These limits may change over time.
        </p>
        <p>
          <strong>
            Paid plans are currently activated manually by the {legalConfig.serviceName}
            team.
          </strong>{" "}
          Self-serve billing is not currently available. There is no {legalConfig.serviceName}{" "}
          commission on any booking or payment between you and your clients.
        </p>
      </section>

      <section>
        <h2>Content moderation</h2>
        <p>
          Our admin team may moderate, suspend, or unpublish content or accounts where appropriate —
          for example, where content violates these Terms or applicable law.
        </p>
      </section>

      <section>
        <h2>Acceptable use and your content</h2>
        <p>
          You must not upload content that is unlawful, infringing, or misleading. Any media or
          content you upload must be your own, or you must have the necessary rights or license to
          use it. You retain ownership of your content, and you grant {legalConfig.serviceName} the
          limited rights needed to host, display, and process it as part of operating your
          portfolio.
        </p>
      </section>

      <section>
        <h2>Platform availability and changes</h2>
        <p>
          The platform may change, be updated, or occasionally be unavailable. We do not currently
          provide an uptime or service-level guarantee.
        </p>
      </section>

      <section>
        <h2>Termination</h2>
        <p>
          We may suspend or terminate an account for violation of these Terms. You may stop using
          the platform at any time; if you would like your account closed, contact us using the
          details below.
        </p>
      </section>

      <section>
        <h2>Disclaimers and limitation of liability</h2>
        <p>
          The platform is provided "as is," without warranties of any kind, express or implied. To
          the fullest extent permitted by law, {legalConfig.serviceName} is not liable for indirect,
          incidental, or consequential damages arising from use of the platform.
        </p>
      </section>

      <section>
        <h2>Governing law</h2>
        <p>
          These Terms are governed by the {legalConfig.governingLaw}, and any disputes are subject
          to the exclusive jurisdiction of the courts of {legalConfig.jurisdiction}.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about these Terms can be sent to{" "}
          <a href={`mailto:${legalConfig.supportEmail}`} className="text-primary underline">
            {legalConfig.supportEmail}
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
