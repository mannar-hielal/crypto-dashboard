import { LegalLayout } from '@/components/LegalLayout';
import { SeoHead } from '@/components/SeoHead';

const CONTACT_EMAIL = 'info@cryptopapertrade.com';

export function AcceptableUsePolicyPage() {
  return (
    <>
      <SeoHead
        title="Acceptable Use Policy"
        description="Acceptable use policy for cryptopapertrade.com paper trading platform."
        path="/aup"
      />
      <LegalLayout title="Acceptable Use Policy" lastUpdated="June 13, 2026" version="1.0">
        <section>
          <h2>1. Introduction</h2>
          <p>
            This Acceptable Use Policy ("Policy") outlines the rules and restrictions for using
            https://cryptopapertrade.com/ (the "Service"). Our goal is to ensure a safe, reliable,
            and fair environment for all users of our paper trading simulation platform.
          </p>
        </section>

        <section>
          <h2>2. Prohibited Activities</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>
              <strong>Violate Laws:</strong> Engage in any illegal activity or promote illegal acts.
            </li>
            <li>
              <strong>Abuse the System:</strong> Attempt to disrupt, hack, or bypass security
              measures, or perform any action that imposes an unreasonable load on our
              infrastructure (e.g., DDoS).
            </li>
            <li>
              <strong>Scrape Data:</strong> Use automated tools, scripts, or bots to systematically
              extract, scrape, mirror, or republish real-time or historical market data.
            </li>
            <li>
              <strong>Impersonate Others:</strong> Pretend to be another person, entity, or
              representative of cryptopapertrade.com.
            </li>
            <li>
              <strong>Distribute Malware:</strong> Upload or transmit viruses, worms, or any code of
              a destructive nature.
            </li>
            <li>
              <strong>Commercialise:</strong> Use the Service for commercial purposes, including
              selling access to the platform or using its data to train commercial AI models without
              authorisation.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Fair Use</h2>
          <p>
            As a free educational tool, we rely on users to use the platform fairly. This means:
          </p>
          <ul>
            <li>One account per person.</li>
            <li>No sharing of login credentials.</li>
            <li>
              No use of multiple accounts to manipulate simulation results or leaderboard metrics.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Reporting Abuse</h2>
          <p>
            If you encounter any user or activity that violates this Policy, please report it to us
            immediately at: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
          <p>
            As we use Cloudflare for edge protection, you may also refer to{' '}
            <a
              href="https://www.cloudflare.com/trust-hub/abuse-approach/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brand"
            >
              Cloudflare's Abuse Approach
            </a>{' '}
            for infrastructure-level concerns.
          </p>
        </section>

        <section>
          <h2>5. Enforcement</h2>
          <p>
            We reserve the right to investigate potential violations of this Policy. Failure to
            comply may result in:
          </p>
          <ul>
            <li>Temporary suspension of your account.</li>
            <li>Permanent termination of your account.</li>
            <li>Reporting of illegal activities to relevant law enforcement authorities.</li>
          </ul>
        </section>
      </LegalLayout>
    </>
  );
}
