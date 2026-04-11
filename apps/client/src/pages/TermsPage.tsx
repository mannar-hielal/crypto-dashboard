import { Link } from 'react-router';
import { LegalLayout } from '@/components/LegalLayout';

const CONTACT_EMAIL = 'adminwithu@gmail.com'; // TODO: replace with legal@yourdomain.com once domain is live

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Use" lastUpdated="April 11, 2026">
      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using Crypto Dashboard ("the Service", "we", "us"), you agree to be bound
          by these Terms of Use and our <Link to="/privacy">Privacy Policy</Link>. If you do not
          agree, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>
          Crypto Dashboard is a <strong>paper trading simulation platform</strong> that provides
          professional-grade charting and order management tools using real-time price data from the
          Bybit API. All trading activity on this platform is simulated using virtual currency.
        </p>
        <p>
          <strong>
            No real cryptocurrency or fiat money is ever exchanged, deposited, or withdrawn through
            this Service.
          </strong>
        </p>
        <p>
          The Service is currently offered during an early-access period. Subscription-based pricing
          tiers will be introduced in a future release. Registered users will be notified of any
          changes to the pricing model before they take effect.
        </p>
      </section>

      <section>
        <h2>3. Eligibility</h2>
        <ul>
          <li>You must be at least 18 years old to use this Service.</li>
          <li>
            By creating an account, you confirm that you meet this age requirement and that you have
            the legal capacity to enter into these Terms.
          </li>
          <li>
            The Service is not available to residents of jurisdictions where simulated trading
            platforms are prohibited by law. You are solely responsible for verifying compliance
            with your local laws and regulations.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. No Financial Advice</h2>
        <p>
          Nothing on this platform constitutes financial, investment, legal, or tax advice. The
          Service is provided strictly for <strong>educational and entertainment purposes</strong>.
          Simulated trading results do not represent or guarantee future real-world performance. You
          should consult a qualified financial advisor before making any real investment decisions.
        </p>
      </section>

      <section>
        <h2>5. Account Registration</h2>
        <ul>
          <li>
            You agree to provide accurate, current, and complete information when creating an
            account.
          </li>
          <li>
            You are responsible for maintaining the confidentiality of your password and for all
            activity under your account.
          </li>
          <li>
            You must notify us immediately at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you suspect any unauthorised
            use of your account.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Virtual Balance</h2>
        <p>
          Your virtual starting balance (e.g. $10,000 USD equivalent) exists solely within this
          platform and has <strong>no monetary value</strong>. It cannot be withdrawn, transferred,
          or converted into real currency or cryptocurrency under any circumstances.
        </p>
      </section>

      <section>
        <h2>7. Prohibited Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose or in violation of these Terms.</li>
          <li>Attempt to reverse-engineer, hack, or disrupt the platform or its infrastructure.</li>
          <li>Impersonate another person or entity.</li>
          <li>Upload malicious code or attempt unauthorised access to any system.</li>
          <li>Use automated scripts or bots to create accounts or abuse the Service.</li>
          <li>
            Use data or outputs from this Service to train commercial AI models without our express
            written consent.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Intellectual Property</h2>
        <p>
          All code, design, content, and assets produced by this project are the exclusive
          proprietary property of Mannar Hielal. All rights reserved. No part of the Service
          may be copied, reproduced, modified, distributed, or sublicensed without the express prior
          written permission of Mannar Hielal. Real-time price data is provided by Bybit and is
          subject to{' '}
          <a
            href="https://www.bybit.com/en/terms-service/user-agreement/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Bybit's Terms of Service
          </a>
          .
        </p>
      </section>

      <section>
        <h2>9. Privacy &amp; Data Protection</h2>
        <p>
          Your use of the Service is governed by our <Link to="/privacy">Privacy Policy</Link>,
          which is incorporated into these Terms. We process your personal data in accordance with
          the Swiss Federal Act on Data Protection (nDSG) and, where applicable, the EU General Data
          Protection Regulation (GDPR).
        </p>
      </section>

      <section>
        <h2>10. Third-Party Services</h2>
        <p>The Service integrates with the following third-party providers:</p>
        <ul>
          <li>
            <strong>Bybit</strong> — real-time market data (mainnet)
          </li>
          <li>
            <strong>Resend</strong> — transactional email delivery (password reset)
          </li>
          <li>
            <strong>Fly.io</strong> — backend hosting (EU/US regions)
          </li>
          <li>
            <strong>Cloudflare</strong> — frontend CDN and DDoS protection
          </li>
        </ul>
        <p>
          Each provider has its own terms of service and privacy policy. We are not responsible for
          the practices or content of third-party services.
        </p>
      </section>

      <section>
        <h2>11. Service Availability</h2>
        <p>
          We do not guarantee uninterrupted, error-free, or permanent availability of the Service.
          As this platform is in active development, features may change, be removed, or become
          temporarily unavailable without prior notice. We reserve the right to suspend or
          discontinue the Service at any time.
        </p>
      </section>

      <section>
        <h2>12. Disclaimer of Warranties</h2>
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS
          OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY SWISS LAW, WE DISCLAIM ALL WARRANTIES
          INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
          PURPOSE, AND NON-INFRINGEMENT.
        </p>
      </section>

      <section>
        <h2>13. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, MANNAR HIELAL SHALL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR
          USE OF THE SERVICE. SINCE NO REAL FUNDS ARE INVOLVED IN THIS PLATFORM, OUR MAXIMUM
          AGGREGATE LIABILITY TO YOU SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL FEES PAID BY YOU
          TO THE SERVICE IN THE THREE (3) MONTHS PRECEDING THE CLAIM, OR (B) CHF 100.
        </p>
        <p>
          EU consumers may have additional rights under mandatory consumer protection laws of their
          country of residence which are not affected by this clause.
        </p>
      </section>

      <section>
        <h2>14. Dispute Resolution</h2>

        <h3>14.1 Mandatory Good-Faith Negotiation (prerequisite to any action)</h3>
        <p>
          Before initiating any formal dispute, legal proceeding, or complaint against Mannar Hielal
          or the Service, you <strong>must</strong> first send a written notice to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> describing your claim in
          reasonable detail. We will have <strong>30 calendar days</strong> from receipt of that
          notice to attempt to resolve the matter amicably. No formal action may be commenced until
          this 30-day period has elapsed without resolution. By using the Service, you expressly
          waive the right to initiate any proceeding without completing this step first.
        </p>

        <h3>14.2 Mediation Before Litigation</h3>
        <p>
          If the parties cannot resolve the dispute through negotiation within 30 days, both parties
          agree to submit the dispute to <strong>non-binding mediation</strong> as a further
          prerequisite to any litigation or arbitration. Mediation shall be conducted by a mutually
          agreed-upon mediator in Switzerland, or, failing agreement within 10 days, by a mediator
          appointed by the{' '}
          <a href="https://www.swissmediation.ch" target="_blank" rel="noopener noreferrer">
            Swiss Chamber of Commerce Mediation Centre
          </a>
          . Costs of mediation shall be shared equally between the parties. Mediation proceedings
          and all communications made during mediation are strictly confidential and may not be used
          as evidence in any subsequent proceeding.
        </p>
        <p>
          EU residents may also use the European Commission's{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
            Online Dispute Resolution (ODR) platform
          </a>{' '}
          as an alternative to Swiss mediation.
        </p>

        <h3>14.3 Individual Claims Only — No Class Actions</h3>
        <p>
          To the maximum extent permitted by applicable law, all disputes must be brought on an
          individual basis.{' '}
          <strong>
            You waive any right to bring or participate in any class action, collective action,
            consolidated action, or representative proceeding
          </strong>{' '}
          against Mannar Hielal. Claims of different users may not be consolidated or joined in any
          proceeding. This waiver is an essential element of these Terms; if it is found
          unenforceable, the entire dispute resolution section shall be severed and the remaining
          Terms shall survive.
        </p>

        <h3>14.4 Limitation Period for Claims</h3>
        <p>
          Any claim or cause of action arising out of or related to your use of the Service{' '}
          <strong>must be filed within one (1) year</strong> after such claim or cause of action
          arose, regardless of any statute of limitations to the contrary. Claims not filed within
          this period are permanently barred. This limitation does not apply to mandatory consumer
          protection rights of EU residents that cannot be contractually reduced under applicable
          law.
        </p>

        <h3>14.5 Confidentiality of Disputes</h3>
        <p>
          The existence, content, and outcome of any dispute, negotiation, mediation, or settlement
          between you and Mannar Hielal shall be kept strictly confidential by both parties and may
          not be disclosed to any third party without prior written consent, except as required by
          law or a court order.
        </p>

        <h3>14.6 EU Consumer Rights (Mandatory Carve-Out)</h3>
        <p>
          Nothing in this Section 14 limits or excludes rights granted to consumers under mandatory
          EU consumer protection law that cannot be waived by contract, including the right to
          access courts in your country of residence for mandatory consumer protection matters.
          However, where not prohibited by mandatory law, the requirements in Sections 14.1 and 14.2
          (good-faith negotiation and mediation) apply as prerequisites even for EU consumers.
        </p>
      </section>

      <section>
        <h2>15. Governing Law &amp; Jurisdiction</h2>
        <p>
          These Terms are governed by the substantive laws of Switzerland (excluding its conflict of
          law rules). Subject to Section 14, any dispute that proceeds to litigation shall be
          subject to the exclusive jurisdiction of the competent courts of the Canton of Zurich,
          Switzerland. EU consumers may also rely on mandatory consumer protection provisions
          applicable in their country of residence and may bring proceedings before their local
          courts for such mandatory matters.
        </p>
      </section>

      <section>
        <h2>16. Changes to These Terms</h2>
        <p>
          We may update these Terms as new features are added or legal requirements change. We will
          update the "Last updated" date at the top of this page. For material changes, we will
          notify registered users by email. Continued use of the Service after changes take effect
          constitutes your acceptance of the revised Terms.
        </p>
      </section>

      <section>
        <h2>17. Contact</h2>
        <p>
          For questions or concerns about these Terms, contact us at:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p className="text-muted-foreground text-sm">
          Note: This email address is temporary. It will be updated to a dedicated legal address
          once a custom domain is configured.
        </p>
      </section>
    </LegalLayout>
  );
}
