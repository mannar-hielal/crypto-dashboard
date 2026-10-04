import { guide } from '@/lib/guideAnchors';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { IChartApi } from 'lightweight-charts';
import type { DrawingKind, DrawingManager } from 'lightweight-charts-drawing';
import { SeoHead } from '@/components/SeoHead';
import { usePaneFeeds } from '@/hooks/usePaneFeeds';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePaperFeed } from '@/hooks/usePaperFeed';
import { useSessionRefresh } from '@/hooks/useSessionRefresh';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useMarketUrlSync, type DashboardEntryState } from '@/hooks/useMarketUrlSync';
import { DASHBOARD_PATH, marketPath, parseMarketPath } from '@/lib/marketRoutes';
import { TradingSoundProvider } from '@/hooks/TradingSoundContext';
import { useLayoutStore } from '@/store/layoutStore';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@crypto-dashboard/sdk';
import { TopBar } from '@/components/dashboard/TopBar';
import { LeftToolbar } from '@/components/dashboard/LeftToolbar';
import { CURSOR_CSS_MAP, type CursorVariantId } from '@/lib/cursors';
import { TOOL_MAP } from '@/lib/drawingManager';
import { HOST_TOOLS, keepSelectionInOnePane, nextActiveTool } from '@/lib/drawingTools';
import { MultiChartArea } from '@/components/dashboard/MultiChartArea';
import { OrderAccountManagementPanel } from '@/components/dashboard/OrderAccountManagementPanel';
import { TickerBar } from '@/components/dashboard/TickerBar';
import { SymbolBar } from '@/components/dashboard/SymbolBar';
import { TradingPanel } from '@/components/dashboard/TradingPanel';
import { MobileTradeBar } from '@/components/dashboard/MobileTradeBar';
import { useOrderPrefillStore } from '@/store/orderPrefillStore';
import type { OrderTab } from '@/components/dashboard/TradingPanel';
import { SignInLock } from '@/components/dashboard/SignInLock';
import { PositionEditPanel } from '@/components/dashboard/PositionEditPanel';
import { PendingOrderEditPanel } from '@/components/dashboard/PendingOrderEditPanel';
import { bg, color, fontSize, rangeBar } from '@/lib/tokens';
import { TIME_RANGE_PRESETS } from '@/lib/markets';
import { TimeRangeSwitcher } from '@/components/dashboard/TimeRangeSwitcher';

// ─── Edit target type ────────────────────────────────────────────────────────
type EditTarget =
  | { kind: 'position'; positionId: string }
  | { kind: 'pending'; orderId: string }
  | null;

// ─── Types ────────────────────────────────────────────────────────────────────

/** hidden = fully closed (h-0); collapsed = header-only; open = full height */
export type PanelSize = 'hidden' | 'collapsed' | 'open';

/** Pixel heights used by the Framer Motion spring — mirrors h-0 / h-9 / h-52 */
const PANEL_HEIGHTS: Record<PanelSize, number> = {
  hidden: 0,
  collapsed: 36,
  open: 208, // default open height — overridden by panelHeightPx after user drags
};

/** Minimum panel height while dragging (keeps at least one content row visible) */
const MIN_PANEL_HEIGHT = 80;

/**
 * DashboardPage
 *
 * Orchestrates the full trading layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │              AppHeader / TopBar (h-12)               │
 *   ├──────────────────────────────────────────────────────┤
 *   │              SymbolBar          (h-11)               │
 *   ├──────┬──────────────────────────────────┬────────────┤
 *   │      │  ChartPanel (flex-1)              │            │
 *   │ Left │  ──────────────────────────────  │ Trading    │
 *   │ Tool │  OrderAccountManagementPanel     │ Panel      │
 *   │ bar  │  (animated height / flex-1 when  │ (w-64,     │
 *   │(w-11)│   maximized)                     │ full h) ✓  │
 *   ├──────┴──────────────────────────────────┴────────────┤
 *   │   TickerBar          (h-8)                           │
 *   ├──────────────────────────────────────────────────────┤
 *   │   DashboardFooter    (h-7)                           │
 *   └──────────────────────────────────────────────────────┘
 */
