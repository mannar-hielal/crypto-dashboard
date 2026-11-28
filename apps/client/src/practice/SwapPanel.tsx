/**
 * The practice wallet and swap (chapter 2's practical stop after Lesson 9; owner's visual Q&A
 * 2026-11-28): docked where the order form sits (full screen on a phone), two tabs, App and Wallet,
 * and the wallet's request as a sheet rising over the dimmed panel. The tour's ring and bubble walk
 * the learner through it (guide/tours.ts).
 *
 * 🔐 Simulation only: no wallet connection, no network call, no key, and no field that takes text, so
 * nothing can ask for or accept an address or a recovery phrase. It never touches the paper account.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { guide } from '@/lib/guideAnchors';
import { NETWORK_FEE_ETH, POOL_FEE_RATE, quoteSwap, SWAP_AMOUNTS } from './swapMath';
import {
  APP_NAMES,
  isOpen,
  useSwapStore,
  type Allowance,
  type AppId,
  type SwapTab,
  type WalletRequest,
} from './swapStore';
import styles from './SwapPanel.module.css';

/** How long the pretend block takes */
export const BLOCK_WAIT_MS = 1500;

const usdc = (n: number) => `${n.toFixed(2)} USDC`;
const eth = (n: number) => `${n.toFixed(4)} ETH`;
const percent = (share: number) => `${(share * 100).toFixed(2)}%`;
const NETWORK_FEE_LINE = `about ${eth(NETWORK_FEE_ETH)}`;

const TABS: readonly { id: SwapTab; label: string }[] = [
  { id: 'app', label: 'App' },
  { id: 'wallet', label: 'Wallet' },
];

function allowanceWords(allowance: Allowance, revoked: boolean): string {
  if (revoked) return 'Revoked: it cannot take your USDC';
  if (allowance === 'unlimited') return 'May take your USDC: no limit';
  if (allowance === 0) return 'Used up: it cannot take your USDC';
  return `May take up to ${usdc(allowance)}`;
}

