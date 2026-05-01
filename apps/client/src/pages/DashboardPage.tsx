import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { usePaneFeeds } from '@/hooks/usePaneFeeds';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTPSLMonitor } from '@/hooks/useTPSLMonitor';
import { usePendingOrderMonitor } from '@/hooks/usePendingOrderMonitor';
import { TradingSoundProvider, useTradingSoundCtx } from '@/hooks/TradingSoundContext';
import { useLayoutStore } from '@/store/layoutStore';
import { TopBar } from '@/components/dashboard/TopBar';
import { LeftToolbar } from '@/components/dashboard/LeftToolbar';
import { MultiChartArea } from '@/components/dashboard/MultiChartArea';
import { PaperTradingPanel } from '@/components/dashboard/PaperTradingPanel';
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
 *   │ Tool │  PaperTradingPanel               │ Panel      │
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
    <TradingSoundProvider>
      <DashboardInner />
    </TradingSoundProvider>
  );
}

function DashboardInner() {
  const sound = useTradingSoundCtx();

  usePaneFeeds();
  useDocumentTitle();

  // Stable callback refs — memoized so they don't change on every render.
  // Depend on `sound` (the whole object) — React Compiler infers the object-level
  // dependency from property accesses and cannot preserve narrower method deps.
  const handleTPSLClosed = useCallback(
    (pnl: number) => {
      if (pnl >= 0) sound.playProfit();
      else sound.playLoss();
    },
    [sound]
  );
  const handleOrderFilled = useCallback(() => {
    sound.playOrderFilled();
  }, [sound]);

  useTPSLMonitor({ onClosed: handleTPSLClosed });
  usePendingOrderMonitor({ onFilled: handleOrderFilled });

  // Active pane symbol drives the TradingPanel key (resets form on symbol change)
  const activePane = useLayoutStore((s) => s.activePane);
  const symbol = useLayoutStore((s) => s.panes[s.activePane].symbol);

  const [panelSize, setPanelSize] = useState<PanelSize>('open');
  const [tradingPanelOpen, setTradingPanelOpen] = useState(true);
  /** Persisted across symbol changes so the user stays on their chosen tab */
  const [tradingTab, setTradingTab] = useState<OrderTab>('market');
  /** Persisted across remounts so the user stays on their chosen side — mirrors TV */
  const [tradingSide, setTradingSide] = useState<'buy' | 'sell'>('buy');
  /** When true the PaperTradingPanel fills the entire center column */
  const [isMaximized, setIsMaximized] = useState(false);
  /** When set, an edit panel replaces the TradingPanel in the right column */
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

  // ── Bottom-panel drag-to-resize ─────────────────────────────────────────

  /**
   * panelHeightPx — committed open-state height (written on drag end or size change).
   * Only used when panelSize === 'open' && !isMaximized.
   */
  const [panelHeightPx, setPanelHeightPx] = useState(PANEL_HEIGHTS.open);

  /**
   * panelHeightMV — Framer MotionValue that directly drives style.height on the
   * panel wrapper. Updated instantly during drag via .set() — zero React re-renders
   * per frame. Spring-animated by the useEffect below on size/maximize transitions.
   */
  const panelHeightMV = useMotionValue(PANEL_HEIGHTS.open);

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
    setPanelHeightPx(Math.round(panelHeightMV.get()));
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden" style={{ background: bg.page }}>
      <TopBar />
      <SymbolBar
        tradingPanelOpen={tradingPanelOpen}
        onToggleTrading={() => setTradingPanelOpen((v) => !v)}
      />

      {/* ── Main content row ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <LeftToolbar />

        {/* Center column: chart on top + paper trading panel on bottom.
            By making this a flex-col sibling of TradingPanel, the TradingPanel
            now spans the full height of this row (chart + bottom panel). */}
        <div ref={centerColRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Chart area — animates flex-shrink to 0 when the panel is maximized */}
          <motion.div
            className="relative min-h-0 min-w-0 overflow-hidden"
            animate={{ flex: isMaximized ? '0 0 0px' : '1 1 0%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          >
            <MultiChartArea />
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
            // @ts-expect-error inert is a valid HTML attribute not yet typed in React
            inert={!isMaximized && panelSize === 'hidden' ? '' : undefined}
          >
            <PaperTradingPanel
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
            width: !editTarget && tradingPanelOpen ? 256 : 0,
            opacity: !editTarget && tradingPanelOpen ? 1 : 0,
          }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="shrink-0 overflow-hidden"
        >
          <TradingPanel
            key={`${activePane}-${symbol}`}
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
          className="flex items-center gap-3"
          style={{ fontSize: fontSize.xs10, color: `${color.muted}60` }}
        >
          <Link to="/terms" className="transition-colors hover:text-white/50">
            Terms of Use
          </Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="transition-colors hover:text-white/50">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <span>© {new Date().getFullYear()} Crypto Dashboard</span>
        </nav>
      </div>
    </div>
  );
}