/**
 * Bare /dashboard, and any /dashboard URL that names no market we trade, goes to the active
 * pane's market URL. From bare /dashboard it marks the entry, for the one-time D7 hand-off.
 */
export function DashboardRedirect() {
  const { pathname } = useLocation();
  const target = useLayoutStore((s) => marketPath(s.panes[s.activePane] ?? s.panes[0]));
  const state: DashboardEntryState | undefined =
    pathname === DASHBOARD_PATH ? { fromDefault: true } : undefined;
  return <Navigate to={target} replace state={state} />;
}

/**
 * The trading dashboard at a market URL (/dashboard/spot/BTC/USDT, /dashboard/usdt/BTCUSDT).
 * The URL's market is applied to the active pane before the dashboard first mounts, so a deep
 * link never connects the saved layout's market first.
 */
export function DashboardPage() {
  const { pathname } = useLocation();
  const parsed = parseMarketPath(pathname);
  useMarketUrlSync();
  const matches = useLayoutStore((s) => {
    const pane = s.panes[s.activePane] ?? s.panes[0];
    return parsed !== null && pane.category === parsed.category && pane.symbol === parsed.symbol;
  });
  // Shown once the URL's market is on the pane, then kept mounted (back / forward updates it in
  // place). A layout effect: it flips before paint, right after useMarketUrlSync applied the
  // market — there's no render-time way to remember "has matched once" without it.
  const [ready, setReady] = useState(matches);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time gate, see above
    if (matches) setReady(true);
  }, [matches]);

  if (!parsed) return <DashboardRedirect />;
  const pair = parsed.symbol.replace(/USDT$/, '/USDT');
  return (
    <>
      <SeoHead
        title={`${pair} ${parsed.category === 'spot' ? 'Spot' : 'Perpetual'}`}
        description="Your crypto paper trading dashboard."
        path={parsed.canonical}
        noIndex
      />
      {/* Stays mounted once shown: later market changes (back / forward) update it in place */}
      {ready && (
        <TradingSoundProvider>
          <DashboardInner />
        </TradingSoundProvider>
      )}
    </>
  );
}

