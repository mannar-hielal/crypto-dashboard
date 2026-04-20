import { useEffect, useRef, useState } from 'react';
import { SymbolPair } from '@/components/ui/CryptoIcon';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import {
  X,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  Settings,
  Pencil,
  Check,
  Clock,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { paneStores, lastKnownPrices } from '@/store/paneStore';
import { usePaperStore, COMMISSION_RATE, CRYPTO_LEVERAGE_OPTIONS } from '@/store/paperStore';
import type { JournalEntry, HistoricalOrder, PendingOrder } from '@/store/paperStore';
import type { PanelSize } from '@/pages/DashboardPage';
import { bg, color, fontSize } from '@/lib/tokens';
import { useLayoutStore } from '@/store/layoutStore';
import { useTradingSoundCtx } from '@/hooks/TradingSoundContext';
import { SoundSettings } from './SoundSettings';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

type InfoTab = 'positions' | 'orders' | 'history' | 'journal';
type ColTab = 'positions' | 'orders' | 'history';
type OrderSubTab = 'all' | 'working' | 'filled' | 'cancelled' | 'rejected';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Unix-ms timestamp → "YYYY-MM-DD HH:MM:SS" (local time) */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Truncate long IDs for display; full value shown on hover via title */
function shortId(id: string): string {
  return id.length > 10 ? `…${id.slice(-10)}` : id;
}

// ─── Stagger helpers ──────────────────────────────────────────────────────────

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.2, ease: 'easeOut' as const },
  }),
  exit: { opacity: 0, x: -14, transition: { duration: 0.16, ease: 'easeIn' as const } },
};

// ─── Column definitions ───────────────────────────────────────────────────────

interface ColDef {
  id: string;
  label: string;
  align: 'left' | 'right' | 'center';
  defaultOn: boolean;
  /** Always shown — not toggleable */
  sticky?: boolean;
}

const POSITION_COLS: ColDef[] = [
  { id: 'symbol', label: 'Symbol', align: 'left', defaultOn: true, sticky: true },
  { id: 'side', label: 'Side', align: 'left', defaultOn: true },
  { id: 'qty', label: 'Qty', align: 'right', defaultOn: true },
  { id: 'entry', label: 'Entry', align: 'right', defaultOn: true },
  { id: 'mark', label: 'Mark', align: 'right', defaultOn: true },
  { id: 'tp', label: 'TP', align: 'right', defaultOn: true },
  { id: 'sl', label: 'SL', align: 'right', defaultOn: true },
  { id: 'pnl', label: 'PnL (USDT)', align: 'right', defaultOn: true },
  { id: 'orderId', label: 'Order ID', align: 'right', defaultOn: false },
  { id: 'openedAt', label: 'Opened At', align: 'right', defaultOn: false },
  { id: 'leverage', label: 'Leverage', align: 'right', defaultOn: false },
  { id: 'margin', label: 'Margin', align: 'right', defaultOn: false },
  { id: 'commission', label: 'Commission', align: 'right', defaultOn: false },
  { id: 'close', label: 'Close', align: 'center', defaultOn: true, sticky: true },
];

const ORDER_COLS: ColDef[] = [
  { id: 'symbol', label: 'Symbol', align: 'left', defaultOn: true, sticky: true },
  { id: 'status', label: 'Status', align: 'left', defaultOn: true },
  { id: 'type', label: 'Type', align: 'left', defaultOn: true },
  { id: 'side', label: 'Side', align: 'left', defaultOn: true },
  { id: 'qty', label: 'Qty', align: 'right', defaultOn: true },
  { id: 'limitPrice', label: 'Limit Price', align: 'right', defaultOn: true },
  { id: 'stopPrice', label: 'Stop Price', align: 'right', defaultOn: true },
  { id: 'fillPrice', label: 'Fill Price', align: 'right', defaultOn: true },
  { id: 'tp', label: 'TP', align: 'right', defaultOn: true },
  { id: 'sl', label: 'SL', align: 'right', defaultOn: true },
  { id: 'commission', label: 'Commission', align: 'right', defaultOn: true },
  { id: 'placedAt', label: 'Placing Time', align: 'right', defaultOn: true },
  { id: 'orderId', label: 'Order ID', align: 'right', defaultOn: false },
  { id: 'leverage', label: 'Leverage', align: 'right', defaultOn: false },
  { id: 'margin', label: 'Margin', align: 'right', defaultOn: false },
  { id: 'cancel', label: 'Cancel', align: 'center', defaultOn: true, sticky: true },
];

const HISTORY_COLS: ColDef[] = [
  { id: 'symbol', label: 'Symbol', align: 'left', defaultOn: true, sticky: true },
  { id: 'status', label: 'Status', align: 'left', defaultOn: true },
  { id: 'side', label: 'Side', align: 'left', defaultOn: true },
  { id: 'qty', label: 'Qty', align: 'right', defaultOn: true },
  { id: 'entry', label: 'Entry', align: 'right', defaultOn: true },
  { id: 'exit', label: 'Exit', align: 'right', defaultOn: true },
  { id: 'pnl', label: 'PnL (USDT)', align: 'right', defaultOn: true },
  { id: 'openedAt', label: 'Placing Time', align: 'right', defaultOn: true },
  { id: 'closedAt', label: 'Closing Time', align: 'right', defaultOn: true },
  { id: 'orderId', label: 'Order ID', align: 'right', defaultOn: false },
  { id: 'leverage', label: 'Leverage', align: 'right', defaultOn: false },
];

const COLS_BY_TAB: Record<ColTab, ColDef[]> = {
  positions: POSITION_COLS,
  orders: ORDER_COLS,
  history: HISTORY_COLS,
};

// ─── Column prefs persistence ─────────────────────────────────────────────────

const COL_PREFS_KEY = 'cd-paper-col-prefs';

