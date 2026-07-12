import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { SeoHead } from '@/components/SeoHead';
import { usePaneFeeds } from '@/hooks/usePaneFeeds';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTPSLMonitor } from '@/hooks/useTPSLMonitor';
import { usePendingOrderMonitor } from '@/hooks/usePendingOrderMonitor';
import { TradingSoundProvider, useSoundActions } from '@/hooks/TradingSoundContext';
import { useLayoutStore } from '@/store/layoutStore';
import { useAuthStore } from '@/store/authStore';
import { usePaperStore } from '@/store/paperStore';
import { useDrawingStore } from '@/store/drawingStore';
import { authApi } from '@crypto-dashboard/sdk';
import { TopBar } from '@/components/dashboard/TopBar';
import { LeftToolbar } from '@/components/dashboard/LeftToolbar';
import { CURSOR_CSS_MAP, type CursorVariantId } from '@/lib/cursors';
import { LINE_TOOLS, type LineToolId } from '@/lib/lineTools';
import { MultiChartArea } from '@/components/dashboard/MultiChartArea';
import { OrderAccountManagementPanel } from '@/components/dashboard/OrderAccountManagementPanel';
import { TickerBar } from '@/components/dashboard/TickerBar';
import { SymbolBar } from '@/components/dashboard/SymbolBar';
import { TradingPanel } from '@/components/dashboard/TradingPanel';
import type { OrderTab } from '@/components/dashboard/TradingPanel';
import { PositionEditPanel } from '@/components/dashboard/PositionEditPanel';
import { PendingOrderEditPanel } from '@/components/dashboard/PendingOrderEditPanel';
import { bg, color, fontSize } from '@/lib/tokens';

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
export function DashboardPage() {
  return (
    <>
      <SeoHead
        title="Dashboard"
        description="Your crypto paper trading dashboard."
        path="/dashboard"
        noIndex
      />
      <TradingSoundProvider>
        <DashboardInner />
      </TradingSoundProvider>
    </>
  );
}

