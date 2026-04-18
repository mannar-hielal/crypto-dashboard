import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import { useStore } from 'zustand';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';
import type { JournalEntry } from '@/store/paperStore';
import type { PanelSize } from '@/pages/DashboardPage';
import { bg, color, fontSize } from '@/lib/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

type InfoTab = 'positions' | 'orders' | 'history' | 'journal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Unix-ms timestamp → "YYYY-MM-DD HH:MM:SS" (local time) */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface PaperTradingPanelProps {
  size: PanelSize;
  onSizeChange: (size: PanelSize) => void;
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
          <span>{entry.text}</span>
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

export function PaperTradingPanel({ size, onSizeChange }: PaperTradingPanelProps) {
  const [infoTab, setInfoTab] = useState<InfoTab>('positions');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Read from paneStores[0] (primary trading pane) — marketStore is no longer
  // wired because usePriceFeed was superseded by usePaneFeeds.
  const latestPrice = useStore(paneStores[0], (s) => s.latestPrice);
  const balance = usePaperStore((s) => s.balance);
  const positions = usePaperStore((s) => s.positions);
  const pendingOrders = usePaperStore((s) => s.pendingOrders);
  const history = usePaperStore((s) => s.history);
  const journal = usePaperStore((s) => s.journal);
  const closePosition = usePaperStore((s) => s.closePosition);
  const cancelPendingOrder = usePaperStore((s) => s.cancelPendingOrder);
  const addJournalNote = usePaperStore((s) => s.addJournalNote);
  const editJournalEntry = usePaperStore((s) => s.editJournalEntry);
  const reset = usePaperStore((s) => s.reset);

  const unrealizedPnl = positions.reduce((sum, pos) => {
    if (!latestPrice) return sum;
    const pnl =
      pos.side === 'long'
        ? (latestPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - latestPrice) * pos.quantity;
    return sum + pnl;
  }, 0);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleClose(positionId: string) {
    if (!latestPrice) return;
    closePosition(positionId, latestPrice);
  }

  function handleResetClick() {
    if (confirmingReset) {
      reset();
      setConfirmingReset(false);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    } else {
      setConfirmingReset(true);
      resetTimerRef.current = setTimeout(() => setConfirmingReset(false), 3000);
    }
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
        {/* Left: quick stats */}
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="text-xs font-bold text-white/80 tracking-wide">Positions</span>
          <span className="h-3 w-px bg-white/8" />
          <span className="tabular-nums" style={{ fontSize: fontSize.xs11, color: color.muted }}>
            <span className="mr-1" style={{ color: `${color.muted}99` }}>
              Balance
            </span>
            <span className="text-white/70">
              $
              {balance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </span>
          <span className="h-3 w-px bg-white/8" />
          <span
            className="font-semibold tabular-nums"
            style={{ fontSize: fontSize.xs11, color: unrealizedPnl >= 0 ? color.green : color.red }}
          >
            {unrealizedPnl >= 0 ? '+' : ''}
            {unrealizedPnl.toFixed(2)} P&amp;L
          </span>
        </div>

        {/* Right: gear (reset) + collapse + close */}
        <div className="flex items-center gap-0.5">
          <AnimatePresence mode="wait">
            {confirmingReset ? (
              <motion.button
                key="confirm"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.12 }}
                onClick={handleResetClick}
                title="Click again to confirm reset"
                className="flex h-6 items-center gap-1 rounded px-2 font-bold"
                style={{
                  fontSize: fontSize.xs10,
                  background: `${color.red}1f`,
                  color: color.red,
                  border: `1px solid ${color.red}59`,
                }}
              >
                Reset?
              </motion.button>
            ) : (
              <motion.button
                key="gear"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.12 }}
                onClick={handleResetClick}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Account settings — reset paper account"
                className="flex h-6 w-6 items-center justify-center rounded hover:text-white"
                style={{ color: color.muted }}
              >
                <Settings className="h-3.5 w-3.5" />
              </motion.button>
            )}
          </AnimatePresence>

          {size !== 'hidden' &&
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
        {size !== 'collapsed' && (
          <motion.div
            key="panel-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* ── Tab bar ─────────────────────────────────────────────────── */}
            <div
              className="flex items-center border-b border-white/6"
              style={{ background: bg.panel }}
            >
              {(['positions', 'orders', 'history', 'journal'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInfoTab(tab)}
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
                  {tab === 'history' && history.length > 0 && (
                    <span
                      className="rounded-full bg-white/8 px-1.5 py-px font-semibold"
                      style={{ fontSize: fontSize.xxs, color: color.muted }}
                    >
                      {history.length}
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
            </div>

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
                              {[
                                'Symbol',
                                'Side',
                                'Qty',
                                'Entry',
                                'Mark',
                                'TP',
                                'SL',
                                'PnL (USDT)',
                                'Close',
                              ].map((h) => (
                                <th
                                  key={h}
                                  className={`px-3 py-1.5 font-semibold uppercase tracking-wider ${h === 'Symbol' || h === 'Side' ? 'text-left' : h === 'Close' ? 'text-center' : 'text-right'}`}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <AnimatePresence>
                              {positions.map((pos, i) => {
                                const markPrice = latestPrice ?? pos.entryPrice;
                                const pnl =
                                  pos.side === 'long'
                                    ? (markPrice - pos.entryPrice) * pos.quantity
                                    : (pos.entryPrice - markPrice) * pos.quantity;
                                const pnlPct = (pnl / pos.entryUsdtAmount) * 100;
                                const isProfit = pnl >= 0;

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
                                    <td className="px-3 py-1.5 font-bold text-white">
                                      {pos.symbol}
                                    </td>
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
                                    <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                      {pos.quantity.toFixed(6)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                      ${pos.entryPrice.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                      ${markPrice.toFixed(2)}
                                    </td>
                                    <td
                                      className="px-3 py-1.5 text-right tabular-nums"
                                      style={{
                                        fontSize: fontSize.xs10,
                                        color: pos.takeProfit ? color.green : color.muted,
                                      }}
                                    >
                                      {pos.takeProfit ? `$${pos.takeProfit.toFixed(2)}` : '—'}
                                    </td>
                                    <td
                                      className="px-3 py-1.5 text-right tabular-nums"
                                      style={{
                                        fontSize: fontSize.xs10,
                                        color: pos.stopLoss ? color.red : color.muted,
                                      }}
                                    >
                                      {pos.stopLoss ? `$${pos.stopLoss.toFixed(2)}` : '—'}
                                    </td>
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
                    (pendingOrders.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex h-full flex-col items-center justify-center gap-1 text-xs"
                        style={{ color: color.muted }}
                      >
                        <Clock className="h-4 w-4 opacity-40" />
                        No pending orders
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
                              {[
                                'Symbol',
                                'Type',
                                'Side',
                                'Qty',
                                'Trigger',
                                'TP',
                                'SL',
                                'Reserved',
                                'Cancel',
                              ].map((h) => (
                                <th
                                  key={h}
                                  className={`px-3 py-1.5 font-semibold uppercase tracking-wider ${
                                    h === 'Symbol' || h === 'Type' || h === 'Side'
                                      ? 'text-left'
                                      : h === 'Cancel'
                                        ? 'text-center'
                                        : 'text-right'
                                  }`}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <AnimatePresence>
                              {pendingOrders.map((order, i) => (
                                <motion.tr
                                  key={order.id}
                                  custom={i}
                                  variants={rowVariants}
                                  initial="hidden"
                                  animate="visible"
                                  exit="exit"
                                  layout
                                  className="border-b border-white/3 transition-colors hover:bg-white/2"
                                >
                                  <td className="px-3 py-1.5 font-bold text-white">
                                    {order.symbol}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <span
                                      className="rounded px-1 py-px font-bold uppercase"
                                      style={{
                                        fontSize: fontSize.xs10,
                                        background:
                                          order.type === 'limit'
                                            ? `${color.purpleDark}33`
                                            : `${color.amber}22`,
                                        color:
                                          order.type === 'limit' ? color.purpleDark : color.amber,
                                      }}
                                    >
                                      {order.type}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <span
                                      className="font-bold uppercase"
                                      style={{
                                        fontSize: fontSize.xs10,
                                        color: order.side === 'buy' ? color.green : color.red,
                                      }}
                                    >
                                      {order.side === 'buy' ? 'BUY' : 'SELL'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                    {order.qty.toFixed(6)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                    ${order.triggerPrice.toFixed(2)}
                                  </td>
                                  <td
                                    className="px-3 py-1.5 text-right tabular-nums"
                                    style={{
                                      fontSize: fontSize.xs10,
                                      color: order.takeProfit ? color.green : color.muted,
                                    }}
                                  >
                                    {order.takeProfit ? `$${order.takeProfit.toFixed(2)}` : '—'}
                                  </td>
                                  <td
                                    className="px-3 py-1.5 text-right tabular-nums"
                                    style={{
                                      fontSize: fontSize.xs10,
                                      color: order.stopLoss ? color.red : color.muted,
                                    }}
                                  >
                                    {order.stopLoss ? `$${order.stopLoss.toFixed(2)}` : '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                    ${order.usdtAmount.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-1.5 text-center">
                                    <motion.button
                                      onClick={() => cancelPendingOrder(order.id)}
                                      whileHover={{ scale: 1.2 }}
                                      whileTap={{ scale: 0.9 }}
                                      title="Cancel pending order (balance refunded)"
                                      className="mx-auto flex h-5 w-5 items-center justify-center rounded transition-colors hover:text-brand-red"
                                      style={{ color: color.muted }}
                                    >
                                      <X className="h-3 w-3" />
                                    </motion.button>
                                  </td>
                                </motion.tr>
                              ))}
                            </AnimatePresence>
                          </tbody>
                        </table>
                      </div>
                    ))}

                  {/* ════ History ══════════════════════════════════════════════════ */}
                  {infoTab === 'history' &&
                    (history.length > 0 ? (
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
                              {['Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'PnL (USDT)'].map((h) => (
                                <th
                                  key={h}
                                  className={`px-3 py-1.5 font-semibold uppercase tracking-wider ${h === 'Symbol' || h === 'Side' ? 'text-left' : 'text-right'}`}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <AnimatePresence>
                              {history.map((trade, i) => {
                                const isProfit = trade.pnl >= 0;
                                return (
                                  <motion.tr
                                    key={trade.id}
                                    custom={i}
                                    variants={rowVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="border-b border-white/3 transition-colors hover:bg-white/2"
                                  >
                                    <td className="px-3 py-1.5 font-bold text-white">
                                      {trade.symbol}
                                    </td>
                                    <td
                                      className="px-3 py-1.5 font-bold"
                                      style={{
                                        fontSize: fontSize.xs10,
                                        color: trade.side === 'long' ? color.green : color.red,
                                      }}
                                    >
                                      {trade.side === 'long' ? 'LONG' : 'SHORT'}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                      {trade.quantity.toFixed(6)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                      ${trade.entryPrice.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                      ${trade.exitPrice.toFixed(2)}
                                    </td>
                                    <td
                                      className="px-3 py-1.5 text-right tabular-nums font-semibold"
                                      style={{ color: isProfit ? color.green : color.red }}
                                    >
                                      {isProfit ? '+' : ''}
                                      {trade.pnl.toFixed(2)}
                                    </td>
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
    </div>
  );
}
