import { createFileRoute } from "@tanstack/react-router";

import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { legalConfig } from "@/lib/legal-config";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Policy | ${legalConfig.serviceName}` },
      {
        name: "description",
        content: `How ${legalConfig.serviceName} collects, uses, and protects information.`,
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy">
      <section>
        <h2>Who this policy covers</h2>
        <p>
          This Privacy Policy describes how {legalConfig.serviceName} ("we", "us") collects, uses,
          and protects information when you use our platform — whether you are a beauty professional
          with a portfolio, or a visitor submitting an enquiry to a professional through their
          portfolio page.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <p>We collect four broad categories of information:</p>
        <ul>
          <li>
            <strong>Account information</strong> — your name, email, and phone number when you
            create an account.
          </li>
          <li>
            <strong>Public professional portfolio information</strong> — everything you choose to
            add to your portfolio: business details, bio, service and pricing information, location
            and service areas, photos and videos, availability, FAQs, and any client testimonials
            you choose to publish.
          </li>
          <li>
            <strong>Lead/customer enquiry information</strong> — when someone submits an enquiry
            through a professional's portfolio, we collect the name, contact details, and message
            they provide, along with the specifics of their enquiry (requested service, event date,
            location, and similar details).
          </li>
          <li>
            <strong>Technical and source information</strong> — basic technical details captured
            when an enquiry is submitted, such as the referring page and campaign/source
            information, so a professional can understand where their enquiries come from.
          </li>
        </ul>
      </section>

      <section>
        <h2>Portfolio media</h2>
        <p>
          Photos, videos, and other media you upload to your portfolio are stored securely and
          served as part of your public portfolio page.
        </p>
      </section>

      <section>
        <h2>Professional-entered testimonials</h2>
        <p>
          Professionals may add testimonials or reviews from their own clients to their portfolio.
          This information is entered by the professional, not collected by us directly from the
          client named in it.{" "}
          <strong>
            Professionals are responsible for having the appropriate basis to publish testimonial
            information about their clients
          </strong>{" "}
          — for example, having that client's permission to share their name and feedback publicly.
        </p>
      </section>

      <section>
        <h2>How we use information</h2>
        <ul>
          <li>To operate your account and display your portfolio.</li>
          <li>To deliver enquiries to the relevant professional so they can respond.</li>
          <li>
            To operate authentication and account security (for example, signing you in and
            protecting your account).
          </li>
          <li>To maintain and improve the platform.</li>
        </ul>
        <p>
          <strong>
            Portfolio content you publish is intentionally public and designed to be found —
            including by search engines.
          </strong>{" "}
          Do not include information in your public portfolio that you do not want to be publicly
          visible.
        </p>
      </section>

      <section>
        <h2>Lead information and the professional you contact</h2>
        <p>
          When you submit an enquiry to a professional, your information is shared with that
          professional so they can respond to your request. In this respect, our role is closer to
          providing the professional with the tools to receive and manage their own enquiries than
          to independently using your information for our own purposes.
        </p>
      </section>

      <section>
        <h2>Cookies and analytics</h2>
        <p>
          We use one functional cookie to remember a display preference in the professional
          dashboard (for example, whether a menu is expanded). This cookie does not track you across
          other websites.
        </p>
        <p>
          Some professional plans support an optional analytics integration (Google Tag Manager)
          that, when configured for a specific portfolio, records anonymized visit and enquiry
          events for that professional's own reporting. This is not active unless a professional's
          plan and configuration enable it, and it is not used for advertising or cross-site
          tracking.
        </p>
      </section>

      <section>
        <h2>Service providers</h2>
        <p>We use a small number of service providers to operate the platform:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — for our database, authentication, and file storage. This is
            an active part of how the platform runs today.
          </li>
          <li>
            <strong>Email delivery services</strong> — to send a professional a notification when
            they receive a new enquiry. This capability may not be active in every environment.
          </li>
          <li>
            <strong>Hosting infrastructure</strong> — to serve the platform to your browser.
          </li>
        </ul>
        <p>
          We do not sell your information to third parties, and we do not use it for advertising.
        </p>
      </section>

      <section>
        <h2>Data retention</h2>
        <p>
          We retain information for as long as your account or portfolio is active, or as needed to
          operate the platform. We do not currently have an automated deletion timeline to state —
          if you would like your information removed, see "Manual privacy and deletion requests"
          below.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          We use reasonable technical and organizational measures to protect information stored on
          the platform. No online service can guarantee absolute security, and we do not claim any
          specific security certification.
        </p>
      </section>

      <section>
        <h2>Your rights and correcting your information</h2>
        <p>
          Professionals can review and correct most of their own account and portfolio information
          directly from their dashboard at any time. For anything else — including questions about
          information we hold about you — see the contact details below.
        </p>
      </section>

      <section>
        <h2>Manual privacy and deletion requests</h2>
        <p>
          If you would like to request access to, correction of, or deletion of information we hold
          about you, contact us using the details below. We handle these requests manually today; we
          do not currently commit to a specific timeline for completing them, but we will respond to
          your request.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          {legalConfig.serviceName} is not directed at children, and we do not knowingly collect
          information from anyone under 18.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. The "Last updated" date at the top of
          this page reflects the most recent change.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about this policy can be sent to{" "}
          <a href={`mailto:${legalConfig.supportEmail}`} className="text-primary underline">
            {legalConfig.supportEmail}
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