export function DashboardInner() {
  const [cursorVariant, setCursorVariant] = useState<CursorVariantId>('cross');
  const [activeToolType, setActiveToolType] = useState<string | null>(null);
  const drawingManagerRefs = useRef<(DrawingManager | null)[]>([null, null, null, null]);
  const chartRefs = useRef<(IChartApi | null)[]>([null, null, null, null]);

  function handleDrawingManagerReady(paneIndex: number, manager: DrawingManager) {
    drawingManagerRefs.current[paneIndex] = manager;
    // The library disarms its tool after a placement (TradingView: back to the cursor) or on Escape;
    // its disarm never ends the Eraser or zoom-in
    manager.on('tool', (kind) => setActiveToolType((prev) => nextActiveTool(prev, kind)));
    // Delete removes the selection of the pane last clicked only
    keepSelectionInOnePane(manager, () => drawingManagerRefs.current);
  }

  function handleToolChange(toolType: string | null) {
    setActiveToolType(toolType);
    // The Eraser and zoom-in are ours: ChartPanel disarms the library's tool for the Eraser
    if (toolType !== null && HOST_TOOLS.has(toolType)) return;
    const paneIndex = useLayoutStore.getState().activePane;
    const manager = drawingManagerRefs.current[paneIndex];
    if (manager) {
      manager.setTool(toolType === null ? null : ((TOOL_MAP[toolType] ?? toolType) as DrawingKind));
    }
  }

  function handleBinAction() {
    const paneIndex = useLayoutStore.getState().activePane;
    drawingManagerRefs.current[paneIndex]?.clear();
  }

  function handleChartRefReady(paneIndex: number, chart: IChartApi) {
    chartRefs.current[paneIndex] = chart;
  }

  function handleZoomOut() {
    const chart = chartRefs.current[activePaneIndex];
    if (!chart) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const center = (range.from + range.to) / 2;
    const span = range.to - range.from;
    chart
      .timeScale()
      .setVisibleLogicalRange({ from: center - span * 0.65, to: center + span * 0.65 });
  }

  function handleCursorVariantChange(variant: CursorVariantId) {
    setCursorVariant(variant);
  }

  usePaneFeeds();
  useDocumentTitle();

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const updateUser = useAuthStore((s) => s.updateUser);

  const activePaneIndex = useLayoutStore((s) => s.activePane);
  // 🔐 Selector reads live state, not a closure — re-renders only when the
  //    active pane's own data changes, not on every pane edit.
  const activePaneConfig = useLayoutStore((s) => s.panes[s.activePane] ?? s.panes[0]);
  const symbol = activePaneConfig.symbol;
  const category = activePaneConfig.category;
  const setPaneTimeRangePreset = useLayoutStore((s) => s.setPaneTimeRangePreset);
  const setPaneInterval = useLayoutStore((s) => s.setPaneInterval);
  const setBottomPanelHeight = useLayoutStore((s) => s.setBottomPanelHeight);

  // Paper trading runs on the server (APP_LOG Bybit Parity BP-1): the private WebSocket keeps
  // paperStore in sync and plays fill / TP-SL sounds; the session refresh keeps the token valid.
  useSessionRefresh();
  usePaperFeed();

  const isMobile = useMediaQuery('(max-width: 1023px)');

  const [panelSize, setPanelSize] = useState<PanelSize>(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      return 'collapsed';
    }
    return 'open';
  });

  const [tradingPanelOpen, setTradingPanelOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      return false;
    }
    return true;
  });

  const [leftToolbarOpen, setLeftToolbarOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      return false;
    }
    return true;
  });
  /** Persisted across symbol changes so the user stays on their chosen tab */
  const [tradingTab, setTradingTab] = useState<OrderTab>('market');
  /** Persisted across remounts so the user stays on their chosen side — mirrors TV */
  const [tradingSide, setTradingSide] = useState<'buy' | 'sell'>('buy');
  /** When true the OrderAccountManagementPanel fills the entire center column */
  const [isMaximized, setIsMaximized] = useState(false);
  /** When set, an edit panel replaces the TradingPanel in the right column */
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const isTradingPanelVisible = !editTarget && tradingPanelOpen;

  // Below lg the form isn't docked: a prefill (Assets → Sell) must also open it, on its side, or the
  // tap looks dead (review #200). Adjusted while rendering when a new request arrives (no effect)
  // The form may take (and clear) the request first, so follow the request counter, not the request
  const prefillSeq = useOrderPrefillStore((s) => s.seq);
  const prefillSide = useOrderPrefillStore((s) => s.lastSide);
  const [openedForSeq, setOpenedForSeq] = useState(prefillSeq);
  if (prefillSeq !== openedForSeq) {
    setOpenedForSeq(prefillSeq);
    if (isMobile) {
      setEditTarget(null);
      setTradingSide(prefillSide);
      setTradingPanelOpen(true);
    }
  }

  // ── Chart cursor variant + drag-to-grab ─────────────────────────────────

  /** Ref on the chart-area motion.div so we can toggle data-dragging without
   *  re-renders during pointer drag. The CSS rule `[data-dragging] canvas`
   *  overrides the lightweight-charts cursor to `grabbing`. */
  const chartAreaRef = useRef<HTMLDivElement>(null);

  /** Inject a <style> tag that overrides canvas cursors for the selected
   *  cursor variant and shows a grabbing hand during drag. The !important on
   *  [data-dragging] is needed to beat lw-charts during drag; variant rules
   *  intentionally omit !important so lw-charts can show pointer cursor
   *  when hovering over drawings (via Drawing.hitTest -> PrimitiveHoveredItem). */
  useEffect(() => {
    const rules =
      Object.entries(CURSOR_CSS_MAP)
        .map(
          ([variant, cursorVal]) => `[data-cursor="${variant}"] canvas { cursor: ${cursorVal}; }`
        )
        .join('\n') +
      '\n[data-dragging="true"] canvas { cursor: grabbing !important; }' +
      '';

    const style = document.createElement('style');
    style.id = 'chart-cursor-override';
    style.textContent = rules;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  /** Toggle data-dragging attribute via direct DOM — zero re-renders during
   *  drag. Listens on the container for pointerdown and on document for
   *  pointerup so drags that end outside the container still reset. */
  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el) return;

    const onDown = () => el.setAttribute('data-dragging', 'true');
    const onUp = () => el.removeAttribute('data-dragging');

    el.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
    };
  }, []);

  // ── Bottom-panel drag-to-resize ─────────────────────────────────────────

  /**
   * panelHeightPx — committed open-state height (written on drag end or size change).
   * Seeded from layoutStore so it survives a page refresh.
   * Only used when panelSize === 'open' && !isMaximized.
   */
  const [panelHeightPx, setPanelHeightPx] = useState(
    () => useLayoutStore.getState().bottomPanelHeight
  );

  /**
   * panelHeightMV — Framer MotionValue that directly drives style.height on the
   * panel wrapper. Updated instantly during drag via .set() — zero React re-renders
   * per frame. Spring-animated by the useEffect below on size/maximize transitions.
   * Seeded from layoutStore so the panel opens at its last-used height immediately.
   */
  const panelHeightMV = useMotionValue(useLayoutStore.getState().bottomPanelHeight);

  /**
   * handleBottom keeps the 12 px drag handle centred on the panel boundary without
   * any React re-renders during drag — useTransform maps panelHeightMV → bottom px.
   */
  const handleBottom = useTransform(panelHeightMV, (h) => h - 6);

  /** Ref on the center column so we can read clientHeight for drag clamping */
  const centerColRef = useRef<HTMLDivElement>(null);

  /** Drag state — purely imperative, never triggers re-renders */
  const isDraggingPanel = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  /**
   * Spring-animate panelHeightMV on every state transition:
   *   • panelSize change  → spring to target height (hidden=0, collapsed=36, open=panelHeightPx)
   *   • isMaximized off   → spring back to panelHeightPx
   *   • panelHeightPx set → effectively a no-op spring (MV already at that value after drag)
   *
   * During drag panelHeightMV.set() fires directly so this effect never runs.
   */
  useEffect(() => {
    if (isMaximized) return; // flex-1 handles height when maximized
    const target = panelSize === 'open' ? panelHeightPx : PANEL_HEIGHTS[panelSize];
    animate(panelHeightMV, target, { type: 'spring', stiffness: 340, damping: 34 });
    // panelHeightMV is a stable MotionValue ref — intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSize, isMaximized, panelHeightPx]);

  function handleToggleMaximize() {
    setIsMaximized((v) => !v);
  }

  // ── Drag pointer handlers ───────────────────────────────────────────────

  function handlePanelHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (panelSize !== 'open' || isMaximized) return;
    e.preventDefault();
    isDraggingPanel.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = panelHeightMV.get();
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePanelHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingPanel.current) return;
    const delta = dragStartY.current - e.clientY; // drag up → positive → taller
    const containerH = centerColRef.current?.clientHeight ?? 600;
    const maxH = Math.floor(containerH * 0.85); // chart always keeps ≥15%
    panelHeightMV.set(Math.max(MIN_PANEL_HEIGHT, Math.min(maxH, dragStartH.current + delta)));
  }

  function handlePanelHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingPanel.current) return;
    isDraggingPanel.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // Commit to React state — triggers the spring effect but as a no-op
    // (MV is already at this value so no visible animation occurs).
    const committed = Math.round(panelHeightMV.get());
    setPanelHeightPx(committed);
    setBottomPanelHeight(committed); // persist to cd-layout localStorage
  }

  async function handleCancelDeletion() {
    if (!accessToken) return;
    try {
      await authApi.cancelDeletion(accessToken);
      updateUser({ deletionRequestedAt: null });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden" style={{ background: bg.page }}>
      <TopBar />

      {/* ⚠️ Deletion Pending Banner */}
      <AnimatePresence>
        {user?.deletionRequestedAt && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center justify-center gap-3 bg-amber-500/10 border-b border-amber-500/20 py-2 px-4 shadow-lg"
            {...guide('notice.deletion-pending')}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-medium text-amber-200/90">
              Your account is scheduled for deletion on{' '}
              <strong className="text-amber-400">
                {new Date(
                  new Date(user.deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000
                ).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </strong>
              .
            </p>
            <button
              onClick={handleCancelDeletion}
              {...guide('notice.deletion-pending.cancel')}
              className="ml-2 px-3 py-1 rounded bg-amber-500 text-[11px] font-bold text-black hover:bg-amber-400 transition-colors"
            >
              Cancel deletion
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <SymbolBar
        tradingPanelOpen={tradingPanelOpen}
        onToggleTrading={() => setTradingPanelOpen((v) => !v)}
        leftToolbarOpen={leftToolbarOpen}
        onToggleLeftToolbar={() => setLeftToolbarOpen((v) => !v)}
      />

      {/* ── Main content row ──────────────────────────────────────────────── */}
      <div className={`flex min-h-0 flex-1${isMobile ? ' relative' : ''}`}>
        <motion.div
          animate={{ width: leftToolbarOpen ? 44 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="shrink-0 overflow-hidden"
        >
          <LeftToolbar
            onToolChange={handleToolChange}
            onBinAction={handleBinAction}
            onZoomOut={handleZoomOut}
            cursorVariant={cursorVariant}
            onCursorVariantChange={handleCursorVariantChange}
            activeToolType={activeToolType}
          />
        </motion.div>

        {/* Center column: chart on top + paper trading panel on bottom.
            By making this a flex-col sibling of TradingPanel, the TradingPanel
            now spans the full height of this row (chart + bottom panel). */}
        <div ref={centerColRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Chart area — animates flex-shrink to 0 when the panel is maximized */}
          <motion.div
            ref={chartAreaRef}
            data-cursor={activeToolType === null ? cursorVariant : undefined}
            data-drawing-active={activeToolType !== null ? 'true' : undefined}
            className="relative min-h-0 min-w-0 overflow-hidden"
            animate={{ flex: isMaximized ? '0 0 0px' : '1 1 0%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          >
            <ErrorBoundary>
              <MultiChartArea
                onDrawingManagerReady={handleDrawingManagerReady}
                onChartRefReady={handleChartRefReady}
                activeToolType={activeToolType}
                onToolChange={handleToolChange}
              />
            </ErrorBoundary>
          </motion.div>

          {/* ── Time-range preset bar ──────────────────────────────────────────── */}
          <div
            className="flex shrink-0 items-center justify-between border-t border-white/6 px-3"
            style={{ height: rangeBar.height, background: rangeBar.background }}
          >
            <span style={{ fontSize: fontSize.xs10, color: color.muted }}>Range</span>
            <TimeRangeSwitcher
              activePreset={activePaneConfig?.timeRangePreset ?? null}
              onPresetChange={(preset) => {
                // ChartPanel's own effect (reacts to timeRangePreset/interval/bars)
                // applies the visible range once the store updates — don't also
                // set it here, or the two can race against an interval switch.
                setPaneTimeRangePreset(activePaneIndex, preset);
                if (!preset) return;
                const p = TIME_RANGE_PRESETS.find((pr) => pr.key === preset);
                if (p) setPaneInterval(activePaneIndex, p.interval);
              }}
            />
          </div>

          {/* Paper trading panel.
              Normal: fixed pixel height animated via spring.
              Maximized: flex-1 fills the center column (chart has collapsed to 0). */}
          {/* ── bottom-widgetbar-handle ────────────────────────────────────────
              12 px absolutely-positioned strip centred on the chart/panel boundary.
              Mirrors the TVP `bottom-widgetbar-handle` pattern:
                • touch-action: none  — prevents scroll interference on touch
                • cursor: ns-resize   — signals the vertical drag affordance
                • aria-hidden         — decorative; excluded from the a11y tree
              Only rendered when the panel is open and not maximized.              */}
          {panelSize === 'open' && !isMaximized && (
            <motion.div
              aria-hidden="true"
              className="absolute left-0 right-0 z-20 group"
              style={{
                bottom: handleBottom,
                height: 12,
                touchAction: 'none',
                cursor: 'ns-resize',
              }}
              onPointerDown={handlePanelHandlePointerDown}
              onPointerMove={handlePanelHandlePointerMove}
              onPointerUp={handlePanelHandlePointerUp}
            >
              {/* 2 px accent line — fades in on hover to confirm the drag zone */}
              <div
                className="pointer-events-none absolute inset-x-0 opacity-0 transition-opacity duration-100 group-hover:opacity-100"
                style={{ top: 5, height: 2, background: `${color.purpleDark}80` }}
              />
            </motion.div>
          )}

          <motion.div
            className={`shrink-0 overflow-hidden${isMaximized ? ' flex-1' : ''}`}
            style={isMaximized ? {} : { height: panelHeightMV }}
            inert={!isMaximized && panelSize === 'hidden' ? true : undefined}
          >
            {/* Signed-out visitors (/chart): locked behind "Sign in to trade" */}
            <SignInLock>
              <OrderAccountManagementPanel
                size={panelSize}
                onSizeChange={setPanelSize}
                isMaximized={isMaximized}
                onToggleMaximize={handleToggleMaximize}
                onEditPosition={(positionId) => setEditTarget({ kind: 'position', positionId })}
                onEditPendingOrder={(orderId) => setEditTarget({ kind: 'pending', orderId })}
              />
            </SignInLock>
          </motion.div>
        </div>

        {/* Trading panel / Edit panels — sibling of the entire center column so it spans
            the full height from SymbolBar down to TickerBar */}

        {/* Edit panels (position / pending-order) */}
        <AnimatePresence initial={false}>
          {editTarget?.kind === 'position' && (
            <motion.div
              key={`edit-pos-${editTarget.positionId}`}
              // Below lg an overlay like the order form (full screen / a 320 px sheet), so the
              // chart isn't squeezed to ~120 px on a phone (review #200)
              initial={isMobile ? { x: '100%', opacity: 0 } : { width: 0, opacity: 0 }}
              animate={isMobile ? { x: 0, opacity: 1 } : { width: 256, opacity: 1 }}
              exit={isMobile ? { x: '100%', opacity: 0 } : { width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={`shrink-0 overflow-hidden${isMobile ? ' absolute inset-y-0 right-0 z-30 w-full md:w-80' : ''}`}
            >
              <PositionEditPanel
                positionId={editTarget.positionId}
                onClose={() => setEditTarget(null)}
              />
            </motion.div>
          )}
          {editTarget?.kind === 'pending' && (
            <motion.div
              key={`edit-pending-${editTarget.orderId}`}
              // Below lg an overlay like the order form (full screen / a 320 px sheet), so the
              // chart isn't squeezed to ~120 px on a phone (review #200)
              initial={isMobile ? { x: '100%', opacity: 0 } : { width: 0, opacity: 0 }}
              animate={isMobile ? { x: 0, opacity: 1 } : { width: 256, opacity: 1 }}
              exit={isMobile ? { x: '100%', opacity: 0 } : { width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={`shrink-0 overflow-hidden${isMobile ? ' absolute inset-y-0 right-0 z-30 w-full md:w-80' : ''}`}
            >
              <PendingOrderEditPanel
                orderId={editTarget.orderId}
                onClose={() => setEditTarget(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* TradingPanel — always mounted so form state (amount, price, TP/SL) survives
            close/reopen. Width is animated to 0 when hidden.
            key={`${activePane}-${category}-${symbol}`} still resets the form on a market change. */}
        <motion.div
          animate={
            isMobile
              ? { x: isTradingPanelVisible ? 0 : '100%', opacity: isTradingPanelVisible ? 1 : 0 }
              : { width: isTradingPanelVisible ? 256 : 0, opacity: isTradingPanelVisible ? 1 : 0 }
          }
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          // Below lg: full screen on phones, a right-hand sheet on tablets (md+)
          className={`shrink-0 overflow-hidden${isMobile ? ' absolute inset-y-0 right-0 z-30 w-full md:w-80' : ''}`}
          aria-hidden={!isTradingPanelVisible}
          inert={!isTradingPanelVisible ? true : undefined}
          style={{ pointerEvents: isTradingPanelVisible ? 'auto' : 'none' }}
        >
          {/* Signed-out visitors (/chart): locked behind "Sign in to trade". On phones the sheet
              covers the screen, so the lock carries its own close button */}
          <SignInLock onClose={isMobile ? () => setTradingPanelOpen(false) : undefined}>
            <TradingPanel
              key={`${activePaneIndex}-${category}-${symbol}`}
              onClose={() => setTradingPanelOpen(false)}
              initialTab={tradingTab}
              onTabChange={setTradingTab}
              initialSide={tradingSide}
              onSideChange={setTradingSide}
              // Mobile: the form covers the screen — once the order is in, close it and open the
              // account panel, so the new position or order is what the user sees
              onPlaced={
                isMobile
                  ? () => {
                      setTradingPanelOpen(false);
                      setPanelSize('open');
                    }
                  : undefined
              }
            />
          </SignInLock>
        </motion.div>
      </div>

      {/* Phones and tablets: Buy / Sell open the order form (it isn't docked below lg) */}
      {/* Not while an edit panel is open: it covers the screen, and Buy / Sell couldn't show the form */}
      {isMobile && !isTradingPanelVisible && !editTarget && (
        // Signed-out visitors: shown dimmed and inert — the account panel's lock right above it
        // carries "Sign in to trade", so this one has no prompt of its own
        <SignInLock prompt={false}>
          <MobileTradeBar
            onTrade={(side) => {
              setTradingSide(side);
              setTradingPanelOpen(true);
            }}
          />
        </SignInLock>
      )}

      {/* The ticker tape is marketing: phones give its height to the chart */}
      <div className="hidden sm:block">
        <TickerBar />
      </div>

      {/* ── Dashboard footer ─────────────────────────────────────────────── */}
      <div
        className="flex h-auto w-full shrink-0 flex-col items-center gap-0.5 border-t border-white/5 px-4 py-1.5 sm:min-h-7 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-0.5 sm:py-1"
        style={{ background: bg.footer }}
      >
        <span style={{ fontSize: fontSize.xs10, color: color.muted }}>
          ⚠️ Paper trading only — no real funds.
          <span className="hidden sm:inline"> For educational purposes.</span>
        </span>
        <nav
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 sm:justify-end sm:gap-x-4"
          style={{ fontSize: fontSize.xs10, color: `${color.muted}b3` }}
        >
          <Link to="/terms" className="transition-colors hover:text-white/50">
            Terms of Service
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-white/50">
            Privacy Policy
          </Link>
          <Link to="/security" className="transition-colors hover:text-white/50">
            Security
          </Link>
          <Link to="/aup" className="transition-colors hover:text-white/50">
            Acceptable Use Policy
          </Link>
          <span className="hidden font-medium sm:ml-2 sm:inline">
            © {new Date().getFullYear()} cryptopapertrade.com
          </span>
          {/* 🔐 Licence: lightweight-charts' NOTICE text with a link to tradingview.com (Apache 2.0) */}
          <a
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-white/50"
            {...guide('footer.chart-credit')}
          >
            Charts: TradingView Lightweight Charts™ © 2025 TradingView, Inc.
          </a>
        </nav>
      </div>
    </div>
  );
}