/** One line of figures: a name and its value */
function Row({ name, value }: { name: string; value: string }) {
  return (
    <div className={styles.row}>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AppView() {
  const connected = useSwapStore((s) => s.connected);
  const amount = useSwapStore((s) => s.amount);
  const request = useSwapStore((s) => s.request);
  const phase = useSwapStore((s) => s.phase);
  const receipt = useSwapStore((s) => s.receipt);
  const { connect, setAmount, review } = useSwapStore.getState();
  const quote = quoteSwap(amount);

  if (!connected) {
    return (
      <div className={styles.card}>
        <h3 className={styles.title}>{APP_NAMES.swap}</h3>
        <p className={styles.text}>A made-up app for swapping USDC for ETH.</p>
        <button
          type="button"
          className={styles.primary}
          onClick={connect}
          {...guide('swap.connect')}
        >
          Connect practice wallet
        </button>
      </div>
    );
  }

  if (phase !== 'idle' && receipt) {
    return (
      <div className={styles.card}>
        <h3 className={styles.title}>{APP_NAMES.swap}</h3>
        <p className={styles.status} role="status" {...guide('swap.status')}>
          {phase === 'waiting' ? (
            'Waiting for a block…'
          ) : (
            <>
              <Check size={16} aria-hidden="true" className={styles.ok} /> Confirmed: you got{' '}
              {eth(receipt.get)} for {usdc(receipt.pay)}.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card} {...guide('swap.offer')}>
      <h3 className={styles.title}>{APP_NAMES.swap}</h3>
      <fieldset className={styles.choices} disabled={request !== null} {...guide('swap.amounts')}>
        <legend>You pay (USDC)</legend>
        {SWAP_AMOUNTS.map((value) => (
          <label key={value} className={styles.choice} {...guide('swap.amount', String(value))}>
            <input
              type="radio"
              name="swap-amount"
              checked={amount === value}
              onChange={() => setAmount(value)}
            />
            {value}
          </label>
        ))}
      </fieldset>
      <div className={styles.offer}>
        <dl className={styles.figures}>
          <Row name="You get" value={`≈ ${eth(quote.get)}`} />
          <Row name={`Pool fee (${percent(POOL_FEE_RATE)})`} value={usdc(quote.poolFee)} />
          <Row name="Price impact" value={percent(quote.priceImpact)} />
          <Row name="Minimum you get" value={eth(quote.minimum)} />
          {/* The permission and the swap are two transactions */}
          <Row name="Network fees" value={`2 × ${eth(NETWORK_FEE_ETH)}`} />
        </dl>
        <button
          type="button"
          className={styles.primary}
          disabled={request !== null}
          onClick={review}
          {...guide('swap.review')}
        >
          Review swap
        </button>
      </div>
    </div>
  );
}

function WalletView() {
  const connected = useSwapStore((s) => s.connected);
  const usdcBalance = useSwapStore((s) => s.usdc);
  const ethBalance = useSwapStore((s) => s.eth);
  const allowances = useSwapStore((s) => s.allowances);
  const revoked = useSwapStore((s) => s.revoked);
  const receipt = useSwapStore((s) => s.receipt);
  const phase = useSwapStore((s) => s.phase);
  const request = useSwapStore((s) => s.request);
  const askRevoke = useSwapStore.getState().askRevoke;
  // The app in use first, so the tour's ring lands on its permission when it is still open
  const apps = (['swap', 'game'] as const).filter((app) => allowances[app] !== undefined);

  return (
    <>
      <div className={styles.card} {...guide('swap.balances')}>
        <h3 className={styles.title}>Practice wallet</h3>
        <dl className={styles.figures}>
          <Row name="USDC" value={usdcBalance.toFixed(2)} />
          <Row name="ETH" value={ethBalance.toFixed(4)} />
        </dl>
        <p className={styles.note}>
          {connected ? 'Connected to the practice app' : 'Not connected'}
        </p>
      </div>
      {phase === 'done' && receipt && (
        <div className={styles.card} {...guide('swap.receipt')}>
          <h3 className={styles.title}>Your swap</h3>
          <dl className={styles.figures}>
            <Row name="Paid" value={usdc(receipt.pay)} />
            <Row name="Got" value={eth(receipt.get)} />
            <Row name="Pool fee" value={usdc(receipt.poolFee)} />
            <Row name="Price impact" value={percent(receipt.priceImpact)} />
            <Row name="Network fees" value={eth(receipt.networkFees)} />
          </dl>
          <p className={styles.note}>
            Practice fees are all the same. In real life a swap usually costs more.
          </p>
        </div>
      )}
      <div className={styles.card} {...guide('swap.permissions')}>
        <h3 className={styles.title}>Permissions</h3>
        <ul className={styles.permissions}>
          {apps.map((app: AppId) => {
            const allowance = allowances[app]!;
            return (
              <li key={app}>
                <strong>{APP_NAMES[app]}</strong>
                <span>{allowanceWords(allowance, revoked.includes(app))}</span>
                {app === 'game' && (
                  <span className={styles.note}>An old permission, given earlier (pretend).</span>
                )}
                {isOpen(allowance) && (
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={request !== null}
                    onClick={() => askRevoke(app)}
                    aria-label={`Revoke ${APP_NAMES[app]}’s permission`}
                    {...guide('swap.revoke', app)}
                  >
                    Revoke
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

// What Tab stops on: of a radio group, only the checked one
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type="radio"]:not(:checked))';

function requestWords(request: WalletRequest): string {
  if (request.kind === 'approve')
    return `${APP_NAMES.swap} asks permission to use your USDC. How much may it take?`;
  if (request.kind === 'swap')
    return `Swap ${usdc(request.quote.pay)} for about ${eth(request.quote.get)}, and at least ${eth(request.quote.minimum)}. If the price moves further, the swap fails.`;
  return `Remove ${APP_NAMES[request.app]}’s permission to use your USDC.`;
}

interface RequestSheetProps {
  request: WalletRequest;
  /** Takes the focus when the sheet closes and the button that opened it is gone */
  fallback: RefObject<HTMLElement | null>;
}

/**
 * The wallet's request, rising at once over the dimmed panel (owner 2026-11-28): its own dialog, Tab
 * kept inside, Esc says no
 */
function RequestSheet({ request, fallback }: RequestSheetProps) {
  const rejected = useSwapStore((s) => s.rejected);
  const limit = useSwapStore((s) => s.limit);
  // A no to the swap leaves the permission signed just before it
  const permitted = useSwapStore((s) => isOpen(s.allowances.swap));
  const { sign, reject, askAgain, setLimit, dismiss } = useSwapStore.getState();
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // The button that asked, read before the sheet takes the focus
  const [opener] = useState(() => document.activeElement);

  // Each new request (and the "you said no" line) takes the focus, so it is read from the top
  useEffect(() => {
    titleRef.current?.focus();
  }, [request.kind, rejected]);

  // Closing: back to that button if it is still there, else to the panel's heading
  useEffect(() => {
    const spare = fallback.current;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) {
        opener.focus();
      } else {
        spare?.focus();
      }
    };
  }, [opener, fallback]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // The request's own Esc: the tour under it stays
      e.stopPropagation();
      reject();
      return;
    }
    // Once refused, nothing is waiting: Tab may leave, to the guide's bubble or the panel's ✕
    if (e.key !== 'Tab' || rejected || !sheetRef.current) return;
    const items = [...sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === titleRef.current || at === sheetRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.dim}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        {...guide('swap.request')}
      >
        <h3 id={titleId} ref={titleRef} tabIndex={-1} className={styles.title}>
          Your wallet asks
        </h3>
        {rejected ? (
          <>
            <p className={styles.status} role="status">
              <X size={16} aria-hidden="true" className={styles.no} /> Rejected: this request did
              nothing.
              {request.kind === 'swap' && permitted
                ? ' The permission you signed before is still there.'
                : ''}{' '}
              Saying no is always allowed.
            </p>
            <button
              type="button"
              className={styles.secondary}
              onClick={askAgain}
              {...guide('swap.ask-again')}
            >
              Show the request again
            </button>
            {/* A revoke is the learner's own idea: saying no may put it away */}
            {request.kind === 'revoke' && (
              <button
                type="button"
                className={styles.secondary}
                onClick={dismiss}
                {...guide('swap.dismiss')}
              >
                Close
              </button>
            )}
          </>
        ) : (
          <>
            <p className={styles.text}>{requestWords(request)}</p>
            {request.kind === 'approve' && (
              <fieldset className={styles.choices}>
                <legend>Limit</legend>
                <label className={styles.choice} {...guide('swap.limit', 'exact')}>
                  <input
                    type="radio"
                    name="swap-limit"
                    checked={limit === 'exact'}
                    onChange={() => setLimit('exact')}
                  />
                  Only {request.amount} USDC
                </label>
                <label className={styles.choice} {...guide('swap.limit', 'unlimited')}>
                  <input
                    type="radio"
                    name="swap-limit"
                    checked={limit === 'unlimited'}
                    onChange={() => setLimit('unlimited')}
                  />
                  No limit
                </label>
              </fieldset>
            )}
            {request.kind === 'approve' && (
              <p className={styles.note}>No limit: the app can take all your USDC, now or later.</p>
            )}
            <p className={styles.note}>Network fee: {NETWORK_FEE_LINE}</p>
            <div className={styles.answers}>
              <button
                type="button"
                className={styles.secondary}
                onClick={reject}
                {...guide('swap.reject')}
              >
                Reject
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={sign}
                {...guide('swap.sign')}
              >
                Sign
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function SwapPanel({ onClose }: { onClose: () => void }) {
  const tab = useSwapStore((s) => s.tab);
  const request = useSwapStore((s) => s.request);
  const rejected = useSwapStore((s) => s.rejected);
  const phase = useSwapStore((s) => s.phase);
  const connected = useSwapStore((s) => s.connected);
  const { setTab, confirm } = useSwapStore.getState();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wants = request !== null && !rejected;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // The Connect button is gone once pressed: the heading takes the focus it held
  useEffect(() => {
    if (connected) headingRef.current?.focus();
  }, [connected]);

  // The pretend block
  useEffect(() => {
    if (phase !== 'waiting') return;
    const timer = window.setTimeout(confirm, BLOCK_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, confirm]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = tab === 'app' ? 'wallet' : 'app';
    setTab(next);
    const list = e.currentTarget.parentElement;
    list?.querySelector<HTMLButtonElement>(`[data-guide-key="${next}"]`)?.focus();
  };

  return (
    <aside className={styles.panel} aria-label="Practice swap" {...guide('swap.panel')}>
      <div className={styles.head}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>
          Practice swap
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label="Close the practice swap"
          onClick={onClose}
          {...guide('swap.close')}
        >
          <X size={16} />
        </button>
      </div>
      <p className={styles.practice}>
        <AlertTriangle size={14} aria-hidden="true" /> Practice only: nothing here is real. Separate
        from your paper account.
      </p>
      <div className={styles.tabs} role="tablist" aria-label="App or wallet">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`swap-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="swap-view"
            tabIndex={tab === id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(id)}
            onKeyDown={onTabKey}
            {...guide('swap.tab', id)}
          >
            {label}
            {id === 'wallet' && wants && (
              <>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.srOnly}> wants an answer</span>
              </>
            )}
          </button>
        ))}
      </div>
      <div className={styles.stage}>
        <div
          id="swap-view"
          className={styles.view}
          role="tabpanel"
          aria-labelledby={`swap-tab-${tab}`}
          inert={request !== null ? true : undefined}
        >
          {tab === 'app' ? <AppView /> : <WalletView />}
        </div>
        {request && <RequestSheet request={request} fallback={headingRef} />}
      </div>
    </aside>
  );
}
