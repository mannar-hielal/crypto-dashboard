# Legal & Compliance — Action Items

> Generated: 2026-05-02 · Validated: 2026-05-05
> Priority: Complete all **Critical** items before any public launch.

---

## 🔴 Critical — Fix Before Public Launch

### 1. Replace Contact Email Across All Legal Pages

**Files affected:**

- `apps/client/src/pages/TermsPage.tsx`
- `apps/client/src/pages/PrivacyPage.tsx`

**Current state:** Both files contain `adminwithu@gmail.com` as the GDPR data controller contact, dispute notice recipient, and user support address.

**Action:**

- Register a custom domain (e.g. `cryptodash.app` — ~$14/year on Namecheap)
- Set up a forwarding email: `legal@yourdomain.com`
- Replace the `CONTACT_EMAIL` constant in both files:

```ts
// Before
const CONTACT_EMAIL = 'adminwithu@gmail.com';

// After
const CONTACT_EMAIL = 'legal@yourdomain.com';
```

Also remove the `<p className="text-muted-foreground text-sm">Note: This email address is temporary...` disclaimer paragraphs from both pages once the real address is in place.

**Why:** A personal Gmail in public GDPR/nDSG legal documents is a compliance risk. The FDPIC and EU data protection authorities expect a stable, professional contact address. It is also a spam magnet.

---

### 2. Terms — Update Section 2 (Description of Service)

**File:** `apps/client/src/pages/TermsPage.tsx`

**Current state (line 32–34):**

```
The Service is currently offered during an early-access period. Subscription-based pricing
tiers will be introduced in a future release. Registered users will be notified of any
changes to the pricing model before they take effect.
```

This still reads as pre-launch / vaporware for subscriptions.

**Replacement at public launch:**

```
The Service is offered under a freemium model. A free tier is available to all registered
users. Optional paid subscription tiers providing access to additional features are
available. Registered users will be notified of any pricing changes before they take effect.
```

---

### 3. Privacy — Add Phase 3 Forward-Looking Warning (Section 3)

**File:** `apps/client/src/pages/PrivacyPage.tsx`

**Current state:** Section 3 table row for "Paper trade history" says it stays in `localStorage` only and is never transmitted to servers. This becomes a **false legal statement** the moment Phase 3 (DB sync) ships.

**Action:** Add a note below or inside the "Paper trade history" table row:

```tsx
<tr>
  <td>Paper trade history</td>
  <td>Displaying your simulated portfolio and order history</td>
  <td>
    Your browser's localStorage on your device only — not transmitted to or stored on our servers.
    Clearing your browser data will erase it.
    <br />
    <em>
      ⚠️ In a future update (Phase 3), paper trading state will be optionally synced to the server.
      Users will be notified by email before this change takes effect and will be given the choice
      to opt in.
    </em>
  </td>
</tr>
```

---

### 4. Privacy — Add localStorage Disclosure (Section 8)

**File:** `apps/client/src/pages/PrivacyPage.tsx`

**Current state:** Section 8 only lists the httpOnly cookie and in-memory access token. GDPR and ePrivacy require disclosure of **any** persistent storage on the user's device.

**localStorage keys currently used but undisclosed:**

| Key                  | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `cd-paper-trading`   | Paper trading state (positions, orders, balance) |
| `cd-layout`          | Chart layout preferences                         |
| `cd-paper-col-prefs` | Column picker preferences                        |

**Action:** Add a third bullet to Section 8 after the existing two:

```tsx
<li>
  <strong>Browser localStorage</strong>: used to store your paper trading state (virtual positions,
  orders, balance history), chart layout preferences, and column display preferences — all on your
  device only. This data never leaves your device or reaches our servers. You can clear it at any
  time through your browser settings (Clear Site Data).
</li>
```

---

## 🟡 Important — Fix Shortly After Launch

### 5. Terms — Add Data Scraping Prohibition (Section 7)

**File:** `apps/client/src/pages/TermsPage.tsx`

**Current state (line 94–105):** Section 7 prohibits bots for accounts but has no clause about market data extraction.

