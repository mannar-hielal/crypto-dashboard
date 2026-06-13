# ⚖️ Pre-Launch Legal Readiness Checklist

## ✅ Phase 1: Free Launch (Current)
*Target: Minimal legal risk for a free, non-commercial paper trading tool.*

### 1. User Consent & Audit Trail
- [x] **Mandatory Agreement:** Registration form requires checkbox for Terms & Privacy.
- [x] **Audit Trail:** Capture `termsAcceptedAt` (ISO timestamp) and `termsAcceptedIp` in the `User` database model.
- [x] **No Advice Disclaimer:** Prominent "No Financial Advice" warning on registration and footer.

### 2. Precise Document Updates
- [x] **Strengthen "Free" Language:** Clarify service is a free tool provided for educational purposes.
- [x] **Explicit Liability Cap:** Set a low liability cap (e.g., CHF 100).
- [x] **Data Specifics:** Update Privacy Policy to explicitly name `localStorage` keys used (`cd-paper-trading`, etc.) and clarify they are device-local only.
- [x] **Disclose Audit Logging:** Privacy Policy must mention the capture of IP and timestamp for legal proof of agreement.

### 3. Transparency & Cookies
- [x] **Strictly Necessary Only:** Confirm no Google Analytics, FB Pixels, or marketing cookies are present.
- [x] **Cookie Banner:** Minimalist footer banner disclosing session cookie and localStorage usage (GDPR/nDSG requirement).

---

## 🟡 Significant — Complete before or at launch

### 5. Explicitly Disclose GDPR User Rights in Terms / Privacy Policy

**Risk**: §9 of the current Terms says "we comply with GDPR" but does not enumerate user rights.
Under GDPR Articles 15–22, users are legally entitled to exercise these rights and you must tell
them they have them.

**Rights that must be disclosed and honoured**:

| Right | Article | What it means in practice |
|---|---|---|
| Right of access | Art. 15 | User can request all data you hold on them |
| Right to erasure | Art. 17 | User can request deletion of account and all associated data |
| Right to portability | Art. 20 | User can request their data in machine-readable format (JSON/CSV) |
| Right to rectification | Art. 16 | User can correct inaccurate personal data |
| Right to object | Art. 21 | User can object to certain types of processing |
| Right to restrict processing | Art. 18 | User can request processing be paused |

**Action**:
- Add a "Your Rights" section to the Privacy Policy listing all six rights with a contact method
- Build a "Delete my account" flow into the app (cannot be email-only for GDPR compliance)
- Define and document your **data retention period** after account deletion

---

### 6. Add Account Termination Clause

**Risk**: The current Terms must define what happens to a user's account when terminated for violations or abuse.

**Required terms**:
- Grounds on which you can terminate (Terms violation, abuse)
- Notice period before termination (except for immediate termination for serious violations)
- What happens to the user's data after termination (retention period + deletion)
- User's right to export their data before termination takes effect

---

### 7. Add Force Majeure and Third-Party Dependency Clause

**Risk**: Your entire service depends on the Bybit API. If Bybit goes offline, changes terms, or revokes API access, the tool will become unavailable. 

**Action**:
- Add a force majeure clause covering third-party API failures, government actions, cyberattacks,
  infrastructure outages
- Add explicit language that functionality depends on third-party APIs and you make no warranty
  of uninterrupted availability

---

### 17. Version Both Legal Documents
**Risk**: Lack of versioning makes it difficult to prove which version of the Terms or Privacy Policy a user agreed to at a specific point in time.

**Action**:
- Update `LegalLayout.tsx` to accept a `version` prop.
- Display "Version X.Y" alongside "Last Updated".
- Pass `version="1.0"` from `TermsPage.tsx` and `PrivacyPage.tsx`.

---

### 18. Add Phase 3 Forward-Looking Warning
**File**: `apps/client/src/pages/PrivacyPage.tsx`

**Context**: Currently, the Privacy Policy states paper trading data is local-only. This will become false when Phase 3 (DB sync) launches.

**Action**: 
- Add a warning to §3 (Data Processing) table row for "Paper trade history".
- State that users will be notified before server-side sync becomes available.

---

### 19. Data Scraping Prohibition
**File**: `apps/client/src/pages/TermsPage.tsx`

**Risk**: Users might use the application's endpoints to scrape Bybit's market data.

**Action**: Add a clause to Section 7 (Prohibited Activities) specifically forbidding the use of automated tools to extract or scrape market data provided through the Service.

---

## 🟠 Notable — Address before or shortly after launch

### 8. Check Trademark Availability for "cryptopapertrade.com"

