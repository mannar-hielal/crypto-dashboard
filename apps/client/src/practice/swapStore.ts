/**
 * The practice wallet's state: in memory only, reset each time the practice opens, never saved or
 * sent anywhere, and nothing to do with the paper account. No address, key or phrase exists in it.
 */

import { create } from 'zustand';
import {
  NETWORK_FEE_ETH,
  quoteSwap,
  START_BALANCES,
  type SwapAmount,
  type SwapQuote,
} from './swapMath';

/** The two made-up apps: the one being used, and an old one whose permission was never removed */
export const APP_NAMES = { swap: 'Practice Swap', game: 'Practice Game' } as const;
export type AppId = keyof typeof APP_NAMES;

/** What an app may still take: a number of USDC, or everything */
export type Allowance = number | 'unlimited';
export type ApprovalLimit = 'exact' | 'unlimited';
export type SwapTab = 'app' | 'wallet';

export type WalletRequest =
  | { kind: 'approve'; amount: SwapAmount }
  | { kind: 'swap'; quote: SwapQuote }
  | { kind: 'revoke'; app: AppId };

/** Where the swap stands, for the app's own screen and the status line */
export type SwapPhase = 'idle' | 'waiting' | 'done';

interface SwapState {
  connected: boolean;
  tab: SwapTab;
  amount: SwapAmount;
  usdc: number;
  eth: number;
  /** Permissions on USDC, by app. A used-up one stays listed at 0 */
  allowances: Partial<Record<AppId, Allowance>>;
  /** The apps whose permission the learner revoked (0 because it was removed, not used up) */
  revoked: AppId[];
  /** The wallet's open request: it "wants an answer" */
  request: WalletRequest | null;
  /** The learner said no to the open request: nothing happened, it can be asked again */
  rejected: boolean;
  limit: ApprovalLimit;
  phase: SwapPhase;
  /** The finished swap, for the walkthrough */
  receipt: (SwapQuote & { networkFees: number }) | null;
  /** Network fees paid for this swap so far (its permission and itself), in ETH */
  swapFees: number;
  reset: () => void;
  connect: () => void;
  setTab: (tab: SwapTab) => void;
  setAmount: (amount: SwapAmount) => void;
  setLimit: (limit: ApprovalLimit) => void;
  /** The app's "Review swap": the wallet asks for a permission first, or for the swap itself */
  review: () => void;
  askRevoke: (app: AppId) => void;
  sign: () => void;
  reject: () => void;
  askAgain: () => void;
  /** Put a refused revoke away: nothing was signed */
  dismiss: () => void;
  /** The pretend block arrived: the signed swap is done */
  confirm: () => void;
}

const initial = {
  connected: false,
  tab: 'app' as SwapTab,
  amount: 100 as SwapAmount,
  usdc: START_BALANCES.usdc as number,
  eth: START_BALANCES.eth as number,
  allowances: { game: 'unlimited' } as Partial<Record<AppId, Allowance>>,
  revoked: [] as AppId[],
  request: null as WalletRequest | null,
  rejected: false,
  limit: 'exact' as ApprovalLimit,
  phase: 'idle' as SwapPhase,
  receipt: null as SwapState['receipt'],
  swapFees: 0,
};

/** Whether an allowance covers a swap of `amount` */
export const covers = (allowance: Allowance | undefined, amount: number): boolean =>
  allowance === 'unlimited' || (typeof allowance === 'number' && allowance >= amount);

/** Whether a permission can still take anything (only these get a Revoke button) */
export const isOpen = (allowance: Allowance | undefined): boolean =>
  allowance === 'unlimited' || (typeof allowance === 'number' && allowance > 0);

export const useSwapStore = create<SwapState>()((set, get) => ({
  ...initial,
  reset: () => set({ ...initial }),
  connect: () => set({ connected: true }),
  setTab: (tab) => set({ tab }),
  setAmount: (amount) => {
    const { request, phase } = get();
    if (!request && phase === 'idle') set({ amount });
  },
  setLimit: (limit) => set({ limit }),
  review: () => {
    const { connected, request, phase, amount, usdc, allowances } = get();
    if (!connected || request || phase !== 'idle' || usdc < amount) return;
    set({
      rejected: false,
      request: covers(allowances.swap, amount)
        ? { kind: 'swap', quote: quoteSwap(amount) }
        : { kind: 'approve', amount },
    });
  },
  askRevoke: (app) => {
    const { request, allowances } = get();
    if (request || !isOpen(allowances[app])) return;
    set({ rejected: false, request: { kind: 'revoke', app } });
  },
  sign: () => {
    const { request, rejected, limit, allowances, revoked, eth, swapFees } = get();
    if (!request || rejected) return;
    const paid = { eth: eth - NETWORK_FEE_ETH };
    const forSwap = swapFees + NETWORK_FEE_ETH;
    if (request.kind === 'approve') {
      // The permission, then at once the swap's own request
      set({
        ...paid,
        swapFees: forSwap,
        allowances: {
          ...allowances,
          swap: limit === 'unlimited' ? 'unlimited' : request.amount,
        },
        revoked: revoked.filter((app) => app !== 'swap'),
        request: { kind: 'swap', quote: quoteSwap(request.amount) },
      });
      return;
    }
    if (request.kind === 'swap') {
      set({
        ...paid,
        swapFees: forSwap,
        request: null,
        phase: 'waiting',
        receipt: { ...request.quote, networkFees: forSwap },
      });
      return;
    }
    set({
      ...paid,
      request: null,
      allowances: { ...allowances, [request.app]: 0 },
      revoked: [...revoked, request.app],
    });
  },
  reject: () => {
    if (get().request) set({ rejected: true });
  },
  askAgain: () => set({ rejected: false }),
  dismiss: () => {
    const { request, rejected } = get();
    if (rejected && request?.kind === 'revoke') set({ request: null, rejected: false });
  },
  confirm: () => {
    const { phase, receipt, usdc, eth, allowances } = get();
    if (phase !== 'waiting' || !receipt) return;
    const left = allowances.swap;
    set({
      phase: 'done',
      usdc: usdc - receipt.pay,
      eth: eth + receipt.get,
      allowances: {
        ...allowances,
        swap: typeof left === 'number' ? Math.max(0, left - receipt.pay) : left,
      },
    });
  },
}));
