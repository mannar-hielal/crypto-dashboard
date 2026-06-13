import { LegalLayout } from '@/components/LegalLayout';

const CONTACT_EMAIL = 'info@cryptopapertrade.com';

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="June 13, 2026" version="1.0">
      <section>
        <h2>1. Data Controller</h2>
        <p>
          The data controller responsible for your personal data is:
          <br />
          <strong>Mannar Hielal</strong>
          <br />
          Switzerland
          <br />
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>

      <section>
        <h2>2. Applicable Law</h2>
        <p>
          We process your personal data in accordance with the{' '}
          <strong>Swiss Federal Act on Data Protection (nDSG)</strong>, which came into force on
          September 1, 2023. Where you are located in the European Union or the European Economic
          Area, the <strong>EU General Data Protection Regulation (GDPR)</strong> also applies.
        </p>
      </section>

      <section>
        <h2>3. What We Collect</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Why we collect it</th>
              <th>How it's stored</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Email address</td>
              <td>Account identification, password reset emails</td>
              <td>Plain text in database</td>
            </tr>
            <tr>
              <td>Username</td>
              <td>Display name within the platform</td>
              <td>Plain text in database</td>
            </tr>
            <tr>
              <td>Password</td>
              <td>Account authentication</td>
              <td>argon2id hash — never stored in plain text</td>
            </tr>
            <tr>
              <td>Legal Audit Log</td>
              <td>Proof of agreement to Terms of Use (for legal compliance)</td>
              <td>IP address and Timestamp stored in database upon registration</td>
            </tr>
            <tr>
              <td>Refresh tokens</td>
              <td>Maintaining login sessions</td>
              <td>SHA-256 hash in database, 7-day TTL, then auto-deleted</td>
            </tr>
            <tr>
              <td>Paper trade history</td>
              <td>Displaying your simulated portfolio and order history</td>
              <td>
                Your browser's localStorage on your device only — not transmitted to or stored on
                our servers. Clearing your browser data will erase it.
                <br />
                <em>
                  ⚠️ In a future update (Phase 3), paper trading state will be optionally synced to
                  the server. Users will be notified by email before this change takes effect and
                  will be given the choice to opt in.
                </em>
              </td>
            </tr>
            <tr>
              <td>Server access logs</td>
              <td>Security monitoring, abuse prevention</td>
              <td>
                IP address + request metadata — retained for 30 days (Fly.io) or 7 days
                (Cloudflare). See Section 7 for details.
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>4. What We Do NOT Collect</h2>
        <ul>
          <li>Real financial data or payment information of any kind</li>
          <li>Social media profiles or third-party login data</li>
          <li>Device fingerprints or persistent tracking identifiers</li>
          <li>Advertising or marketing cookies</li>
          <li>Location data beyond what your IP address may suggest</li>
        </ul>
      </section>

      <section>
        <h2>5. Legal Basis for Processing</h2>
        <p>Under GDPR Article 6 and nDSG, we rely on the following legal bases:</p>
        <ul>
          <li>
            <strong>Contract performance (Art. 6(1)(b) GDPR)</strong>: authentication, session
            management, paper trade history, password reset.
          </li>
          <li>
            <strong>Legal obligation (Art. 6(1)(c) GDPR)</strong>: maintaining proof of your
            acceptance of our legal terms (capturing IP and timestamp).
          </li>
          <li>
            <strong>Legitimate interest (Art. 6(1)(f) GDPR)</strong>: security logging, abuse
            prevention, platform stability.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. How We Use Your Data</h2>
        <ul>
          <li>To authenticate you and maintain your session securely.</li>
          <li>To display your paper trading history and virtual portfolio.</li>
          <li>To send transactional emails (password reset only — no marketing emails).</li>
          <li>To detect and prevent abuse, fraud, or unauthorised access.</li>
        </ul>
        <p>
          <strong>
            We do not sell, rent, share, or use your data for advertising or marketing.
          </strong>
        </p>
      </section>

      <section>
        <h2>7. Data Retention</h2>
        <ul>
          <li>
            <strong>Account data</strong>: retained for as long as your account is active. Upon
            receiving a deletion request via the in-app flow, your account enters a 30-day
            cancellation window during which you retain full access and can cancel at any time.
            After 30 days with no cancellation, your account and all associated personal data are
            permanently and irreversibly deleted. Some encrypted or technical backup data and
            security logs may persist for up to <strong>60 days</strong> before being purged or
            overwritten. Aggregated or anonymised statistical data that cannot identify you
            individually may be retained beyond this period.
          </li>
          <li>
            <strong>Refresh tokens</strong>: automatically expire and are deleted after 7 days.
          </li>
          <li>
            <strong>Password reset tokens</strong>: automatically invalidated after use or after 1
            hour, whichever comes first.
          </li>
          <li>
            <strong>Application server logs (Fly.io)</strong>: retained for <strong>30 days</strong>{' '}
            in Fly.io's built-in monitoring system, after which they are automatically purged. We do
            not operate a custom log archive.
          </li>
          <li>
            <strong>Edge / CDN logs (Cloudflare)</strong>: retained for <strong>7 days</strong> on
            Cloudflare's infrastructure per their standard log retention policy. We do not export or
            store these logs independently.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Cookies &amp; Browser Storage</h2>
        <p>We use the following and nothing else:</p>
        <ul>
          <li>
            <strong>httpOnly session cookie</strong>: stores your refresh token. It is not
            accessible by JavaScript, is scoped to this domain only, and has a 7-day lifetime. This
            is required for you to stay logged in.
          </li>
          <li>
            <strong>In-memory access token</strong>: your short-lived access token (15 minutes) is
            stored in browser memory only — never in localStorage or sessionStorage.
          </li>
          <li>
            <strong>localStorage (device-local, never transmitted)</strong>: we store the following
            keys in your browser's localStorage solely to preserve your UI preferences and paper
            trading simulation state across sessions:
            <ul>
              <li>
                <code>cd-paper-trading</code> — your virtual positions, order history, and simulated
                account balance.
              </li>
              <li>
                <code>cd-layout</code> — your saved dashboard panel layout.
              </li>
              <li>
                <code>cd-paper-col-prefs</code> — your column visibility preferences in the trading
                tables.
              </li>
              <li>
                <code>cd-cookie-notice-dismissed</code> — a simple flag to remember that you have
                dismissed the cookie information banner.
              </li>
            </ul>
            This data exists entirely on your device. Clearing your browser data or using a
            different device will erase it. It is never sent to our servers.
          </li>
        </ul>
        <p>
          We do not use advertising cookies, analytics cookies, or any third-party tracking scripts.
        </p>
      </section>

      <section>
        <h2>9. Third-Party Data Processors</h2>
        <p>
          We use the following sub-processors who may have access to your data as part of providing
          the Service:
        </p>
        <table>
          <thead>
            <tr>
              <th>Processor</th>
              <th>Purpose</th>
              <th>Location</th>
              <th>Privacy Policy</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Fly.io</td>
              <td>Backend server hosting</td>
              <td>EU / US</td>
              <td>
                <div className="flex flex-col gap-1">
                  <a
                    href="https://fly.io/legal/privacy-policy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand"
                  >
                    Privacy Policy
                  </a>
                  <a
                    href="https://fly.io/legal/terms-of-service/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand"
                  >
                    Terms of Service
                  </a>
                  <a
                    href="https://fly.io/legal/acceptable-use-policy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand"
                  >
                    Acceptable Use Policy
                  </a>
                </div>
              </td>
            </tr>
            <tr>
              <td>Cloudflare</td>
              <td>Frontend CDN, DDoS protection</td>
              <td>Global</td>
              <td>
                <div className="flex flex-col gap-1">
                  <a
                    href="https://www.cloudflare.com/policies/privacy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand"
                  >
                    Privacy Policy
                  </a>
                  <a
                    href="https://www.cloudflare.com/policies/terms/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand"
                  >
                    Terms of Service
                  </a>
                  <a
                    href="https://www.cloudflare.com/disclosure/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand"
                  >
                    Disclosure
                  </a>
                  <a
                    href="https://www.cloudflare.com/trust-hub/abuse-approach/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand"
                  >
                    Abuse Policy
                  </a>
                </div>
              </td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>Transactional email (password reset)</td>
              <td>US</td>
              <td>
                <a
                  href="https://resend.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  resend.com/legal/privacy-policy
                </a>
              </td>
            </tr>
            <tr>
              <td>Bybit</td>
              <td>Real-time market data (mainnet — price feed only, no user data transmitted)</td>
              <td>Global</td>
              <td>
                <div className="flex flex-col gap-1">
                  <a
                    href="https://www.bybit.com/en/legal/policies-and-rules/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand"
                  >
                    Privacy Policy
                  </a>
                  <a
                    href="https://www.bybit.com/en/legal/terms-of-service/terms-of-service"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand"
                  >
                    Terms of Service
                  </a>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>10. International Data Transfers</h2>
        <p>
          Your data may be processed in the United States and other countries by our hosting
          providers (Fly.io, Cloudflare, Resend). For EU residents, we rely on Standard Contractual
          Clauses (SCCs) or equivalent safeguards recognised under GDPR Chapter V to legitimise
          these transfers. Switzerland recognises the EU as a country with an adequate level of data
          protection for the purpose of international transfers under the nDSG.
        </p>
      </section>

      <section>
        <h2>11. Your Rights</h2>
        <p>
          Under GDPR (for EU/EEA residents) and nDSG (for Swiss residents), you have the following
          rights:
        </p>
        <ul>
          <li>
            <strong>Right of access</strong>: request a copy of the personal data we hold about you.
          </li>
          <li>
            <strong>Right to rectification</strong>: correct inaccurate or incomplete data.
          </li>
          <li>
            <strong>Right to erasure</strong>: request deletion of your account and all associated
            personal data ("right to be forgotten").
          </li>
          <li>
            <strong>Right to data portability</strong>: receive your data in a structured,
            machine-readable format.
          </li>
          <li>
            <strong>Right to object</strong>: object to processing based on legitimate interest.
          </li>
          <li>
            <strong>Right to restriction</strong>: request that we restrict processing of your data
            in certain circumstances.
          </li>
        </ul>
        <p>
          To exercise any of these rights, email us at:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will respond within 30 days.
        </p>
      </section>

      <section>
        <h2>12. Complaints</h2>
        <p>
          If you believe we have not handled your data lawfully, you have the right to lodge a
          complaint with:
        </p>
        <ul>
          <li>
            <strong>Switzerland</strong>: Federal Data Protection and Information Commissioner
            (FDPIC) —{' '}
            <a href="https://www.edoeb.admin.ch" target="_blank" rel="noopener noreferrer">
              edoeb.admin.ch
            </a>
          </li>
          <li>
            <strong>EU residents</strong>: the data protection authority in your country of
            residence.
          </li>
        </ul>
        <p>We would, however, appreciate the opportunity to address your concern directly first.</p>
      </section>

      <section>
        <h2>13. Changes to This Policy</h2>
        <p>
          We will update the "Last updated" date whenever this policy changes. For material changes,
          we will notify registered users by email. Continued use of the Service after changes
          constitutes your acceptance of the revised policy.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          Data Controller: <strong>Mannar Hielal</strong>, Switzerland
          <br />
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>
    </LegalLayout>
  );
}