function loadColPrefs(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(COL_PREFS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function saveColPrefs(prefs: Record<string, string[]>) {
  try {
    localStorage.setItem(COL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PaperTradingPanelProps {
  size: PanelSize;
  onSizeChange: (size: PanelSize) => void;
  /** True when the panel is expanded to fill the full chart area */
  isMaximized: boolean;
  onToggleMaximize: () => void;
}

// ─── Sub-component: journal row ───────────────────────────────────────────────

interface JournalRowProps {
  entry: JournalEntry;
  editingId: string | null;
  editText: string;
  onStartEdit: (entry: JournalEntry) => void;
  onEditChange: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

function JournalRow({
  entry,
  editingId,
  editText,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
}: JournalRowProps) {
  const isEditing = editingId === entry.id;

  return (
    <tr className="group border-b border-white/3 transition-colors hover:bg-white/2">
      {/* Time */}
      <td
        className="shrink-0 whitespace-nowrap px-3 py-1.5 font-mono tabular-nums"
        style={{ fontSize: fontSize.xs11, color: color.muted, minWidth: 152 }}
      >
        {fmtTime(entry.time)}
      </td>

      {/* Text */}
      <td className="w-full px-3 py-1.5 text-white/70" style={{ fontSize: fontSize.xs11 }}>
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={editText}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              onBlur={onSaveEdit}
              className="flex-1 rounded border border-white/8 px-2 py-0.5 text-white focus:outline-none focus:border-brand-purple-dark/50"
              style={{ fontSize: fontSize.xs11, background: bg.surface }}
            />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                onSaveEdit();
              }}
              style={{ color: color.green }}
              className="shrink-0 hover:brightness-125"
            >
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-2 flex-wrap">
            <span>{entry.text}</span>
            {entry.pnl !== undefined && (
              <span
                className="shrink-0 rounded px-1.5 py-px font-semibold tabular-nums"
                style={{
                  fontSize: fontSize.xs10,
                  color: entry.pnl >= 0 ? color.green : color.red,
                  background: entry.pnl >= 0 ? `${color.green}18` : `${color.red}18`,
                }}
              >
                {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toFixed(2)}
              </span>
            )}
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="px-2 py-1.5 text-right" style={{ minWidth: 28 }}>
        {entry.isUserNote && !isEditing && (
          <button
            onClick={() => onStartEdit(entry)}
            title="Edit note"
            className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-brand-purple"
            style={{ color: color.muted }}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaperTradingPanel({
  size,
  onSizeChange,
  isMaximized,
  onToggleMaximize,
}: PaperTradingPanelProps) {
  const [infoTab, setInfoTab] = useState<InfoTab>('positions');
  const [orderSubTab, setOrderSubTab] = useState<OrderSubTab>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  // Keep a local draft for the settings dialog, but refresh it from the
  // persisted store value each time the dialog is opened.
  const [draftLeverage, setDraftLeverage] = useState(() => usePaperStore.getState().leverage);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync draftLeverage with the stored value whenever the settings dialog opens.
  // We read from the `leverage` reactive selector (already subscribed above) so
  // the effect only runs when showSettings transitions to true.
  const prevShowSettingsRef = useRef(showSettings);
  if (showSettings && !prevShowSettingsRef.current) {
    // Read directly from the store (not the reactive selector — leverage is
    // declared further down the component and can't be used here yet).
    setDraftLeverage(usePaperStore.getState().leverage);
  }
  prevShowSettingsRef.current = showSettings;

  // ── Column picker state ────────────────────────────────────────────────────
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [visibleCols, setVisibleCols] = useState<Record<string, string[]>>(() => {
    const saved = loadColPrefs();
    const result: Record<string, string[]> = {};
    for (const [tab, cols] of Object.entries(COLS_BY_TAB) as [ColTab, ColDef[]][]) {
      result[tab] = saved[tab] ?? cols.filter((c) => c.defaultOn).map((c) => c.id);
    }
    return result;
  });

  // Close picker on outside click
  useEffect(() => {
    if (!colPickerOpen) return;
    function handleOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [colPickerOpen]);

  // Clear the reset confirmation timer on unmount to avoid state updates on an unmounted component
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  // ── Journal UI state ──────────────────────────────────────────────────────
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // ── Store ─────────────────────────────────────────────────────────────────
  // Build a per-symbol price map from all 4 pane stores so that positions in
  // any symbol show the correct mark price regardless of which pane is active.
  const lp0 = useStore(paneStores[0], (s) => s.latestPrice);
  const lp1 = useStore(paneStores[1], (s) => s.latestPrice);
  const lp2 = useStore(paneStores[2], (s) => s.latestPrice);
  const lp3 = useStore(paneStores[3], (s) => s.latestPrice);
  const paneSymbols = useLayoutStore(useShallow((s) => s.panes.map((p) => p.symbol)));
  const priceBySymbol: Record<string, number> = {};
  [lp0, lp1, lp2, lp3].forEach((lp, i) => {
    if (lp !== null) priceBySymbol[paneSymbols[i]] = lp;
  });
  // Helper: get the best available price for a symbol — live pane price first,
  // then the last known price (persisted across symbol switches), then null.
  function getPriceForSymbol(sym: string): number | null {
    return priceBySymbol[sym] ?? lastKnownPrices.get(sym) ?? null;
  }

  const balance = usePaperStore((s) => s.balance);
  const positions = usePaperStore((s) => s.positions);
  const pendingOrders = usePaperStore((s) => s.pendingOrders);
  const history = usePaperStore((s) => s.history);
  const orders = usePaperStore((s) => s.orders);
  const journal = usePaperStore((s) => s.journal);
  const closePosition = usePaperStore((s) => s.closePosition);
  const cancelPendingOrder = usePaperStore((s) => s.cancelPendingOrder);
  const addJournalNote = usePaperStore((s) => s.addJournalNote);
  const editJournalEntry = usePaperStore((s) => s.editJournalEntry);
  const reset = usePaperStore((s) => s.reset);
  const leverage = usePaperStore((s) => s.leverage);
  const setLeverage = usePaperStore((s) => s.setLeverage);
  const sound = useTradingSoundCtx();
  const username = useAuthStore((s) => s.user?.username ?? 'Account');

  // ── Merged history rows (closed trades + rejected orders) ─────────────────
  type HistoryRow =
    | { kind: 'trade'; data: (typeof history)[number] }
    | { kind: 'rejected'; data: HistoricalOrder };

  const rejectedOrders = orders.filter((o) => o.status === 'rejected');
  const historyRows: HistoryRow[] = [
    ...history.map((t) => ({ kind: 'trade' as const, data: t })),
    ...rejectedOrders.map((o) => ({ kind: 'rejected' as const, data: o })),
  ].sort((a, b) => {
    const ta = a.kind === 'trade' ? a.data.closedAt : a.data.closingTime;
    const tb = b.kind === 'trade' ? b.data.closedAt : b.data.closingTime;
    return tb - ta;
  });

  const unrealizedPnl = positions.reduce((sum, pos) => {
    const markPrice = getPriceForSymbol(pos.symbol);
    if (!markPrice) return sum;
    const pnl =
      pos.side === 'long'
        ? (markPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - markPrice) * pos.quantity;
    return sum + pnl;
  }, 0);

  // ── Derived account stats ──────────────────────────────────────────────────
  const reserved = pendingOrders.reduce((s, o) => s + o.usdtAmount, 0);
  // lockedPositionCapital = sum of all open-position margins (already deducted from balance)
  const lockedPositionCapital = positions.reduce((sum, pos) => sum + pos.entryUsdtAmount, 0);
  // balance is already free cash (margin + commissions already deducted at open)
  const available = balance;
  const equity = balance + lockedPositionCapital + unrealizedPnl;
  const totalTrades = history.length;
  const winningTrades = history.filter((t) => t.pnl > 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : null;
  const realizedPnl = history.reduce((s, t) => s + t.pnl, 0);

  // ── Unified order display rows (pending + historical) ─────────────────────
  type OrderDisplayRow =
    | { kind: 'pending'; data: PendingOrder }
    | { kind: 'historical'; data: HistoricalOrder };

  // Market orders execute instantly and are recorded in History (ClosedTrade).
  // The Orders tab mirrors TradingView: only limit/stop order lifecycle is shown here.
  const allOrderDisplayRows: OrderDisplayRow[] = [
    ...pendingOrders.map((o) => ({ kind: 'pending' as const, data: o })),
    ...orders
      .filter((o) => o.type !== 'market') // market orders belong in History, not Orders tab
      .map((o) => ({ kind: 'historical' as const, data: o })),
  ].sort((a, b) => {
    const ta = a.kind === 'pending' ? a.data.placedAt : a.data.placingTime;
    const tb = b.kind === 'pending' ? b.data.placedAt : b.data.placingTime;
    return tb - ta;
  });

  const filteredOrderRows: OrderDisplayRow[] =
    orderSubTab === 'all'
      ? allOrderDisplayRows
      : orderSubTab === 'working'
        ? allOrderDisplayRows.filter((r) => r.kind === 'pending')
        : orderSubTab === 'filled'
          ? allOrderDisplayRows.filter((r) => r.kind === 'historical' && r.data.status === 'filled')
          : orderSubTab === 'cancelled'
            ? allOrderDisplayRows.filter(
                (r) => r.kind === 'historical' && r.data.status === 'cancelled'
              )
            : allOrderDisplayRows.filter(
                (r) => r.kind === 'historical' && r.data.status === 'rejected'
              );

  // ── Column helpers ─────────────────────────────────────────────────────────
  function isVisible(tab: ColTab, colId: string): boolean {
    const def = COLS_BY_TAB[tab].find((c) => c.id === colId);
    if (def?.sticky) return true;
    return (visibleCols[tab] ?? []).includes(colId);
  }

  function toggleColVisibility(tab: ColTab, colId: string) {
    setVisibleCols((prev) => {
      const current = prev[tab] ?? [];
      const next = current.includes(colId)
        ? current.filter((id) => id !== colId)
        : [...current, colId];
      const updated = { ...prev, [tab]: next };
      saveColPrefs(updated);
      return updated;
    });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleClose(positionId: string) {
    const pos = positions.find((p) => p.id === positionId);
    if (!pos) return;
    const markPrice = getPriceForSymbol(pos.symbol);
    if (!markPrice) return;
    const pnl =
      pos.side === 'long'
        ? (markPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - markPrice) * pos.quantity;
    closePosition(positionId, markPrice);
    if (pnl >= 0) sound.playProfit();
    else sound.playLoss();
  }

  function handleSaveNote() {
    if (noteText.trim()) addJournalNote(noteText.trim());
    setNoteText('');
    setIsAddingNote(false);
  }

  function handleStartEdit(entry: JournalEntry) {
    setEditingId(entry.id);
    setEditText(entry.text);
  }

  function handleSaveEdit() {
    if (editingId && editText.trim()) editJournalEntry(editingId, editText.trim());
    setEditingId(null);
    setEditText('');
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-full w-full flex-col border-t border-white/6"
      style={{ background: bg.page }}
    >
      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div
        className="flex h-9 shrink-0 items-center justify-between border-b border-white/5 px-3"
        style={{ background: bg.panel }}
      >
        {/* Left: panel label */}
        <span className="text-xs font-bold text-white/80 tracking-wide">Paper Trading</span>

        {/* Right: gear (settings) + sound + collapse + close */}
        <div className="flex items-center gap-0.5">
          <SoundSettings />
          <motion.button
            onClick={() => setShowSettings(true)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Account settings"
            className="flex h-6 w-6 items-center justify-center rounded hover:text-white"
            style={{ color: color.muted }}
          >
            <Settings className="h-3.5 w-3.5" />
          </motion.button>

          {/* Collapse / Expand — hidden while maximized */}
          {!isMaximized &&
            size !== 'hidden' &&
            (size === 'open' ? (
              <motion.button
                onClick={() => onSizeChange('collapsed')}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Collapse"
                className="flex h-6 w-6 items-center justify-center rounded hover:text-white"
                style={{ color: color.muted }}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </motion.button>
            ) : (
              <motion.button
                onClick={() => onSizeChange('open')}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Expand"
                className="flex h-6 w-6 items-center justify-center rounded hover:text-white"
                style={{ color: color.muted }}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </motion.button>
            ))}

          {/* Maximize / Restore */}
          <motion.button
            onClick={onToggleMaximize}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title={isMaximized ? 'Restore panel' : 'Maximize panel'}
            className="flex h-6 w-6 items-center justify-center rounded hover:text-white"
            style={{ color: color.muted }}
          >
            {isMaximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </motion.button>

          {/* Close */}
          <motion.button
            onClick={() => onSizeChange('hidden')}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Close panel"
            className="flex h-6 w-6 items-center justify-center rounded hover:text-brand-red"
            style={{ color: color.muted }}
          >
            <X className="h-3.5 w-3.5" />
          </motion.button>
        </div>
      </div>

      {/* ── Panel content ─────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {(size !== 'collapsed' || isMaximized) && (
          <motion.div
            key="panel-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* ── Account Summary Bar ─────────────────────────────────────── */}
            <div
              className="flex shrink-0 items-center gap-4 overflow-x-auto border-b border-white/4 px-3 py-1.5 scrollbar-none"
              style={{ background: bg.panel }}
            >
              {(
                [
                  {
                    label: 'Balance',
                    value: `$${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    col: undefined,
                  },
                  {
                    label: 'Equity',
                    value: `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    col: undefined,
                  },
                  {
                    label: 'Unrealized P&L',
                    value: `${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)}`,
                    col: unrealizedPnl >= 0 ? color.green : color.red,
                  },
                  {
                    label: 'Realized P&L',
                    value: `${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}`,
                    col: realizedPnl >= 0 ? color.green : color.red,
                  },
                  {
                    label: 'Available',
                    value: `$${available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    col: undefined,
                  },
                  {
                    label: 'Reserved',
                    value: reserved > 0 ? `$${reserved.toFixed(2)}` : '—',
                    col: undefined,
                  },
                  {
                    label: 'Win Rate',
                    value: winRate !== null ? `${winRate.toFixed(0)}%` : '—',
                    col: winRate !== null ? (winRate >= 50 ? color.green : color.red) : undefined,
                  },
                ] as { label: string; value: string; col: string | undefined }[]
              ).map(({ label, value, col }) => (
                <div key={label} className="flex shrink-0 flex-col gap-px">
                  <span
                    style={{ fontSize: fontSize.xs10, color: color.muted }}
                    className="whitespace-nowrap font-medium uppercase tracking-wider"
                  >
                    {label}
                  </span>
                  <span
                    className="whitespace-nowrap tabular-nums font-semibold"
                    style={{ fontSize: fontSize.xs11, color: col ?? 'rgba(255,255,255,0.75)' }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Tab bar ─────────────────────────────────────────────────── */}
            <div
              className="relative flex items-center border-b border-white/6"
              style={{ background: bg.panel }}
            >
              {(['positions', 'orders', 'history', 'journal'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setInfoTab(tab);
                    setColPickerOpen(false);
                  }}
                  className="relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold capitalize transition-colors"
                  style={{ color: infoTab === tab ? color.purple : color.muted }}
                >
                  {infoTab === tab && (
                    <motion.span
                      layoutId="active-bottom-tab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                      style={{ background: color.purpleDark }}
                    />
                  )}
                  {tab}
                  {tab === 'positions' && positions.length > 0 && (
                    <span
                      className="rounded-full px-1.5 py-px font-bold text-white"
                      style={{ fontSize: fontSize.xxs, background: color.purpleDark }}
                    >
                      {positions.length}
                    </span>
                  )}
                  {tab === 'orders' && pendingOrders.length > 0 && (
                    <span
                      className="rounded-full px-1.5 py-px font-bold text-white"
                      style={{ fontSize: fontSize.xxs, background: color.amber }}
                    >
                      {pendingOrders.length}
                    </span>
                  )}
                  {tab === 'history' && historyRows.length > 0 && (
                    <span
                      className="rounded-full bg-white/8 px-1.5 py-px font-semibold"
                      style={{ fontSize: fontSize.xxs, color: color.muted }}
                    >
                      {historyRows.length}
                    </span>
                  )}
                  {tab === 'journal' && journal.length > 0 && (
                    <span
                      className="rounded-full bg-white/8 px-1.5 py-px font-semibold"
                      style={{ fontSize: fontSize.xxs, color: color.muted }}
                    >
                      {journal.length}
                    </span>
                  )}
                </button>
              ))}

              {/* ── Column picker button — only for data tabs ─────────────── */}
              {infoTab !== 'journal' && (
                <div className="relative ml-auto pr-2" ref={pickerRef}>
                  <motion.button
                    onClick={() => setColPickerOpen((o) => !o)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    title="Customize columns"
                    className="flex h-6 w-6 items-center justify-center rounded transition-colors"
                    style={{ color: colPickerOpen ? color.purple : color.muted }}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </motion.button>

                  <AnimatePresence>
                    {colPickerOpen && (
                      <motion.div
                        key="col-picker"
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full z-50 min-w-40 overflow-hidden rounded-md border border-white/10 py-1 shadow-xl"
                        style={{ background: bg.panel }}
                      >
                        {COLS_BY_TAB[infoTab as ColTab]
                          .filter((c) => !c.sticky)
                          .map((col) => {
                            const on = isVisible(infoTab as ColTab, col.id);
                            return (
                              <button
                                key={col.id}
                                onClick={() => toggleColVisibility(infoTab as ColTab, col.id)}
                                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/5"
                                style={{
                                  fontSize: fontSize.xs11,
                                  color: on ? '#fff' : color.muted,
                                }}
                              >
                                {/* Checkbox */}
                                <span
                                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border"
                                  style={{
                                    borderColor: on ? color.purpleDark : `${color.muted}60`,
                                    background: on ? `${color.purpleDark}30` : 'transparent',
                                  }}
                                >
                                  {on && (
                                    <svg viewBox="0 0 11 9" width="9" height="7" fill="none">
                                      <path
                                        stroke={color.purpleDark}
                                        strokeWidth="2"
                                        d="M0.999878 4L3.99988 7L9.99988 1"
                                      />
                                    </svg>
                                  )}
                                </span>
                                {col.label}
                              </button>
                            );
                          })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* ── Orders sub-tab bar ──────────────────────────────────────── */}
            {infoTab === 'orders' && (
              <div
                className="flex shrink-0 items-center gap-0 border-b border-white/4 px-2"
                style={{ background: bg.panel }}
              >
                {(['all', 'working', 'filled', 'cancelled', 'rejected'] as OrderSubTab[]).map(
                  (sub) => {
                    const count =
                      sub === 'all'
                        ? allOrderDisplayRows.length
                        : sub === 'working'
                          ? allOrderDisplayRows.filter((r) => r.kind === 'pending').length
                          : allOrderDisplayRows.filter(
                              (r) => r.kind === 'historical' && r.data.status === sub
                            ).length;
                    return (
                      <button
                        key={sub}
                        onClick={() => setOrderSubTab(sub)}
                        className="relative flex items-center gap-1 px-3 py-1.5 transition-colors"
                        style={{
                          fontSize: fontSize.xs11,
                          fontWeight: orderSubTab === sub ? 600 : 400,
                          color: orderSubTab === sub ? color.purple : color.muted,
                        }}
                      >
                        {orderSubTab === sub && (
                          <motion.span
                            layoutId="order-sub-tab"
                            className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                            style={{ background: color.purpleDark }}
                          />
                        )}
                        <span className="capitalize">
                          {sub === 'all' ? 'All' : sub.charAt(0).toUpperCase() + sub.slice(1)}
                        </span>
                        {count > 0 && (
                          <span
                            className="rounded-full px-1 py-px tabular-nums"
                            style={{
                              fontSize: fontSize.xxs,
                              background:
                                orderSubTab === sub
                                  ? `${color.purpleDark}40`
                                  : 'rgba(255,255,255,0.07)',
                              color: orderSubTab === sub ? color.purple : color.muted,
                            }}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            )}

            {/* ── Scrollable table area ────────────────────────────────────── */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={infoTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  {/* ════ Positions ════════════════════════════════════════════════ */}
                  {infoTab === 'positions' &&
                    (positions.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex h-full items-center justify-center text-xs"
                        style={{ color: color.muted }}
                      >
                        No open positions
                      </motion.div>
                    ) : (
                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr
                              className="border-b border-white/4"
                              style={{
                                background: bg.panel,
                                fontSize: fontSize.xs10,
                                color: color.muted,
                              }}
                            >
                              {POSITION_COLS.filter((c) => isVisible('positions', c.id)).map(
                                (col) => (
                                  <th
                                    key={col.id}
                                    className={`px-3 py-1.5 font-semibold uppercase tracking-wider text-${col.align}`}
                                  >
                                    {col.label}
                                  </th>
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            <AnimatePresence>
                              {positions.map((pos, i) => {
                                const markPrice = getPriceForSymbol(pos.symbol) ?? pos.entryPrice;
                                const pnl =
                                  pos.side === 'long'
                                    ? (markPrice - pos.entryPrice) * pos.quantity
                                    : (pos.entryPrice - markPrice) * pos.quantity;
                                const pnlPct = (pnl / pos.entryUsdtAmount) * 100;
                                const isProfit = pnl >= 0;
                                const margin = pos.entryUsdtAmount;
                                const commission = pos.entryUsdtAmount * COMMISSION_RATE;

                                return (
                                  <motion.tr
                                    key={pos.id}
                                    custom={i}
                                    variants={rowVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    layout
                                    className="border-b border-white/3 transition-colors hover:bg-white/2"
                                  >
                                    {isVisible('positions', 'symbol') && (
                                      <td className="px-3 py-1.5">
                                        <span className="flex items-center gap-2">
                                          <SymbolPair
                                            base={pos.symbol.replace('USDT', '')}
                                            quote="USDT"
                                            baseSize={16}
                                          />
                                          <span className="font-bold text-white">{pos.symbol}</span>
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('positions', 'side') && (
                                      <td className="px-3 py-1.5">
                                        <span
                                          className="flex items-center gap-0.5 font-bold"
                                          style={{
                                            fontSize: fontSize.xs10,
                                            color: pos.side === 'long' ? color.green : color.red,
                                          }}
                                        >
                                          {pos.side === 'long' ? (
                                            <TrendingUp className="h-3 w-3" />
                                          ) : (
                                            <TrendingDown className="h-3 w-3" />
                                          )}
                                          {pos.side === 'long' ? 'LONG' : 'SHORT'}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('positions', 'qty') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {pos.quantity.toFixed(6)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'entry') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        ${pos.entryPrice.toFixed(2)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'mark') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        ${markPrice.toFixed(2)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'tp') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{
                                          fontSize: fontSize.xs10,
                                          color: pos.takeProfit ? color.green : color.muted,
                                        }}
                                      >
                                        {pos.takeProfit ? `$${pos.takeProfit.toFixed(2)}` : '—'}
                                      </td>
                                    )}
                                    {isVisible('positions', 'sl') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{
                                          fontSize: fontSize.xs10,
                                          color: pos.stopLoss ? color.red : color.muted,
                                        }}
                                      >
                                        {pos.stopLoss ? `$${pos.stopLoss.toFixed(2)}` : '—'}
                                      </td>
                                    )}
                                    {isVisible('positions', 'pnl') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums font-semibold"
                                        style={{ color: isProfit ? color.green : color.red }}
                                      >
                                        {isProfit ? '+' : ''}
                                        {pnl.toFixed(2)}{' '}
                                        <span
                                          style={{ fontSize: fontSize.xs10 }}
                                          className="opacity-70"
                                        >
                                          ({isProfit ? '+' : ''}
                                          {pnlPct.toFixed(2)}%)
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('positions', 'orderId') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums font-mono"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                        title={pos.id}
                                      >
                                        {shortId(pos.id)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'openedAt') && (
                                      <td
                                        className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {fmtTime(pos.openedAt)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'leverage') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {leverage}×
                                      </td>
                                    )}
                                    {isVisible('positions', 'margin') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        ${margin.toFixed(2)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'commission') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        ${commission.toFixed(4)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'close') && (
                                      <td className="px-3 py-1.5 text-center">
                                        <motion.button
                                          onClick={() => handleClose(pos.id)}
                                          whileHover={{ scale: 1.2 }}
                                          whileTap={{ scale: 0.9 }}
                                          title="Close at market price"
                                          className="mx-auto flex h-5 w-5 items-center justify-center rounded transition-colors hover:text-brand-red"
                                          style={{ color: color.muted }}
                                        >
                                          <X className="h-3 w-3" />
                                        </motion.button>
                                      </td>
                                    )}
                                  </motion.tr>
                                );
                              })}
                            </AnimatePresence>
                          </tbody>
                        </table>
                      </div>
                    ))}

                  {/* ════ Pending Orders ═══════════════════════════════════════════ */}
                  {infoTab === 'orders' &&
                    (filteredOrderRows.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex h-full flex-col items-center justify-center gap-1 text-xs"
                        style={{ color: color.muted }}
                      >
                        <Clock className="h-4 w-4 opacity-40" />
                        No orders
                      </motion.div>
                    ) : (
                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr
                              className="border-b border-white/4"
                              style={{
                                background: bg.panel,
                                fontSize: fontSize.xs10,
                                color: color.muted,
                              }}
                            >
                              {ORDER_COLS.filter((c) => isVisible('orders', c.id)).map((col) => (
                                <th
                                  key={col.id}
                                  className={`px-3 py-1.5 font-semibold uppercase tracking-wider text-${col.align}`}
                                >
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <AnimatePresence>
                              {filteredOrderRows.map((row, i) => {
                                const isPending = row.kind === 'pending';
                                const p = isPending ? row.data : null;
                                const h = !isPending ? row.data : null;
                                const rowId = row.data.id;
                                const symbol = row.data.symbol;
                                const side = row.data.side;
                                const type = row.data.type;
                                const qty = row.data.qty;
                                const placingTs = isPending ? p!.placedAt : h!.placingTime;

                                // status badge config
                                const statusLabel = isPending
                                  ? 'Working'
                                  : h!.status === 'filled'
                                    ? 'Filled'
                                    : h!.status === 'cancelled'
                                      ? 'Cancelled'
                                      : 'Rejected';
                                const statusColor = isPending
                                  ? color.amber
                                  : h!.status === 'filled'
                                    ? color.green
                                    : h!.status === 'cancelled'
                                      ? color.muted
                                      : color.red;

                                return (
                                  <motion.tr
                                    key={rowId}
                                    custom={i}
                                    variants={rowVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    layout
                                    className="border-b border-white/3 transition-colors hover:bg-white/2"
                                  >
                                    {isVisible('orders', 'symbol') && (
                                      <td className="px-3 py-1.5">
                                        <span className="flex items-center gap-2">
                                          <SymbolPair
                                            base={symbol.replace('USDT', '')}
                                            quote="USDT"
                                            baseSize={16}
                                          />
                                          <span className="font-bold text-white">{symbol}</span>
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orders', 'status') && (
                                      <td className="px-3 py-1.5">
                                        <span
                                          className="rounded px-1.5 py-px font-bold uppercase"
                                          style={{
                                            fontSize: fontSize.xs10,
                                            background: `${statusColor}22`,
                                            color: statusColor,
                                          }}
                                        >
                                          {statusLabel}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orders', 'type') && (
                                      <td className="px-3 py-1.5">
                                        <span
                                          className="rounded px-1 py-px font-bold uppercase"
                                          style={{
                                            fontSize: fontSize.xs10,
                                            background:
                                              type === 'limit'
                                                ? `${color.purpleDark}33`
                                                : `${color.amber}22`,
                                            color:
                                              type === 'limit' ? color.purpleDark : color.amber,
                                          }}
                                        >
                                          {type}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orders', 'side') && (
                                      <td className="px-3 py-1.5">
                                        <span
                                          className="font-bold uppercase"
                                          style={{
                                            fontSize: fontSize.xs10,
                                            color: side === 'buy' ? color.green : color.red,
                                          }}
                                        >
                                          {side === 'buy' ? 'Buy' : 'Sell'}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orders', 'qty') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {qty > 0 ? qty.toFixed(6) : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'limitPrice') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                        {isPending
                                          ? type === 'limit'
                                            ? `$${p!.triggerPrice.toFixed(2)}`
                                            : '—'
                                          : h!.limitPrice != null
                                            ? `$${h!.limitPrice.toFixed(2)}`
                                            : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'stopPrice') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                        {isPending
                                          ? type === 'stop'
                                            ? `$${p!.triggerPrice.toFixed(2)}`
                                            : '—'
                                          : h!.stopPrice != null
                                            ? `$${h!.stopPrice.toFixed(2)}`
                                            : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'fillPrice') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                        {!isPending && h!.fillPrice != null
                                          ? `$${h!.fillPrice.toFixed(2)}`
                                          : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'tp') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{
                                          fontSize: fontSize.xs10,
                                          color:
                                            isPending && p!.takeProfit ? color.green : color.muted,
                                        }}
                                      >
                                        {isPending && p!.takeProfit
                                          ? `$${p!.takeProfit.toFixed(2)}`
                                          : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'sl') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{
                                          fontSize: fontSize.xs10,
                                          color: isPending && p!.stopLoss ? color.red : color.muted,
                                        }}
                                      >
                                        {isPending && p!.stopLoss
                                          ? `$${p!.stopLoss.toFixed(2)}`
                                          : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'commission') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {!isPending ? h!.commission.toFixed(4) : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'placedAt') && (
                                      <td
                                        className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {fmtTime(placingTs)}
                                      </td>
                                    )}
                                    {isVisible('orders', 'orderId') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums font-mono"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                        title={rowId}
                                      >
                                        {shortId(rowId)}
                                      </td>
                                    )}
                                    {isVisible('orders', 'leverage') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {leverage}×
                                      </td>
                                    )}
                                    {isVisible('orders', 'margin') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {isPending ? `$${p!.usdtAmount.toFixed(2)}` : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'cancel') && (
                                      <td className="px-3 py-1.5 text-center">
                                        {isPending ? (
                                          <motion.button
                                            onClick={() => cancelPendingOrder(rowId)}
                                            whileHover={{ scale: 1.2 }}
                                            whileTap={{ scale: 0.9 }}
                                            title="Cancel pending order (balance refunded)"
                                            className="mx-auto flex h-5 w-5 items-center justify-center rounded transition-colors hover:text-brand-red"
                                            style={{ color: color.muted }}
                                          >
                                            <X className="h-3 w-3" />
                                          </motion.button>
                                        ) : (
                                          <span
                                            style={{ color: color.muted, fontSize: fontSize.xs10 }}
                                          >
                                            —
                                          </span>
                                        )}
                                      </td>
                                    )}
                                  </motion.tr>
                                );
                              })}
                            </AnimatePresence>
                          </tbody>
                        </table>
                      </div>
                    ))}

                  {/* ════ History ══════════════════════════════════════════════════ */}
                  {infoTab === 'history' &&
                    (historyRows.length > 0 ? (
                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr
                              className="border-b border-white/4"
                              style={{
                                background: bg.panel,
                                fontSize: fontSize.xs10,
                                color: color.muted,
                              }}
                            >
                              {HISTORY_COLS.filter((c) => isVisible('history', c.id)).map((col) => (
                                <th
                                  key={col.id}
                                  className={`px-3 py-1.5 font-semibold uppercase tracking-wider text-${col.align}`}
                                >
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <AnimatePresence>
                              {historyRows.map((row, i) => {
                                const isRejected = row.kind === 'rejected';
                                const rowId = row.kind === 'trade' ? row.data.id : row.data.id;
                                const symbol = row.data.symbol;
                                const side =
                                  row.kind === 'trade'
                                    ? row.data.side
                                    : row.data.side === 'buy'
                                      ? 'long'
                                      : 'short';
                                return (
                                  <motion.tr
                                    key={rowId}
                                    custom={i}
                                    variants={rowVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="border-b border-white/3 transition-colors hover:bg-white/2"
                                  >
                                    {isVisible('history', 'symbol') && (
                                      <td className="px-3 py-1.5">
                                        <span className="flex items-center gap-2">
                                          <SymbolPair
                                            base={symbol.replace('USDT', '')}
                                            quote="USDT"
                                            baseSize={16}
                                          />
                                          <span className="font-bold text-white">{symbol}</span>
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('history', 'status') && (
                                      <td className="px-3 py-1.5">
                                        {isRejected ? (
                                          <span
                                            className="inline-flex items-center gap-1"
                                            title={
                                              (row.data as HistoricalOrder).rejectionReason ??
                                              'Order rejected'
                                            }
                                            style={{ color: color.red, cursor: 'default' }}
                                          >
                                            <AlertTriangle
                                              className="shrink-0"
                                              style={{ width: 12, height: 12 }}
                                            />
                                            <span
                                              className="font-bold uppercase"
                                              style={{ fontSize: fontSize.xs10 }}
                                            >
                                              Rejected
                                            </span>
                                          </span>
                                        ) : (
                                          <span
                                            className="rounded px-1.5 py-px font-bold uppercase"
                                            style={{
                                              fontSize: fontSize.xs10,
                                              background: `${color.green}22`,
                                              color: color.green,
                                            }}
                                          >
                                            Filled
                                          </span>
                                        )}
                                      </td>
                                    )}
                                    {isVisible('history', 'side') && (
                                      <td
                                        className="px-3 py-1.5 font-bold"
                                        style={{
                                          fontSize: fontSize.xs10,
                                          color: side === 'long' ? color.green : color.red,
                                        }}
                                      >
                                        {side === 'long' ? 'LONG' : 'SHORT'}
                                      </td>
                                    )}
                                    {isVisible('history', 'qty') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {row.kind === 'trade'
                                          ? row.data.quantity.toFixed(6)
                                          : row.data.qty > 0
                                            ? row.data.qty.toFixed(6)
                                            : '—'}
                                      </td>
                                    )}
                                    {isVisible('history', 'entry') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {row.kind === 'trade'
                                          ? `$${row.data.entryPrice.toFixed(2)}`
                                          : '—'}
                                      </td>
                                    )}
                                    {isVisible('history', 'exit') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {row.kind === 'trade'
                                          ? `$${row.data.exitPrice.toFixed(2)}`
                                          : '—'}
                                      </td>
                                    )}
                                    {isVisible('history', 'pnl') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums font-semibold"
                                        style={{
                                          color:
                                            row.kind === 'trade'
                                              ? row.data.pnl >= 0
                                                ? color.green
                                                : color.red
                                              : color.muted,
                                        }}
                                      >
                                        {row.kind === 'trade'
                                          ? `${row.data.pnl >= 0 ? '+' : ''}${row.data.pnl.toFixed(2)}`
                                          : '—'}
                                      </td>
                                    )}
                                    {isVisible('history', 'openedAt') && (
                                      <td
                                        className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {row.kind === 'trade'
                                          ? fmtTime(row.data.openedAt)
                                          : fmtTime(row.data.placingTime)}
                                      </td>
                                    )}
                                    {isVisible('history', 'closedAt') && (
                                      <td
                                        className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {row.kind === 'trade'
                                          ? fmtTime(row.data.closedAt)
                                          : fmtTime(row.data.closingTime)}
                                      </td>
                                    )}
                                    {isVisible('history', 'orderId') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums font-mono"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                        title={row.data.id}
                                      >
                                        {shortId(row.data.id)}
                                      </td>
                                    )}
                                    {isVisible('history', 'leverage') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {leverage}×
                                      </td>
                                    )}
                                  </motion.tr>
                                );
                              })}
                            </AnimatePresence>
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex h-full items-center justify-center text-xs"
                        style={{ color: color.muted }}
                      >
                        No closed trades yet
                      </motion.div>
                    ))}

                  {/* ════ Journal ══════════════════════════════════════════════════ */}
                  {infoTab === 'journal' && (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <AnimatePresence initial={false}>
                        {isAddingNote && (
                          <motion.div
                            key="add-note"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-white/6 px-3 py-2"
                            style={{ background: bg.panel }}
                          >
                            <input
                              autoFocus
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveNote();
                                if (e.key === 'Escape') {
                                  setNoteText('');
                                  setIsAddingNote(false);
                                }
                              }}
                              placeholder="Type a journal note… (Enter to save)"
                              className="flex-1 rounded border border-white/8 px-2 py-1 text-white focus:outline-none focus:border-brand-purple-dark/50"
                              style={{ fontSize: fontSize.xs11, background: bg.surface }}
                            />
                            <button
                              onClick={handleSaveNote}
                              title="Save note"
                              className="shrink-0 hover:brightness-125"
                              style={{ color: color.green }}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setNoteText('');
                                setIsAddingNote(false);
                              }}
                              title="Cancel"
                              className="shrink-0 hover:text-white"
                              style={{ color: color.muted }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {journal.length === 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex h-full flex-col items-center justify-center gap-2 text-xs"
                          style={{ color: color.muted }}
                        >
                          <span>No journal entries yet — place a trade to see activity.</span>
                          <button
                            onClick={() => setIsAddingNote(true)}
                            className="flex items-center gap-1 transition-colors hover:brightness-125"
                            style={{ fontSize: fontSize.xs11, color: color.purple }}
                          >
                            <Pencil className="h-3 w-3" />
                            Add a note
                          </button>
                        </motion.div>
                      ) : (
                        <div className="flex-1 overflow-y-auto">
                          <table className="w-full">
                            <thead>
                              <tr
                                className="border-b border-white/4"
                                style={{
                                  background: bg.panel,
                                  fontSize: fontSize.xs10,
                                  color: color.muted,
                                }}
                              >
                                <th
                                  className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider"
                                  style={{ minWidth: 152 }}
                                >
                                  Time
                                </th>
                                <th className="w-full px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                                  Text
                                </th>
                                <th className="px-2 py-1.5 text-right" style={{ minWidth: 28 }}>
                                  <button
                                    onClick={() => setIsAddingNote(true)}
                                    title="Add journal note"
                                    className="ml-auto flex items-center justify-center transition-colors hover:text-brand-purple"
                                    style={{ color: color.muted }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {journal.map((entry) => (
                                <JournalRow
                                  key={entry.id}
                                  entry={entry}
                                  editingId={editingId}
                                  editText={editText}
                                  onStartEdit={handleStartEdit}
                                  onEditChange={setEditText}
                                  onSaveEdit={handleSaveEdit}
                                  onCancelEdit={handleCancelEdit}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Account Settings Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <>
            {/* Backdrop */}
            <motion.div
              key="settings-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.55)' }}
              onClick={() => {
                setShowSettings(false);
                setConfirmingReset(false);
                if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
              }}
            >
              {/* Modal — inside backdrop so it's naturally centered; stop-propagation prevents backdrop-click closing */}
              <motion.div
                key="settings-modal"
                initial={{ opacity: 0, scale: 0.93, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.93, y: 8 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="relative z-50 w-80 rounded-lg shadow-2xl"
                style={{
                  background: bg.panel,
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal header */}
                <div
                  className="flex items-center justify-between border-b px-4 py-3"
                  style={{ borderColor: 'rgba(255,255,255,0.07)' }}
                >
                  <span className="text-sm font-semibold text-white/90">Account Settings</span>
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      setConfirmingReset(false);
                      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded hover:text-white"
                    style={{ color: color.muted }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Modal body */}
                <div className="flex flex-col gap-4 px-4 py-4">
                  {/* Account name (read-only) */}
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-xs font-medium"
                      style={{ color: color.muted, fontSize: fontSize.xs11 }}
                    >
                      Account name
                    </label>
                    <div
                      className="flex h-8 items-center rounded px-3 text-xs text-white/60"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        fontSize: fontSize.xs,
                      }}
                    >
                      {username}
                    </div>
                  </div>

                  {/* Leverage — Crypto (interactive) */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label
                        className="font-semibold uppercase tracking-wider"
                        style={{ color: color.muted, fontSize: fontSize.xs11 }}
                      >
                        Leverage · Crypto
                      </label>
                      <span
                        className="rounded px-1.5 py-px font-bold"
                        style={{
                          fontSize: fontSize.xs10,
                          background:
                            draftLeverage > 1 ? `${color.amber}22` : 'rgba(255,255,255,0.06)',
                          color: draftLeverage > 1 ? color.amber : color.muted,
                        }}
                      >
                        {draftLeverage}×
                      </span>
                    </div>
                    {/* 12-button grid — Bybit style */}
                    <div className="grid grid-cols-6 gap-1">
                      {CRYPTO_LEVERAGE_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setDraftLeverage(opt)}
                          className="rounded py-1 text-center font-semibold transition-colors"
                          style={{
                            fontSize: fontSize.xs10,
                            background:
                              draftLeverage === opt
                                ? `${color.purple}33`
                                : 'rgba(255,255,255,0.05)',
                            color: draftLeverage === opt ? color.purple : 'rgba(255,255,255,0.55)',
                            border:
                              draftLeverage === opt
                                ? `1px solid ${color.purple}66`
                                : '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          {opt}×
                        </button>
                      ))}
                    </div>
                    {draftLeverage > 25 && (
                      <p
                        className="flex items-center gap-1"
                        style={{ fontSize: fontSize.xs10, color: color.red }}
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        High leverage increases liquidation risk.
                      </p>
                    )}
                  </div>

                  {/* Commission (read-only) */}
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-xs font-medium"
                      style={{ color: color.muted, fontSize: fontSize.xs11 }}
                    >
                      Commission
                    </label>
                    <div
                      className="flex h-8 items-center justify-between rounded px-3"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      <span style={{ fontSize: fontSize.xs, color: 'rgba(255,255,255,0.6)' }}>
                        {(COMMISSION_RATE * 100).toFixed(2)}% ({COMMISSION_RATE})
                      </span>
                      <span style={{ fontSize: fontSize.xs11, color: color.muted }}>
                        Fixed · Taker
                      </span>
                    </div>
                  </div>
                </div>

                {/* Modal footer */}
                <div
                  className="flex items-center justify-between border-t px-4 py-3"
                  style={{ borderColor: 'rgba(255,255,255,0.07)' }}
                >
                  {/* Reset account — 2-click confirm */}
                  <AnimatePresence mode="wait">
                    {confirmingReset ? (
                      <motion.button
                        key="confirm-reset"
                        initial={{ opacity: 0, scale: 0.88 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.88 }}
                        transition={{ duration: 0.12 }}
                        onClick={() => {
                          reset();
                          setConfirmingReset(false);
                          if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
                          setShowSettings(false);
                        }}
                        className="flex h-7 items-center gap-1.5 rounded px-3 text-xs font-bold"
                        style={{
                          background: `${color.red}22`,
                          color: color.red,
                          border: `1px solid ${color.red}50`,
                          fontSize: fontSize.xs,
                        }}
                      >
                        Confirm reset?
                      </motion.button>
                    ) : (
                      <motion.button
                        key="reset-btn"
                        initial={{ opacity: 0, scale: 0.88 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.88 }}
                        transition={{ duration: 0.12 }}
                        onClick={() => {
                          setConfirmingReset(true);
                          resetTimerRef.current = setTimeout(() => setConfirmingReset(false), 3000);
                        }}
                        className="flex h-7 items-center gap-1.5 rounded px-3 text-xs"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          color: color.muted,
                          border: '1px solid rgba(255,255,255,0.08)',
                          fontSize: fontSize.xs,
                        }}
                      >
                        Reset account
                      </motion.button>
                    )}
                  </AnimatePresence>

                  {/* Save */}
                  <button
                    onClick={() => {
                      setLeverage(draftLeverage);
                      setShowSettings(false);
                      setConfirmingReset(false);
                    }}
                    className="flex h-7 items-center rounded px-4 text-xs font-semibold transition-opacity hover:opacity-90"
                    style={{
                      background: 'rgba(165,85,226,0.75)',
                      color: '#fff',
                      fontSize: fontSize.xs,
                    }}
                  >
                    Save
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
