import { Link } from 'react-router';
import { LegalLayout } from '@/components/LegalLayout';

const CONTACT_EMAIL = 'info@cryptopapertrade.com';

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="June 13, 2026" version="1.0">
      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using https://cryptopapertrade.com/ ("the Service", "we", "us"), you agree
          to be bound by these Terms of Use and our <Link to="/privacy">Privacy Policy</Link>. If
          you do not agree, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>
          https://cryptopapertrade.com/ is a <strong>paper trading simulation platform</strong> that
          provides professional-grade charting and order management tools using real-time price data
          from the Bybit API. All trading activity on this platform is simulated using virtual
          currency.
        </p>
        <p>
          <strong>
            No real cryptocurrency or fiat money is ever exchanged, deposited, or withdrawn through
            this Service.
          </strong>
        </p>
        <p>
          The Service is provided <strong>free of charge</strong> for educational and research
          purposes. While we strive to keep the platform accessible, we reserve the right to modify
          or discontinue features at any time.
        </p>
      </section>

      <section>
        <h2>3. Eligibility</h2>
        <ul>
          <li>You must be at least 18 years old to use this Service.</li>
          <li>
            The Service is for <strong>personal, non-commercial use only</strong>. Sharing account
            credentials is prohibited and may result in immediate termination.
          </li>
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
        <p>
          Your use of the Service is subject to our{' '}
          <Link to="/aup" className="underline hover:text-brand">
            Acceptable Use Policy
          </Link>
          . In addition and without limitation, you agree not to:
        </p>
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
          <li>
            Use automated tools, scripts, or bots to systematically extract, scrape, mirror, or
            republish real-time or historical market data provided through the Service.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Intellectual Property & User Content</h2>
        <p>
          All code, design, content, and assets produced by this project are the exclusive
          proprietary property of Mannar Hielal. All rights reserved. No part of the Service may be
          copied, reproduced, modified, distributed, or sublicensed without the express prior
          written permission of Mannar Hielal. Real-time price data is provided by Bybit and is
          subject to{' '}
          <a
            href="https://www.bybit.com/en/legal/terms-of-service/terms-of-service"
            target="_blank"
            rel="noopener noreferrer"
          >
            Bybit's Terms of Service
          </a>
          .
        </p>
        <p>
          <strong>User Content Ownership:</strong> You retain ownership of any content you create
          within the Service (such as trading journal entries or notes). By using the Service, you
          grant cryptopapertrade.com a limited, non-exclusive, worldwide, royalty-free license to
          store, host, and display your content solely for the purpose of providing the Service to
          you.
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
        <p>
          Under GDPR (EU/EEA residents) and nDSG (Swiss residents), you have legally enforceable
          rights over your personal data, including the right to access, correct, delete, and port
          your data, as well as the right to object to certain processing. These rights are fully
          described in <Link to="/privacy">Privacy Policy §11 — Your Rights</Link>, together with
          instructions on how to exercise them. We will respond to any valid request within{' '}
          <strong>30 calendar days</strong>.
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
          USE OF THE SERVICE. AS THE SERVICE IS CURRENTLY PROVIDED AT NO COST TO YOU FOR EDUCATIONAL
          PURPOSES, OUR MAXIMUM AGGREGATE LIABILITY TO YOU SHALL NOT EXCEED <strong>CHF 100</strong>
          .
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
      </section>

      <section>
        <h2>18. Account Termination</h2>
        <p>
          We reserve the right to suspend or terminate your access to the Service at our sole
          discretion, without notice, for conduct that we believe violates these Terms of Use or is
          harmful to other users of the Service, us, or third parties, or for any other reason.
        </p>
        <ul>
          <li>
            <strong>Grounds for Termination:</strong> Material breach of these Terms, abuse of the
            platform, or any attempt to disrupt the Service.
          </li>
          <li>
            <strong>Deletion Window:</strong> Upon requesting account deletion or upon termination
            of an account, your data will enter a <strong>30-day deletion window</strong> as
            specified in our Privacy Policy. During this window, you may request a data export
            unless your account was terminated for illegal activity.
          </li>
          <li>
            <strong>Data Export:</strong> Upon termination, you retain the right to request exports
            of your data as described in our Privacy Policy, provided your account was not
            terminated for fraudulent or illegal activity.
          </li>
        </ul>
      </section>

      <section>
        <h2>19. Force Majeure & Third-Party Dependencies</h2>
        <p>
          <strong>Third-Party APIs:</strong> Our Service integrates with and depends on third-party
          Application Programming Interfaces (APIs), primarily from Bybit for market data. You
          acknowledge that we have no control over the availability, accuracy, or stability of these
          third-party services. We make no warranty that the Service will be uninterrupted if these
          third parties experience outages or change their terms of access.
        </p>
        <p>
          <strong>Force Majeure:</strong> Mannar Hielal shall not be liable for any failure or delay
          in performance due to circumstances beyond our reasonable control, including but not
          limited to: acts of God, government actions, cyberattacks (DDoS), power outages, or
          infrastructure failures by hosting providers (Fly.io, Cloudflare).
        </p>
      </section>
    </LegalLayout>
  );
}
