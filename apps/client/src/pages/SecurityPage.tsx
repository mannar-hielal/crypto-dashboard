import { LegalLayout } from '@/components/LegalLayout';
import { SeoHead } from '@/components/SeoHead';

const CONTACT_EMAIL = 'info@cryptopapertrade.com';

export function SecurityPage() {
  return (
    <>
      <SeoHead
        title="Security"
        description="Security practices and vulnerability disclosure for cryptopapertrade.com."
        path="/security"
      />
      <LegalLayout title="Security" lastUpdated="September 24, 2026" version="1.1">
        <section>
          <h2>Our Commitment to Security</h2>
          <p>
            At cryptopapertrade.com, we take the security of your account and data seriously. Even
            as a free educational tool, we implement professional-grade security practices to
            protect our users.
          </p>
        </section>

        <section>
          <h2>1. Data Protection</h2>
          <ul>
            <li>
              <strong>Encryption in Transit:</strong> All data transmitted between your browser and
              our servers is encrypted using industry-standard TLS (Transport Layer Security).
            </li>
            <li>
              <strong>Password Security:</strong> We never store passwords in plain text. We use
              <strong> argon2id</strong> (a memory-hard password hashing algorithm) to hash
              passwords before they reach our database.
            </li>
            <li>
              <strong>Session Integrity:</strong> We use secure, <code>httpOnly</code>, and
              <code>SameSite=Strict</code> cookies for session management to protect against
              Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF) attacks.
            </li>
            <li>
              <strong>Database Security:</strong> Paper trading and account data are stored in a
              PostgreSQL database. All database access goes through Prisma ORM using
              parameterized, prepared-statement queries — the same mechanism that protects the
              rest of the platform against SQL injection.
            </li>
          </ul>
        </section>

        <section>
          <h2>2. Infrastructure Security</h2>
          <ul>
            <li>
              <strong>Hosting:</strong> Our backend is hosted on <strong>Fly.io</strong>, which
              provides robust physical and network security.
            </li>
            <li>
              <strong>Edge Protection:</strong> We use <strong>Cloudflare</strong> for DDoS
              protection and as a Web Application Firewall (WAF). Cloudflare's security posture is
              detailed in their{' '}
              <a
                href="https://www.cloudflare.com/disclosure/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-brand"
              >
                Vulnerability Disclosure Policy
              </a>
              .
            </li>
            <li>
              <strong>Least Privilege:</strong> Our internal systems follow the principle of least
              privilege, ensuring that only necessary services have access to user data.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Responsible Disclosure</h2>
          <p>
            We welcome the help of the security community in keeping our users safe. If you believe
            you have found a security vulnerability in our platform, please report it to us
            responsibly.
          </p>
          <p>
            <strong>How to Report:</strong>
            <br />
            Email your findings to: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
          <p>
            Please include as much detail as possible, including steps to reproduce the issue. We
            ask that you give us a reasonable amount of time to respond and resolve the issue before
            disclosing it publicly.
          </p>
        </section>

        <section>
          <h2>4. User Responsibilities</h2>
          <p>Security is a shared responsibility. We recommend that you:</p>
          <ul>
            <li>Use a strong, unique password for your account.</li>
            <li>Never share your login credentials with others.</li>
            <li>Keep your browser and operating system updated.</li>
            <li>Immediately report any suspicious activity on your account.</li>
          </ul>
        </section>
      </LegalLayout>
    </>
  );
}