function DashboardInner() {
  const [cursorVariant, setCursorVariant] = useState<CursorVariantId>('cross');
  const [activeTool, setActiveTool] = useState('cursor');
  const [selectedLineTool, setSelectedLineTool] = useState<LineToolId>('trendline');
  const previousToolRef = useRef({ toolId: 'cursor', lineToolId: 'trendline' as LineToolId });
  const previousCursorRef = useRef<CursorVariantId>('cross');

  function handleToolChange(toolId: string, lineToolId: string) {
    // Store previous tool before switching to a drawing tool
    if (toolId !== 'cursor' && !LINE_TOOLS.some((t) => t !== null && t.id === toolId)) {
      previousToolRef.current = { toolId: activeTool, lineToolId: selectedLineTool };
    }
    // If switching to a line tool, store previous tool
    if (LINE_TOOLS.some((t) => t !== null && t.id === toolId)) {
      previousToolRef.current = { toolId: activeTool, lineToolId: selectedLineTool };
    }
    // Reset cursor variant when switching to a drawing tool so eraser cursor doesn't persist
    if (toolId !== 'cursor') {
      setCursorVariant('cross');
    }
    setActiveTool(toolId);
    setSelectedLineTool(lineToolId as LineToolId);
  }

  function handleExitDrawingMode() {
    const { toolId } = previousToolRef.current;
    setActiveTool(toolId);
  }

  function handleBinAction() {
    useDrawingStore.getState().removeAll();
  }

  function handleCursorVariantChange(variant: CursorVariantId) {
    if (variant !== 'eraser') {
      previousCursorRef.current = variant;
    }
    setCursorVariant(variant);
  }

  function handleEraserExit() {
    setCursorVariant(previousCursorRef.current);
  }

  const { playProfit, playLoss, playOrderFilled } = useSoundActions();

  usePaneFeeds();
  useDocumentTitle();

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const updateUser = useAuthStore((s) => s.updateUser);
  const syncWithServer = usePaperStore((s) => s.syncWithServer);

  const activePaneIndex = useLayoutStore((s) => s.activePane);
  const panes = useLayoutStore((s) => s.panes);
  const activePaneConfig = panes[activePaneIndex] ?? panes[0];
  const symbol = activePaneConfig.symbol;
  const setBottomPanelHeight = useLayoutStore((s) => s.setBottomPanelHeight);

  // 🔄 Sync paper trading state with DB on mount (if authenticated)
  useEffect(() => {
    if (accessToken) {
      syncWithServer(accessToken);
    }
  }, [accessToken, syncWithServer]);

  // Stable callback refs — memoized so they don't change on every render.
  const handleTPSLClosed = useCallback(
    (pnl: number) => {
      if (pnl >= 0) playProfit();
      else playLoss();
    },
    [playProfit, playLoss]
  );
  const handleOrderFilled = useCallback(() => {
    playOrderFilled();
  }, [playOrderFilled]);

  useTPSLMonitor({ onClosed: handleTPSLClosed });
  usePendingOrderMonitor({ onFilled: handleOrderFilled });

  const [panelSize, setPanelSize] = useState<PanelSize>('open');
  const [tradingPanelOpen, setTradingPanelOpen] = useState(true);
  /** Persisted across symbol changes so the user stays on their chosen tab */
  const [tradingTab, setTradingTab] = useState<OrderTab>('market');
  /** Persisted across remounts so the user stays on their chosen side — mirrors TV */
  const [tradingSide, setTradingSide] = useState<'buy' | 'sell'>('buy');
  /** When true the OrderAccountManagementPanel fills the entire center column */
  const [isMaximized, setIsMaximized] = useState(false);
  /** When set, an edit panel replaces the TradingPanel in the right column */
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const isTradingPanelVisible = !editTarget && tradingPanelOpen;

  // ── Chart cursor variant + drag-to-grab ─────────────────────────────────

  /** Ref on the chart-area motion.div so we can toggle data-dragging without
   *  re-renders during pointer drag. The CSS rule `[data-dragging] canvas`
   *  overrides the lightweight-charts cursor to `grabbing`. */
  const chartAreaRef = useRef<HTMLDivElement>(null);

  /** Inject a <style> tag that overrides canvas cursors for the selected
   *  cursor variant and shows a grabbing hand during drag. Using !important
   *  beats lightweight-charts' own inline canvas cursor management. */
  useEffect(() => {
    const rules =
      Object.entries(CURSOR_CSS_MAP)
        .map(
          ([variant, cursorVal]) =>
            `[data-cursor="${variant}"] canvas { cursor: ${cursorVal} !important; }`
        )
        .join('\n') +
      '\n[data-dragging="true"] canvas { cursor: grabbing !important; }' +
      '\n[data-drawing-hover]:not([data-cursor="eraser"]) canvas { cursor: unset !important; }';

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
      />

      {/* ── Main content row ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <LeftToolbar
          onCursorVariantChange={handleCursorVariantChange}
          activeTool={activeTool}
          cursorVariant={cursorVariant}
          lineTool={selectedLineTool}
          onToolChange={handleToolChange}
          onBinAction={handleBinAction}
        />

        {/* Center column: chart on top + paper trading panel on bottom.
            By making this a flex-col sibling of TradingPanel, the TradingPanel
            now spans the full height of this row (chart + bottom panel). */}
        <div ref={centerColRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Chart area — animates flex-shrink to 0 when the panel is maximized */}
          <motion.div
            ref={chartAreaRef}
            data-cursor={cursorVariant}
            data-drawing-active={activeTool === 'line' ? 'true' : undefined}
            className="relative min-h-0 min-w-0 overflow-hidden"
            animate={{ flex: isMaximized ? '0 0 0px' : '1 1 0%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          >
            <MultiChartArea
              activeTool={activeTool}
              lineTool={selectedLineTool}
              cursorVariant={cursorVariant}
              onExitDrawingMode={handleExitDrawingMode}
              onEraserExit={handleEraserExit}
            />
          </motion.div>

          {/* Paper trading panel.
              Normal: fixed pixel height animated via spring.
              Maximized: flex-1 fills the center column (chart has collapsed to 0). */}
          {/* ── bottom-widgetbar-handle ────────────────────────────────────────
              12 px absolutely-positioned strip centred on the chart/panel boundary.
              Mirrors the TradingView `bottom-widgetbar-handle` pattern:
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
            <OrderAccountManagementPanel
              size={panelSize}
              onSizeChange={setPanelSize}
              isMaximized={isMaximized}
              onToggleMaximize={handleToggleMaximize}
              onEditPosition={(positionId) => setEditTarget({ kind: 'position', positionId })}
              onEditPendingOrder={(orderId) => setEditTarget({ kind: 'pending', orderId })}
            />
          </motion.div>
        </div>

        {/* Trading panel / Edit panels — sibling of the entire center column so it spans
            the full height from SymbolBar down to TickerBar */}

        {/* Edit panels (position / pending-order) */}
        <AnimatePresence initial={false}>
          {editTarget?.kind === 'position' && (
            <motion.div
              key={`edit-pos-${editTarget.positionId}`}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="shrink-0 overflow-hidden"
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
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="shrink-0 overflow-hidden"
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
            key={`${activePane}-${symbol}`} still resets the form on symbol change. */}
        <motion.div
          animate={{
            width: isTradingPanelVisible ? 256 : 0,
            opacity: isTradingPanelVisible ? 1 : 0,
          }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="shrink-0 overflow-hidden"
          aria-hidden={!isTradingPanelVisible}
          inert={!isTradingPanelVisible ? true : undefined}
          style={{ pointerEvents: isTradingPanelVisible ? 'auto' : 'none' }}
        >
          <TradingPanel
            key={`${activePaneIndex}-${symbol}`}
            onClose={() => setTradingPanelOpen(false)}
            initialTab={tradingTab}
            onTabChange={setTradingTab}
            initialSide={tradingSide}
            onSideChange={setTradingSide}
          />
        </motion.div>
      </div>

      <TickerBar />

      {/* ── Dashboard footer ─────────────────────────────────────────────── */}
      <div
        className="flex h-7 w-full shrink-0 items-center justify-between border-t border-white/5 px-4"
        style={{ background: bg.footer }}
      >
        <span style={{ fontSize: fontSize.xs10, color: `${color.muted}80` }}>
          ⚠️ Paper trading only — no real funds. For educational purposes.
        </span>
        <nav
          className="flex items-center gap-4"
          style={{ fontSize: fontSize.xs10, color: `${color.muted}60` }}
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
          <span className="ml-2 font-medium">
            © {new Date().getFullYear()} cryptopapertrade.com
          </span>
        </nav>
      </div>
    </div>
  );
}