**Action:** Add to the `<ul>` in Section 7:

```tsx
<li>
  Use automated tools, scripts, or bots to systematically extract, scrape, mirror, or republish
  real-time or historical market data provided through the Service.
</li>
```

**Why:** Your server proxies Bybit's real-time feed. Without this clause, a user could use your endpoint as a free data feed with no recourse.

---

### 6. Version Both Legal Documents

**Files:**

- `apps/client/src/pages/TermsPage.tsx`
- `apps/client/src/pages/PrivacyPage.tsx`
- `apps/client/src/components/LegalLayout.tsx`

**Current state:** `LegalLayout` has no `version` prop. The interface only accepts `title`, `lastUpdated`, and `children`.

**Step 1 — Update `LegalLayout.tsx`:**

```tsx
interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  version?: string; // add this
  children: ReactNode;
}

// In the render, replace the lastUpdated line:
<p className="text-muted-foreground mt-2 text-sm">
  {version ? `Version ${version} — ` : ''}Last updated: {lastUpdated}
</p>;
```

**Step 2 — Pass version from both pages:**

```tsx
// TermsPage.tsx
<LegalLayout title="Terms of Use" lastUpdated="April 11, 2026" version="1.0">

// PrivacyPage.tsx
<LegalLayout title="Privacy Policy" lastUpdated="April 11, 2026" version="1.0">
```

**Why:** Makes it provable which version a user agreed to at registration — important in any future dispute.

---

### 7. Add Cookie Consent Notice (Minimal Banner)

**Current state:** No cookie/storage notice exists anywhere in the UI.

**Action:** Add a minimal first-visit informational banner — not a full GDPR consent wall. The session cookie is strictly necessary so no opt-in is required, only a notice.

Suggested UI copy:

> _"We use a single session cookie required for login. No tracking or advertising cookies are used."_ [OK]

**Implementation:**

- Store dismissal in `localStorage` key `cd-cookie-notice-dismissed`
- Show banner at bottom of screen on first visit
- Dismiss on click — never show again
- Suggested location: `App.tsx`, rendered conditionally based on the `localStorage` key

---

## 🔵 Future Actions

### 8. Consider Registering as Sole Trader (Einzelunternehmen)

**When:** Once subscription revenue begins.

**Why:** Gives you a formal legal identity for the data controller field in your privacy policy, cleaner Swiss tax reporting, and better legal standing for contracts and disputes. Simple registration in Switzerland, low cost.

**Current state:** `"Mannar Hielal, Switzerland"` data controller identification is correct and legally sufficient for early access with no paying users.

---

### 9. Update Privacy Section 3 Before Phase 3 Ships

Before Phase 3 (DB sync) is deployed to production:

- Update the "Paper trade history" row to reflect server-side storage
- Remove the forward-looking warning added in item #3 above
- Send email notification to all registered users **before** the change goes live

---

## 📋 Summary Checklist

### Before Public Launch (Critical)

- [ ] Register custom domain and set up `legal@yourdomain.com`
- [ ] Replace `adminwithu@gmail.com` in `TermsPage.tsx` and `PrivacyPage.tsx`
- [ ] Remove the "email is temporary" disclaimer paragraphs from both pages
- [ ] Update Terms Section 2 wording to reflect freemium launch state
- [ ] Add Phase 3 forward-looking warning to Privacy Section 3 table
- [ ] Add localStorage disclosure bullet to Privacy Section 8

### Shortly After Launch

- [ ] Add data scraping prohibition to Terms Section 7
- [ ] Add `version` prop to `LegalLayout.tsx`
- [ ] Pass `version="1.0"` in both `TermsPage.tsx` and `PrivacyPage.tsx`
- [ ] Add minimal cookie consent banner to UI

### Future

- [ ] Consider Einzelunternehmen registration when subscription revenue begins
- [ ] Update Privacy Policy Section 3 before Phase 3 (DB sync) ships
- [ ] Notify registered users by email before Phase 3 goes live

---

_Validated against current codebase on 2026-05-05. All items confirmed outstanding — none have been implemented yet._
