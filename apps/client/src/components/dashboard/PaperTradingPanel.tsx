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
} from 'lucide-react';
import { useMarketStore } from '@/store/marketStore';
import { usePaperStore } from '@/store/paperStore';
import type { JournalEntry } from '@/store/paperStore';
import type { PanelSize } from '@/pages/DashboardPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type InfoTab = 'positions' | 'history' | 'journal';

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
    <tr className="group border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
      {/* Time */}
      <td
        className="shrink-0 whitespace-nowrap px-3 py-1.5 font-mono text-[11px] tabular-nums"
        style={{ color: '#848e9c', minWidth: 152 }}
      >
        {fmtTime(entry.time)}
      </td>

      {/* Text */}
      <td className="w-full px-3 py-1.5 text-[11px] text-white/70">
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
              className="flex-1 rounded border border-white/[0.08] px-2 py-0.5 text-[11px] text-white focus:border-[#7b2ff7]/50 focus:outline-none"
              style={{ background: '#131628' }}
            />
            <button
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur from firing before click
                onSaveEdit();
              }}
              className="shrink-0 text-[#02c076] hover:brightness-125"
            >
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span>{entry.text}</span>
        )}
      </td>

      {/* Actions — pen icon visible on hover, only for user notes */}
      <td className="px-2 py-1.5 text-right" style={{ minWidth: 28 }}>
        {entry.isUserNote && !isEditing && (
          <button
            onClick={() => onStartEdit(entry)}
            title="Edit note"
            className="opacity-0 transition-opacity group-hover:opacity-100 text-[#848e9c] hover:text-[#a855f7]"
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
  const latestPrice = useMarketStore((s) => s.latestPrice);
  const balance = usePaperStore((s) => s.balance);
  const positions = usePaperStore((s) => s.positions);
  const history = usePaperStore((s) => s.history);
  const journal = usePaperStore((s) => s.journal);
  const closePosition = usePaperStore((s) => s.closePosition);
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
      className="flex h-full w-full flex-col border-t border-white/[0.06]"
      style={{ background: '#0b0c1a' }}
    >
      {/* ── Header bar (always visible) ────────────────────────────────────── */}
      <div
        className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.05] px-3"
        style={{ background: '#0f1020' }}
      >
        {/* Left: quick stats */}
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="text-xs font-bold text-white/80 tracking-wide">Positions</span>
          <span className="h-3 w-px bg-white/[0.08]" />
          <span className="text-[11px] tabular-nums text-[#848e9c]">
            <span className="mr-1 text-[#848e9c]/60">Balance</span>
            <span className="text-white/70">
              $
              {balance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </span>
          <span className="h-3 w-px bg-white/[0.08]" />
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: unrealizedPnl >= 0 ? '#02c076' : '#f6465d' }}
          >
            {unrealizedPnl >= 0 ? '+' : ''}
            {unrealizedPnl.toFixed(2)} P&amp;L
          </span>
        </div>

        {/* Right: gear (reset) + collapse + close */}
        <div className="flex items-center gap-0.5">
          {/* ── Account reset (gear icon) ── */}
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
                className="flex h-6 items-center gap-1 rounded px-2 text-[10px] font-bold"
                style={{
                  background: 'rgba(246,70,93,0.12)',
                  color: '#f6465d',
                  border: '1px solid rgba(246,70,93,0.35)',
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
                className="flex h-6 w-6 items-center justify-center rounded text-[#848e9c] hover:text-white"
              >
                <Settings className="h-3.5 w-3.5" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Collapse ↔ Expand */}
          {size !== 'hidden' &&
            (size === 'open' ? (
              <motion.button
                onClick={() => onSizeChange('collapsed')}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Collapse"
                className="flex h-6 w-6 items-center justify-center rounded text-[#848e9c] hover:text-white"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </motion.button>
            ) : (
              <motion.button
                onClick={() => onSizeChange('open')}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Expand"
                className="flex h-6 w-6 items-center justify-center rounded text-[#848e9c] hover:text-white"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </motion.button>
            ))}

          {/* Close */}
          <motion.button
            onClick={() => onSizeChange('hidden')}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Close panel"
            className="flex h-6 w-6 items-center justify-center rounded text-[#848e9c] hover:text-[#f6465d]"
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
              className="flex items-center border-b border-white/[0.06]"
              style={{ background: '#0f1020' }}
            >
              {(['positions', 'history', 'journal'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInfoTab(tab)}
                  className="relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold capitalize transition-colors"
                  style={{ color: infoTab === tab ? '#a855f7' : '#848e9c' }}
                >
                  {infoTab === tab && (
                    <motion.span
                      layoutId="active-bottom-tab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                      style={{ background: '#7b2ff7' }}
                    />
                  )}
                  {tab}
                  {tab === 'positions' && positions.length > 0 && (
                    <span
                      className="rounded-full px-1.5 py-px text-[9px] font-bold text-white"
                      style={{ background: '#7b2ff7' }}
                    >
                      {positions.length}
                    </span>
                  )}
                  {tab === 'history' && history.length > 0 && (
                    <span className="rounded-full bg-white/[0.08] px-1.5 py-px text-[9px] font-semibold text-[#848e9c]">
                      {history.length}
                    </span>
                  )}
                  {tab === 'journal' && journal.length > 0 && (
                    <span className="rounded-full bg-white/[0.08] px-1.5 py-px text-[9px] font-semibold text-[#848e9c]">
                      {journal.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Scrollable table area ────────────────────────────────────── */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* ════ Positions ════════════════════════════════════════════════ */}
              {infoTab === 'positions' &&
                (positions.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-full items-center justify-center text-xs text-[#848e9c]"
                  >
                    No open positions
                  </motion.div>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr
                          className="border-b border-white/[0.04] text-[10px] text-[#848e9c]"
                          style={{ background: '#0f1020' }}
                        >
                          <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                            Symbol
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                            Side
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            Qty
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            Entry
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            Mark
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            TP
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            SL
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            PnL (USDT)
                          </th>
                          <th className="px-3 py-1.5 text-center font-semibold uppercase tracking-wider">
                            Close
                          </th>
                        </tr>
                      </thead>
                      <tbody>
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
                              className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                            >
                              <td className="px-3 py-1.5 font-bold text-white">{pos.symbol}</td>
                              <td className="px-3 py-1.5">
                                <span
                                  className="flex items-center gap-0.5 text-[10px] font-bold"
                                  style={{ color: pos.side === 'long' ? '#02c076' : '#f6465d' }}
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
                              {/* Take Profit */}
                              <td
                                className="px-3 py-1.5 text-right tabular-nums text-[10px]"
                                style={{ color: pos.takeProfit ? '#02c076' : '#848e9c' }}
                              >
                                {pos.takeProfit ? `$${pos.takeProfit.toFixed(2)}` : '—'}
                              </td>
                              {/* Stop Loss */}
                              <td
                                className="px-3 py-1.5 text-right tabular-nums text-[10px]"
                                style={{ color: pos.stopLoss ? '#f6465d' : '#848e9c' }}
                              >
                                {pos.stopLoss ? `$${pos.stopLoss.toFixed(2)}` : '—'}
                              </td>
                              <td
                                className="px-3 py-1.5 text-right tabular-nums font-semibold"
                                style={{ color: isProfit ? '#02c076' : '#f6465d' }}
                              >
                                {isProfit ? '+' : ''}
                                {pnl.toFixed(2)}{' '}
                                <span className="text-[10px] opacity-70">
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
                                  className="mx-auto flex h-5 w-5 items-center justify-center rounded text-[#848e9c] transition-colors hover:text-[#f6465d]"
                                >
                                  <X className="h-3 w-3" />
                                </motion.button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}

              {/* ════ History ══════════════════════════════════════════════════ */}
              {infoTab === 'history' &&
                (history.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-full items-center justify-center text-xs text-[#848e9c]"
                  >
                    No closed trades yet
                  </motion.div>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr
                          className="border-b border-white/[0.04] text-[10px] text-[#848e9c]"
                          style={{ background: '#0f1020' }}
                        >
                          <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                            Symbol
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                            Side
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            Qty
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            Entry
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            Exit
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                            PnL (USDT)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((trade, i) => {
                          const isProfit = trade.pnl >= 0;
                          return (
                            <motion.tr
                              key={trade.id}
                              custom={i}
                              variants={rowVariants}
                              initial="hidden"
                              animate="visible"
                              className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                            >
                              <td className="px-3 py-1.5 font-bold text-white">{trade.symbol}</td>
                              <td
                                className="px-3 py-1.5 text-[10px] font-bold"
                                style={{ color: trade.side === 'long' ? '#02c076' : '#f6465d' }}
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
                                style={{ color: isProfit ? '#02c076' : '#f6465d' }}
                              >
                                {isProfit ? '+' : ''}
                                {trade.pnl.toFixed(2)}
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}

              {/* ════ Journal ══════════════════════════════════════════════════ */}
              {infoTab === 'journal' && (
                <div className="flex min-h-0 flex-1 flex-col">
                  {/* Add-note input — slides in when active */}
                  <AnimatePresence initial={false}>
                    {isAddingNote && (
                      <motion.div
                        key="add-note"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-white/[0.06] px-3 py-2"
                        style={{ background: '#0f1020' }}
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
                          className="flex-1 rounded border border-white/[0.08] px-2 py-1 text-[11px] text-white placeholder-[#848e9c]/50 focus:border-[#7b2ff7]/50 focus:outline-none"
                          style={{ background: '#131628' }}
                        />
                        <button
                          onClick={handleSaveNote}
                          title="Save note"
                          className="shrink-0 text-[#02c076] hover:brightness-125"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setNoteText('');
                            setIsAddingNote(false);
                          }}
                          title="Cancel"
                          className="shrink-0 text-[#848e9c] hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Journal table */}
                  {journal.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex h-full flex-col items-center justify-center gap-2 text-xs text-[#848e9c]"
                    >
                      <span>No journal entries yet — place a trade to see activity.</span>
                      <button
                        onClick={() => setIsAddingNote(true)}
                        className="flex items-center gap-1 text-[11px] text-[#a855f7] transition-colors hover:brightness-125"
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
                            className="border-b border-white/[0.04] text-[10px] text-[#848e9c]"
                            style={{ background: '#0f1020' }}
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
                            {/* Pen icon column header — click to add a note */}
                            <th className="px-2 py-1.5 text-right" style={{ minWidth: 28 }}>
                              <button
                                onClick={() => setIsAddingNote(true)}
                                title="Add journal note"
                                className="ml-auto flex items-center justify-center text-[#848e9c] transition-colors hover:text-[#a855f7]"
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