Run a search on [swissreg.ch](https://www.swissreg.ch) and
[euipo.europa.eu](https://euipo.europa.eu/eSearch) before any marketing or paid launch.
Consider a unique brand name with stronger trademark potential.

---

### 9. Add Fair Use & Anti-Scraping Policy
Add to Terms: 
- "The service is for personal, non-commercial use only. Sharing account credentials is prohibited."
- "Systematic extraction or scraping of market data via automated tools is strictly prohibited."

---

### 10. Clarify User Data Ownership
Add to Terms: "You retain ownership of content you create (journal entries, notes). By using the
Service, you grant cryptopapertrade.com a limited, non-exclusive license to store and display your
content solely for the purpose of providing the Service."

---

## 🔴 Critical — Resolved / Implemented

### 12. Terms Acceptance Checkbox at Registration (DONE)

**File:** `apps/client/src/pages/RegisterPage.tsx`
**Status:** ✅ Implemented June 2026. Required checkbox added to UI; timestamp and IP stored in DB.

---

### 13. Cookie / Storage Information Notice (DONE)

**File:** `apps/client/src/App.tsx`
**Status:** ✅ Implemented June 2026. `<CookieBanner />` component added to main app shell.

---

### 14. No Data Processing Agreements (DPAs) Signed With Sub-Processors

**File:** `apps/client/src/pages/PrivacyPage.tsx` (§10)

**Risk**: Privacy §10 lists Fly.io, Cloudflare, Resend as sub-processors and states you rely
on Standard Contractual Clauses (SCCs). **Claiming SCCs without actually having signed DPAs with
each processor is a GDPR Art. 28 violation.** EU DPAs are typically available in each provider's
legal portal.

**Action:**
- Fly.io: sign DPA at fly.io/legal/dpa
- Resend: sign DPA in the Resend dashboard (Settings → Legal)
- Cloudflare: sign DPA at cloudflare.com/gdpr/dpa
- Confirm Bybit receives no user PII (current code sends price-feed requests only — no user ID
  transmitted; this appears correct but should be re-verified before Phase 5)

---

### 15. Bybit API — Usage Compliance

**File:** `apps/server/src/routes/market/index.ts`

**Risk**: The server proxies Bybit's real-time mainnet market data. Bybit's API Terms typically restrict redistribution of market data. As a free, non-commercial tool, the risk is lower than a paid SaaS, but a fallback is still recommended.

**Action**:
- Ensure no market data is redistributed outside the platform.
- Consider a fallback data source (e.g. Binance public API, CoinGecko) so an outage of one
  provider doesn't kill the whole service.

---

### 16. Vague Server Log Retention Period (DONE)

**File:** `apps/client/src/pages/PrivacyPage.tsx` (§7)
**Status:** ✅ Implemented June 2026. Specific retention periods (30 days for Fly.io, 7 days for Cloudflare) added to Privacy Policy.

---

## 📋 Pre-Launch Checklist
```
Legal Entity
  ☐ Register GmbH (or equivalent legal entity) — Recommended for liability protection
  ☐ Update Terms, LICENSE, and all legal docs to reference entity name
  ☐ Engage Treuhänder for accounting and compliance (if applicable)

Terms of Use — Missing Clauses
  ☑ Add Terms/Privacy acceptance checkbox to RegisterPage.tsx (§12 — CRITICAL)
  ☑ Store termsAcceptedAt timestamp in User model / schema.prisma (§12)
  ☑ Add Force Majeure clause (§7)
  ☑ Add Account Termination clause (§6)
  ☑ Add Fair Use & Anti-Scraping clause (§9, §19)
  ☑ Add User Data Ownership clause (§10)
  ☑ Update contact email to info@cryptopapertrade.com
  ☑ Add `version` prop to `LegalLayout.tsx` (§17)

Privacy Policy — Missing Disclosures
  ☑ Add localStorage bullet to Privacy §8 (cd-paper-trading, cd-layout, cd-paper-col-prefs)
  ☑ Add Phase 3 forward-looking note to Privacy §3 (paper trade history row) (§18)
  ☑ Update server log retention to concrete periods in Privacy §7 (§16)
  ☑ Define data retention period after account deletion (§5)
  ☑ "Your Rights" section present (GDPR Art. 15–22) — Privacy §11 (§5)

UI / Product
  ☑ Add cookie/storage information banner to App.tsx (§13 — CRITICAL)
  ☑ Build "Delete my account" flow in the app (GDPR Art. 17 — cannot be email-only) (§5)
  ☑ Build data export functionality (GDPR Art. 20 portability) (§5)

Third-Party / Data Processing
  ☐ Sign DPA with Fly.io (fly.io/legal/dpa) (§14)
  ☐ Sign DPA with Resend (Resend dashboard → Settings → Legal) (§14)
  ☐ Sign DPA with Cloudflare (cloudflare.com/gdpr/dpa) (§14)

Trademark
  ☐ Search swissreg.ch and EUIPO for conflicting marks
  ☐ Decide on final brand name with trademark potential
```

---

_Originally created: April 11, 2026 — full legal gap analysis of Terms of Use v2 and planned paid SaaS model._
_Updated: May 5, 2026 — full code-level legal review performed; sections 12–16 added; checklist expanded with new findings._
_Not a substitute for professional legal advice._
