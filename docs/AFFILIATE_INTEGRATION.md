# Bybit Affiliate Program — Integration Guide

> Generated: 2026-05-02 · Validated: 2026-05-05
> **Status:** Not yet implemented. `lib/constants.ts` does not exist. No affiliate links present anywhere in the codebase.

---

## Step 1 — Register for the Program (10 Minutes, Do This Week)

1. Go to [partner.bybit.com](https://partner.bybit.com)
2. Register using your existing Bybit account (Switzerland is eligible)
3. Wait 1–3 business days for approval
4. Copy your unique referral URL: `https://www.bybit.com/invite?ref=YOURCODE`

**Why now:** Register before you have any users so the link is ready the moment someone wants to go live. Bybit pays a percentage of trading fees from referred users — **for life**.

---

## Step 2 — Add Affiliate Constants to Codebase

**File to create:** `apps/client/src/lib/constants.ts`

```ts
// ─── Affiliate ──────────────────────────────────────────────────────────────
// 🔐 Never hardcode referral codes in multiple places.
// All affiliate links must import from here.

export const BYBIT_AFFILIATE_URL = 'https://www.bybit.com/invite?ref=YOURCODE';

// Deep link to a specific trading pair with referral code
export const getBybitPairUrl = (symbol: string) =>
  `https://www.bybit.com/trade/usdt/${symbol}?ref=YOURCODE`;
```

Replace `YOURCODE` with your actual referral code from partner.bybit.com after approval.

---

## Integration Point 1 — LIVE Button Modal (~2h)

**File:** `apps/client/src/components/dashboard/SymbolBar.tsx`

When a user clicks LIVE and has no Bybit account connected, show a modal instead of a placeholder:

```tsx
import { BYBIT_AFFILIATE_URL } from '@/lib/constants';

// Suggested modal content
<Modal title="Go Live with Real Trading">
  <p>
    Ready to trade with real money? Connect your Bybit account to execute real trades directly from
    cryptopapertrade.com.
  </p>
  <p className="text-muted text-sm">Don't have a Bybit account yet?</p>
  <a href={BYBIT_AFFILIATE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary">
    Create a Bybit Account →
  </a>
  <p className="text-xs text-muted">
    Phase 5 feature — live trading coming soon. Paper trading is available now.
  </p>
</Modal>;
```

**Why this converts:** The user has already chosen to click LIVE — they have intent. This is the highest-intent moment in the entire app.

---

## Integration Point 2 — TradingPanel Subtle Banner (~15 min)

**File:** `apps/client/src/components/dashboard/TradingPanel.tsx`

Add a subtle one-line link at the bottom of the trading panel, below the submit button, shown **only when in paper mode**:

```tsx
import { BYBIT_AFFILIATE_URL } from '@/lib/constants';

{
  /* Affiliate nudge — paper mode only */
}
<a
  href={BYBIT_AFFILIATE_URL}
  target="_blank"
  rel="noopener noreferrer"
  className="text-xs text-muted hover:text-primary transition-colors text-center block mt-2"
>
  Don't have a Bybit account? Create one and get a bonus →
</a>;
```

**Why this converts:** It's passive, non-intrusive, and visible during every trade. 15 minutes of work, permanent impression on every active session.

---

## Integration Point 3 — Post-Win Contextual Prompt (~3h)

**Files:** `apps/client/src/store/paperStore.ts` + your toast/notification component

This is the **highest-converting integration**. When a position closes with a positive `netPnl`, show a subtle prompt at the emotional peak — when the user is most excited about trading.

**Step 1 — Track the profitable close in the store:**

```ts
// In paperStore.ts, inside the closePosition action, after calculating netPnl:
if (netPnl > 0) {
  set((state) => ({
    ...state,
    lastProfitableClose: { netPnl, symbol },
  }));
}
```

**Step 2 — Show a toast when the flag is set:**

```tsx
import { getBybitPairUrl } from '@/lib/constants';

{
  lastProfitableClose && (
    <Toast variant="success">
      <span>Nice trade (+${lastProfitableClose.netPnl.toFixed(2)})</span>
      <a
        href={getBybitPairUrl(lastProfitableClose.symbol)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Ready to do this with real money? →
      </a>
    </Toast>
  );
}
```

**Why this converts:** You're catching the user at maximum confidence. The message is emotionally resonant, not salesy. The deep link goes directly to the pair they just "won" on.

---

## Integration Point 4 — Settings / Onboarding Section (~1h)

Add a "Live Trading" section to your Settings or onboarding flow:

```tsx
import { BYBIT_AFFILIATE_URL } from '@/lib/constants';

<section>
  <h3>Live Trading (Coming in Phase 5)</h3>
  <p>
    Connect your Bybit account to execute real trades directly from cryptopapertrade.com. Your funds stay in
    your Bybit account — cryptopapertrade.com never holds your money.
  </p>
  <a href={BYBIT_AFFILIATE_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary">
    Create a Bybit Account →
  </a>
</section>;
```

---

## Expected Revenue

Bybit pays affiliates a share of trading fees from referred users — for life.

| Referred active traders | Volume estimate | Estimated monthly commission |
| ----------------------- | --------------- | ---------------------------- |
| 10                      | Moderate        | CHF 200–800/month            |
| 50                      | Moderate        | CHF 1,000–4,000/month        |
| 100                     | Moderate        | CHF 2,000–8,000/month        |

These commissions are **passive and compounding** — every user you refer contributes indefinitely as long as they keep trading.

---

## 📋 Checklist

- [ ] Register at [partner.bybit.com](https://partner.bybit.com) _(do this week)_
- [ ] Copy referral code after approval
- [ ] Create `apps/client/src/lib/constants.ts` with `BYBIT_AFFILIATE_URL` and `getBybitPairUrl`
- [ ] Integration Point 1 — LIVE button modal (~2h)
- [ ] Integration Point 2 — TradingPanel subtle banner (~15min)
- [ ] Integration Point 3 — Post-win contextual prompt (~3h)
- [ ] Integration Point 4 — Settings/onboarding section (~1h)

---

_Validated against current codebase on 2026-05-05. `apps/client/src/lib/constants.ts` does not exist. No affiliate links present anywhere in the codebase._
