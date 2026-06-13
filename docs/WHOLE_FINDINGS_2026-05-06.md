# Whole Findings Report (Consolidated)

> Date: 2026-05-06
> Scope: Consolidated from `docs/LEGAL_COMPLIANCE.md`, `docs/PRE_LAUNCH_LEGAL.md`, and `docs/APP_LOG.md` (Legal & Compliance Status section).
> Purpose: Single-session handoff of what is clear, what is blocking, and what must be done before monetization.
> Note: Internal operational summary, not legal advice.

---

## 1) Executive Snapshot

- Current product posture is legally lower-risk while free-only (paper trading, no custody, no financial intermediation).
- Main blockers are contract enforceability at signup, privacy notice gaps, and paid-launch legal/tax readiness.
- Monetization adds immediate obligations: EU VAT OSS, paid Terms clauses, and Bybit commercial data rights confirmation.
- Most gaps are documentation + policy + small UI changes, not deep architecture rewrites.

---

## 2) What Is Already Clear

- Swiss financial-market licensing exposure appears low for the current paper-only model.
- Contact email has been standardized to `info@cryptopapertrade.com` in legal pages.
- GDPR user-rights section exists in Privacy policy.
- Legal-basis mapping exists in Privacy policy.
- No VAT/MWST is due yet while no paid users/revenue exist.

---

## 3) Critical Findings (Before First Paying User)

1. **Terms not incorporated at signup**  
   - Missing mandatory Terms/Privacy acceptance checkbox in registration flow.  
   - Files: `apps/client/src/pages/RegisterPage.tsx`, `apps/server/prisma/schema.prisma`.

2. **No cookie/storage information notice in UI**  
   - No first-visit banner despite cookie/localStorage usage.  
   - File: `apps/client/src/App.tsx`.

3. **Sub-processor DPA execution not confirmed**  
   - DPAs/SCC implementation must be completed for Fly.io, Resend, Cloudflare before paid processing at scale.

4. **Bybit commercial API/data rights not confirmed**  
   - Must confirm commercial redistribution/usage terms before selling access tied to Bybit-driven market data.  
   - File context: `apps/server/src/routes/market/index.ts`.

5. **EU VAT OSS not registered (Non-Union)**  
   - Required from first EU consumer sale for digital services.

6. **Paid-relationship legal clauses missing in Terms**  
   - Subscription, billing, cancellation, refunds, failed payment, pricing-change notice.
   - File: `apps/client/src/pages/TermsPage.tsx`.

7. **EU withdrawal-right clause + waiver flow missing**  
   - Terms and checkout waiver mechanism are not yet present.

8. **"Early access" wording still present in Terms §2**  
   - Conflicts with paid/freemium launch state and can create expectation risk.

---

## 4) Important Findings (Before or At Launch)

1. **Privacy policy storage disclosure incomplete**  
   - localStorage keys used by app are not fully disclosed in Privacy §8.  
   - File: `apps/client/src/pages/PrivacyPage.tsx`.

2. **Phase-3 data-storage transition warning missing**  
   - Current local-only statement needs forward-looking notice before DB sync phase.

3. **Server-log retention period is vague**  
   - Replace "provider defaults" with concrete retention periods.

4. **No force majeure / third-party dependency clause in Terms**  
   - Needed due to core dependency on external APIs.

5. **No paid-user account termination framework in Terms**  
   - Missing grounds/notice/data handling/refund handling details.

6. **No in-app self-service deletion flow yet**  
   - Product and compliance gap (email-only process is weak for expected GDPR operations).

7. **No legal entity formed yet**  
   - Personal liability remains until formal entity setup.

---

## 5) Future / Follow-On Findings

- Add anti-scraping / market-data extraction prohibition language in Terms.
- Add legal document versioning support in `apps/client/src/components/LegalLayout.tsx` and pass versions from legal pages.
- Register legal entity and align all legal docs/license to entity name when formed.
- Prepare and execute Phase-3 Privacy wording updates before server-side sync release.
- Trademark screening and final brand decision remain open.

---

## 6) Tax Trigger Points (Operational)

- **Now (free-only, no revenue):** no active VAT/MWST collection/remittance obligations.
- **First EU consumer payment:** register/use **EU VAT OSS (Non-Union)** and charge destination-country VAT.
- **Swiss turnover reaches CHF 100,000/year:** register for Swiss MWST.
- **UK sales growth:** verify UK VAT obligations based on UK revenue and nexus thresholds.

---

## 7) Prioritized Action Plan

### Immediate (this sprint)

- Add required Terms/Privacy acceptance checkbox to registration UI.
- Store acceptance timestamp (and supporting audit metadata) on user record.
- Add minimal cookie/storage notice banner in app shell.
- Update Terms §2 to freemium-ready wording (remove early-access language).
- Add missing Privacy §8 localStorage disclosure.

### Near-term (before first paid launch)

- Add full Subscription & Billing section to Terms.
- Add EU withdrawal-right section + checkout waiver mechanism.
- Add force majeure + third-party dependency + paid termination clauses.
- Define concrete server-log retention in Privacy §7.
- Complete DPA execution with Fly.io, Resend, Cloudflare.
- Confirm Bybit commercial API/data rights in writing.
- Prepare EU VAT OSS registration and VAT-ready checkout logic.

### Later (post-launch hardening)

- Add document versioning in legal UI.
- Implement in-app account deletion and export flows.
- Complete entity formation and migrate legal identity references.
- Add anti-scraping clause and continue policy hardening.

---

## 8) Fast Tracking Checklist

- [ ] Signup Terms/Privacy acceptance + persistence implemented
- [ ] Cookie/storage banner implemented
- [ ] Terms paid clauses + withdrawal + force majeure + termination added
- [ ] Privacy localStorage + concrete log retention updated
- [ ] DPAs signed (Fly.io, Resend, Cloudflare)
- [ ] Bybit commercial use confirmed
- [ ] EU VAT OSS readiness complete before first EU payment
- [ ] Legal entity roadmap scheduled

---

## 9) Source Documents

- `docs/LEGAL_COMPLIANCE.md`
- `docs/PRE_LAUNCH_LEGAL.md`
- `docs/APP_LOG.md` (Legal & Compliance Status)

