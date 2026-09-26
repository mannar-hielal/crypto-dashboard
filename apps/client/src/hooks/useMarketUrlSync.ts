/**
 * Keeps the dashboard URL and the active pane's market in step (BYBIT_PARITY_PLAN BP-2).
 *
 * - URL → store: on load and on back / forward, the market in the URL is applied to the active
 *   pane (the URL wins over the saved layout).
 * - Store → URL: switching the active pane's market or symbol pushes a history entry (so back
 *   returns to the previous market); focusing another pane, or a change made for the user (the
 *   D7 hand-off), replaces the entry instead.
 *
 * Each direction compares before acting, so they never loop.
 *
 * Also runs the one-time D7 hand-off: pre-BP-2 trading became USDT Perpetual, so a user whose
 * layout predates BP-2 and who opens bare /dashboard with perpetual positions / orders lands on
 * USDT Perpetual once, on their newest position's symbol.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { marketPath, parseMarketPath, type Market } from '@/lib/marketRoutes';
import { useLayoutStore } from '@/store/layoutStore';
import { usePaperStore } from '@/store/paperStore';

/** Navigation state set by the bare-/dashboard redirect (DashboardRedirect). */
export interface DashboardEntryState {
  fromDefault?: boolean;
}

function activeMarket(): Market & { pane: number } {
  const { panes, activePane } = useLayoutStore.getState();
  const pane = panes[activePane] ?? panes[0];
  return { category: pane.category, symbol: pane.symbol, pane: activePane };
}

/**
 * The perpetual market a pre-BP-2 account should land on: its newest position's symbol, else its
 * newest perpetual order's (null when it has neither).
 */
export function handoffMarket(state: {
  positions: { symbol: string; openedAt: number }[];
  pendingOrders: { category: string; symbol: string; placedAt: number }[];
}): Market | null {
  const newestPosition = [...state.positions].sort((a, b) => b.openedAt - a.openedAt)[0];
  if (newestPosition) return { category: 'linear', symbol: newestPosition.symbol };
  const newestOrder = state.pendingOrders
    .filter((o) => o.category === 'linear')
    .sort((a, b) => b.placedAt - a.placedAt)[0];
  return newestOrder ? { category: 'linear', symbol: newestOrder.symbol } : null;
}

export function useMarketUrlSync(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const fromDefault = (location.state as DashboardEntryState | null)?.fromDefault === true;

  /** The URL the store → URL direction compares against (never a render-time write) */
  const pathnameRef = useRef(pathname);

  // ── URL → store (load, back / forward, a typed URL) ────────────────────────
  // Layout effect: applied before the feeds' effects subscribe, so the old market never connects.
  useLayoutEffect(() => {
    // First: setPaneMarket below notifies the store → URL subscriber synchronously, and it must
    // see that the URL already shows this market — else it navigates again (a phantom entry that
    // wipes the Forward history)
    pathnameRef.current = pathname;
    const parsed = parseMarketPath(pathname);
    if (!parsed) return; // DashboardRedirect handles URLs that name no market
    const current = activeMarket();
    if (current.category !== parsed.category || current.symbol !== parsed.symbol) {
      useLayoutStore.getState().setPaneMarket(current.pane, parsed.category, parsed.symbol);
    }
  }, [pathname]);

  // A non-canonical URL (/dashboard/spot/btc/usdt) is replaced by the canonical one. A plain
  // effect, not a layout one: the router subscribes to history in its own layout effect, which
  // runs after its children's — a navigation from a child's first layout effect would be lost.
  useEffect(() => {
    const parsed = parseMarketPath(pathname);
    if (parsed && parsed.canonical !== pathname) {
      navigate(parsed.canonical, { replace: true, state: location.state });
    }
  }, [pathname, navigate, location.state]);

  // ── Store → URL ────────────────────────────────────────────────────────────
  useEffect(() => {
    let previousPane = useLayoutStore.getState().activePane;
    return useLayoutStore.subscribe((state) => {
      const pane = state.panes[state.activePane] ?? state.panes[0];
      const target = marketPath(pane);
      const paneChanged = state.activePane !== previousPane;
      previousPane = state.activePane;
      if (target === pathnameRef.current) return;
      pathnameRef.current = target;
      // Focusing another pane isn't a navigation the user would step back through
      navigate(target, { replace: paneChanged });
    });
  }, [navigate]);

  // ── D7: the one-time move to USDT Perpetual ────────────────────────────────
  const handoffDone = useLayoutStore((s) => s.marketHandoffDone);
  const loaded = usePaperStore((s) => s.version >= 0);
  useEffect(() => {
    if (handoffDone || !loaded) return;
    const layout = useLayoutStore.getState();
    // Only on bare /dashboard: a market URL (a bookmark, a shared link) is an explicit choice
    if (fromDefault) {
      const target = handoffMarket(usePaperStore.getState());
      if (target) {
        const path = marketPath(target);
        pathnameRef.current = path;
        navigate(path, { replace: true });
        layout.setPaneMarket(layout.activePane, target.category, target.symbol);
      }
    }
    layout.completeMarketHandoff();
  }, [handoffDone, loaded, fromDefault, navigate]);
}
