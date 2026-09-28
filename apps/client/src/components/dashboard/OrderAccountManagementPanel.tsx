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
  Info,
} from 'lucide-react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { paneStores, getLastKnownMarkPrice, getLastKnownPrice } from '@/store/paneStore';
import { FEE_RATES, type MarketCategory } from '@crypto-dashboard/sdk';
import { usePaperStore } from '@/store/paperStore';
import { useOrderPrefillStore } from '@/store/orderPrefillStore';
import { feeRateLine } from '@/lib/orderMath';
import {
  LIQUIDATION_EXPLAINER,
  MMR_EXPLAINER,
  positionMmrRate,
  positionPnl,
  riskTierInfo,
  riskTierLabel,
  crossAccountFigures,
  crossLiqPrice,
} from '@/lib/positionMath';

const CROSS_MM_RATE_HELP =
  "Account maintenance margin rate (cross): total maintenance margin ÷ margin balance. At 100% the account's positions are liquidated.";
import { MmrBar } from './MmrBar';
import { AdjustMarginDialog } from './AdjustMarginDialog';
import { winRateFrom } from '@/lib/funding';
import { loadColPrefs, saveColPrefs } from '@/lib/columnPrefs';
import { AssetsTable } from './AssetsTable';
import { ClosedPnlTable } from './ClosedPnlTable';
import { CrossMarginNotice } from './CrossMarginNotice';
import type { JournalEntry, HistoricalOrder, PendingOrder } from '@/store/paperStore';
import type { PanelSize } from '@/pages/DashboardPage';
import { bg, color, fontSize } from '@/lib/tokens';
import { fmtMktPrice } from '@/lib/utils';
import { guide, type GuideAnchor } from '@/lib/guideAnchors';
import { useLayoutStore } from '@/store/layoutStore';
import { SoundSettings } from './SoundSettings';

/** Format a crypto quantity the same way TVP does — trim trailing zeros, max 6 dp */
const fmtQty = (n: number) => parseFloat(n.toFixed(6)).toString();

// ─── Types ────────────────────────────────────────────────────────────────────

/** 'assets' is the Spot counterpart of 'positions' (BP-2) — which one shows follows the market */
type InfoTab =
  | 'positions'
  | 'assets'
  | 'closedpnl'
  | 'orders'
  | 'orderhistory'
  | 'balancehistory'
  | 'journal';
type ColTab = 'positions' | 'orders' | 'orderhistory' | 'balancehistory';
type OrderSubTab = 'all' | 'working' | 'inactive' | 'filled' | 'cancelled' | 'rejected';
type OrderHistorySubTab = 'all' | 'filled' | 'cancelled' | 'rejected';

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

/**
 * Format a market price the TVP way using the imported helper from
 * @/lib/utils.
 */

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
  { id: 'entry', label: 'Avg Fill Price', align: 'right', defaultOn: true },
  { id: 'tp', label: 'Take Profit', align: 'right', defaultOn: true },
  { id: 'sl', label: 'Stop Loss', align: 'right', defaultOn: true },
  // Bybit values a perpetual position at the mark price (BP-3)
  { id: 'mark', label: 'Mark Price', align: 'right', defaultOn: true },
  { id: 'last', label: 'Last Price', align: 'right', defaultOn: false },
  { id: 'liq', label: 'Liq. Price', align: 'right', defaultOn: true },
  { id: 'mmr', label: 'MMR', align: 'left', defaultOn: true },
  { id: 'pnl', label: 'Unrealized P&L', align: 'right', defaultOn: true },
  { id: 'pnlPct', label: 'Unrealized P&L %', align: 'right', defaultOn: true },
  // Funding settled on the position so far, as money moved (BP-4)
  { id: 'funding', label: 'Funding', align: 'right', defaultOn: true },
  { id: 'tradeValue', label: 'Trade Value', align: 'right', defaultOn: true },
  { id: 'marketValue', label: 'Market Value', align: 'right', defaultOn: true },
  { id: 'leverage', label: 'Leverage', align: 'right', defaultOn: true },
  { id: 'margin', label: 'Margin', align: 'right', defaultOn: true },
  { id: 'im', label: 'IM', align: 'right', defaultOn: false },
  { id: 'mm', label: 'MM', align: 'right', defaultOn: false },
  { id: 'expiry', label: 'Expiration Date', align: 'right', defaultOn: false },
  { id: 'orderId', label: 'Order ID', align: 'right', defaultOn: false },
  { id: 'openedAt', label: 'Opened At', align: 'right', defaultOn: false },
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

const BALANCE_HISTORY_COLS: ColDef[] = [
  { id: 'time', label: 'Time', align: 'left', defaultOn: true },
  { id: 'balanceBefore', label: 'Balance Before', align: 'right', defaultOn: true },
  { id: 'balanceAfter', label: 'Balance After', align: 'right', defaultOn: true },
  { id: 'pnl', label: 'Realized P&L', align: 'right', defaultOn: true },
  { id: 'action', label: 'Action', align: 'left', defaultOn: true },
];

const ORDER_HISTORY_COLS: ColDef[] = [
  { id: 'symbol', label: 'Symbol', align: 'left', defaultOn: true, sticky: true },
  { id: 'side', label: 'Side', align: 'left', defaultOn: true },
  { id: 'type', label: 'Type', align: 'left', defaultOn: true },
  { id: 'qty', label: 'Qty', align: 'right', defaultOn: true },
  { id: 'limitPrice', label: 'Limit Price', align: 'right', defaultOn: true },
  { id: 'stopPrice', label: 'Stop Price', align: 'right', defaultOn: true },
  { id: 'fillPrice', label: 'Fill Price', align: 'right', defaultOn: true },
  { id: 'status', label: 'Status', align: 'left', defaultOn: true },
  { id: 'commission', label: 'Commission', align: 'right', defaultOn: true },
  { id: 'placingTime', label: 'Placing Time', align: 'left', defaultOn: true },
  { id: 'closingTime', label: 'Closing Time', align: 'left', defaultOn: true },
  { id: 'orderId', label: 'Order ID', align: 'left', defaultOn: false },
  { id: 'leverage', label: 'Leverage', align: 'right', defaultOn: false },
  { id: 'margin', label: 'Margin', align: 'right', defaultOn: false },
];

const COLS_BY_TAB: Record<ColTab, ColDef[]> = {
  positions: POSITION_COLS,
  orders: ORDER_COLS,
  orderhistory: ORDER_HISTORY_COLS,
  balancehistory: BALANCE_HISTORY_COLS,
};

// ─── Orders bench lifecycle ───────────────────────────────────────────────────
// The Orders tab is a session-scoped "working bench". Active rows (working /
// inactive) stay as long as they're live. Terminal rows (filled / cancelled /
// rejected) appear on the bench for BENCH_TTL_MS after their closingTime, then
// auto-evict to Order History only.
//
// SESSION_START is evaluated ONCE at module load time — it naturally resets on
// every page refresh, which is exactly why bench terminal rows disappear from
// Orders after a reload (their closingTime < SESSION_START).

const SESSION_START = Date.now();
const BENCH_TTL_MS = 120_000; // 2 minutes, hardcoded — mirrors TV behaviour

// ─── Column prefs persistence ─────────────────────────────────────────────────

// ─── Props ────────────────────────────────────────────────────────────────────

interface OrderAccountManagementPanelProps {
  size: PanelSize;
  onSizeChange: (size: PanelSize) => void;
  /** True when the panel is expanded to fill the full chart area */
  isMaximized: boolean;
  onToggleMaximize: () => void;
  /** Called when the user clicks the pencil on a position's TP/SL cell */
  onEditPosition?: (positionId: string) => void;
  /** Called when the user clicks the pencil on a pending order's price cell */
  onEditPendingOrder?: (orderId: string) => void;
}

/**
 * Whether a pending order's TP / SL can be edited: entry orders only (not a spot TP / SL leg,
 * which is cancelled and placed again), and not a spot sell (spot TP / SL protect a buy).
 */
function hasEditableExits(order: PendingOrder): boolean {
  if (order.type !== 'limit' && order.type !== 'stop') return false;
  return !(order.category === 'spot' && order.side === 'sell');
}

// ─── Sub-component: fee cell ──────────────────────────────────────────────────

/** A fill's fee with its rate and liquidity underneath ("2.75 USDT" / "0.055% taker"). */
function FeeCell({ order }: { order: HistoricalOrder }) {
  const rate = feeRateLine(order);
  const asset = order.feeAsset ?? 'USDT';
  return (
    <span className="flex flex-col items-end leading-tight">
      <span>
        {order.commission.toFixed(asset === 'USDT' ? 4 : 8)} {asset}
      </span>
      {rate && <span style={{ fontSize: fontSize.xxs }}>{rate}</span>}
    </span>
  );
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

export function OrderAccountManagementPanel({
  size,
  onSizeChange,
  isMaximized,
  onToggleMaximize,
  onEditPosition,
  onEditPendingOrder,
}: OrderAccountManagementPanelProps) {
  // Spot shows Assets where USDT Perpetual shows Positions; the chosen tab follows the market
  const market = useLayoutStore((s) => (s.panes[s.activePane] ?? s.panes[0]).category);
  const [chosenTab, setInfoTab] = useState<InfoTab>('positions');
  const infoTab: InfoTab =
    market === 'spot' && chosenTab === 'positions'
      ? 'assets'
      : market === 'linear' && chosenTab === 'assets'
        ? 'positions'
        : // Closed P&L is USDT Perpetual only (BP-5 D)
          market === 'spot' && chosenTab === 'closedpnl'
          ? 'assets'
          : chosenTab;
  const [orderSubTab, setOrderSubTab] = useState<OrderSubTab>('all');
  const [orderHistorySubTab, setOrderHistorySubTab] = useState<OrderHistorySubTab>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Bench clock — drives reactive TTL expiry of terminal rows in Orders tab ──
  // Ticks every 30 s so the bench auto-clears within ±30 s of the 2-minute mark
  // without hammering the reconciler on every second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Journal UI state ──────────────────────────────────────────────────────
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Add / reduce margin dialog (BP-5 A): the position it is open for
  const [marginDialogFor, setMarginDialogFor] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // ── Store ─────────────────────────────────────────────────────────────────
  // Build a per-market price map from all 4 pane stores so that positions and coins in any
  // market show the right price regardless of which pane is active. Keyed `category:symbol` —
  // spot and perpetual prices differ (BP-2).
  const lp0 = useStore(paneStores[0], (s) => s.latestPrice);
  const lp1 = useStore(paneStores[1], (s) => s.latestPrice);
  const lp2 = useStore(paneStores[2], (s) => s.latestPrice);
  const lp3 = useStore(paneStores[3], (s) => s.latestPrice);
  const paneMarkets = useLayoutStore(
    useShallow((s) => s.panes.map((p) => `${p.category}:${p.symbol}`))
  );
  const priceByMarket: Record<string, number> = {};
  [lp0, lp1, lp2, lp3].forEach((lp, i) => {
    if (lp !== null) priceByMarket[paneMarkets[i]] = lp;
  });
  // Best available price for a market — live pane price first, then the last known price
  // (other panes, the server's price push), then null.
  function getPrice(category: MarketCategory, sym: string): number | null {
    return priceByMarket[`${category}:${sym}`] ?? getLastKnownPrice(sym, category) ?? null;
  }
  // USDT Perpetual mark price — what Bybit values a position at (BP-3): a perp pane's live mark,
  // then the last known mark (server push), then the last price while no mark has arrived yet.
  const mp0 = useStore(paneStores[0], (s) => s.markPrice);
  const mp1 = useStore(paneStores[1], (s) => s.markPrice);
  const mp2 = useStore(paneStores[2], (s) => s.markPrice);
  const mp3 = useStore(paneStores[3], (s) => s.markPrice);
  const markBySymbol: Record<string, number> = {};
  [mp0, mp1, mp2, mp3].forEach((mp, i) => {
    const [category, sym] = paneMarkets[i].split(':');
    if (mp !== null && category === 'linear') markBySymbol[sym] = mp;
  });
  function getMark(sym: string): number | null {
    return markBySymbol[sym] ?? getLastKnownMarkPrice(sym) ?? getPrice('linear', sym);
  }

  const balance = usePaperStore((s) => s.balance);
  const positions = usePaperStore((s) => s.positions);
  const allPendingOrders = usePaperStore((s) => s.pendingOrders);
  const allOrders = usePaperStore((s) => s.orders);
  const spotBalances = usePaperStore((s) => s.spotBalances);
  // Re-render when the server pushes prices for markets no pane shows (lastKnownPrices isn't state)
  usePaperStore((s) => s.pricesAt);
  // Orders and Order History show the active market only (Bybit's layout)
  const pendingOrders = allPendingOrders.filter((o) => o.category === market);
  const orders = allOrders.filter((o) => o.category === market);
  const orderHistoryRows = orders;
  const filteredOrderHistoryRows =
    orderHistorySubTab === 'all'
      ? orderHistoryRows
      : orderHistoryRows.filter((o) => o.status === orderHistorySubTab);
  const balanceLog = usePaperStore((s) => s.balanceLog);
  const realizedPnl = usePaperStore((s) => s.realizedPnl);
  const journal = usePaperStore((s) => s.journal);
  const closePosition = usePaperStore((s) => s.closePosition);
  const cancelPendingOrder = usePaperStore((s) => s.cancelPendingOrder);
  const cancelExitOrder = usePaperStore((s) => s.cancelExitOrder);
  const cancelPendingExitLeg = usePaperStore((s) => s.cancelPendingExitLeg);
  const addJournalNote = usePaperStore((s) => s.addJournalNote);
  const editJournalEntry = usePaperStore((s) => s.editJournalEntry);
  const reset = usePaperStore((s) => s.reset);
  const prefillOrder = useOrderPrefillStore((s) => s.prefill);
  const username = useAuthStore((s) => s.user?.username ?? 'Account');

  // ── Balance history rows (sorted newest first) ────────────────────────────
  const balanceHistoryRows = [...balanceLog].sort((a, b) => b.time - a.time);

  // ── Order type pill helpers ───────────────────────────────────────────────
  function orderTypeLabel(type: string): string {
    switch (type) {
      case 'take-profit':
        return 'Take Profit';
      case 'stop-loss':
        return 'Stop Loss';
      case 'market':
        return 'Market';
      case 'limit':
        return 'Limit';
      case 'stop':
        return 'Stop';
      default:
        return type;
    }
  }
  function orderTypePillStyle(
    type: string,
    colorMap: typeof color
  ): { background: string; color: string } {
    switch (type) {
      case 'limit':
        return { background: `${colorMap.purpleDark}33`, color: colorMap.purpleDark };
      case 'stop':
        return { background: `${colorMap.amber}22`, color: colorMap.amber };
      case 'take-profit':
        return { background: `${colorMap.green}22`, color: colorMap.green };
      case 'stop-loss':
        return { background: `${colorMap.red}22`, color: colorMap.red };
      default:
        return {
          background: `color-mix(in srgb, ${color.white} 8%, transparent)`,
          color: colorMap.muted,
        };
    }
  }

  // ── Derived account stats (the whole account — both markets) ────────────────
  // USDT set aside by resting orders (a spot sell locks coins, not USDT)
  const reserved = allPendingOrders.reduce(
    (s, o) => s + (o.category === 'spot' && o.side === 'sell' ? 0 : o.reserved),
    0
  );
  // Position margin (IM + the close-fee estimate held with it), already out of the balance
  const lockedPositionCapital = positions.reduce(
    (sum, pos) => sum + pos.entryUsdtAmount + pos.closeFeeReserve,
    0
  );
  // Mark-to-market PnL of open positions (at the mark price, as Bybit) and of coins held against
  // their average cost
  const positionsPnl = positions.reduce((sum, pos) => {
    const markPrice = getMark(pos.symbol);
    return markPrice === null ? sum : sum + positionPnl(pos, markPrice);
  }, 0);
  const assetRows = spotBalances.map((holding) => ({
    holding,
    price: getPrice('spot', `${holding.coin}USDT`),
  }));
  const coinValue = assetRows.reduce(
    (sum, r) => sum + (r.holding.free + r.holding.locked) * (r.price ?? r.holding.avgCost),
    0
  );
  const coinsPnl = assetRows.reduce(
    (sum, r) =>
      r.price === null
        ? sum
        : sum + (r.price - r.holding.avgCost) * (r.holding.free + r.holding.locked),
    0
  );
  const unrealizedPnl = positionsPnl + coinsPnl;
  // Cross margin (BP-5 E): the account figures at the live marks
  const marginMode = usePaperStore((s) => s.marginMode);
  const cross =
    marginMode === 'REGULAR_MARGIN'
      ? crossAccountFigures({ balance, positions, pendingOrders: allPendingOrders }, getMark)
      : null;
  // Isolated: balance is already free cash (margin, fees and reserves deducted). Cross: Bybit's
  // available balance (margin balance − total IM)
  const available = cross ? cross.available : balance;
  const equity = balance + reserved + lockedPositionCapital + positionsPnl + coinValue;
  // Funding payments move money but aren't trades — excluded (BP-4)
  const winRate = winRateFrom(balanceLog);

  // ── Unified order display rows (pending + historical + synthetic exit orders) ─
  /** Synthetic exit order derived from a live position's TP or SL level — mirrors TV "Working" orders */
  interface SyntheticExitOrder {
    id: string; // unique: `exit-tp-{posId}` or `exit-sl-{posId}`
    positionId: string;
    symbol: string;
    side: 'buy' | 'sell'; // opposite of position side
    exitType: 'Take Profit' | 'Stop Loss';
    status: 'working' | 'inactive';
    price: number; // TP or SL price
    qty: number;
    placedAt: number; // position openedAt
  }

  type OrderDisplayRow =
    | { kind: 'pending'; data: PendingOrder }
    | { kind: 'historical'; data: HistoricalOrder }
    | { kind: 'exit-order'; data: SyntheticExitOrder };

  // Synthetic child orders for open positions (working) and pending brackets (inactive).
  const exitOrderRows: OrderDisplayRow[] = [];
  // Positions are USDT Perpetual: their TP / SL rows belong to that market's Orders tab
  for (const pos of market === 'linear' ? positions : []) {
    if (pos.takeProfit) {
      exitOrderRows.push({
        kind: 'exit-order',
        data: {
          id: `exit-tp-${pos.id}`,
          positionId: pos.id,
          symbol: pos.symbol,
          side: pos.side === 'long' ? 'sell' : 'buy',
          exitType: 'Take Profit',
          status: 'working',
          price: pos.takeProfit,
          qty: pos.quantity,
          placedAt: pos.openedAt,
        },
      });
    }
    if (pos.stopLoss) {
      exitOrderRows.push({
        kind: 'exit-order',
        data: {
          id: `exit-sl-${pos.id}`,
          positionId: pos.id,
          symbol: pos.symbol,
          side: pos.side === 'long' ? 'sell' : 'buy',
          exitType: 'Stop Loss',
          status: 'working',
          price: pos.stopLoss,
          qty: pos.quantity,
          placedAt: pos.openedAt,
        },
      });
    }
  }

  const inactivePendingExitRows: OrderDisplayRow[] = [];
  for (const pending of pendingOrders) {
    if (pending.takeProfit) {
      inactivePendingExitRows.push({
        kind: 'exit-order',
        data: {
          id: `pending-exit-tp-${pending.id}`,
          positionId: pending.id,
          symbol: pending.symbol,
          side: pending.side === 'buy' ? 'sell' : 'buy',
          exitType: 'Take Profit',
          status: 'inactive',
          price: pending.takeProfit,
          qty: pending.qty,
          placedAt: pending.placedAt,
        },
      });
    }
    if (pending.stopLoss) {
      inactivePendingExitRows.push({
        kind: 'exit-order',
        data: {
          id: `pending-exit-sl-${pending.id}`,
          positionId: pending.id,
          symbol: pending.symbol,
          side: pending.side === 'buy' ? 'sell' : 'buy',
          exitType: 'Stop Loss',
          status: 'inactive',
          price: pending.stopLoss,
          qty: pending.qty,
          placedAt: pending.placedAt,
        },
      });
    }
  }

  // Orders tab mirrors TV-style lifecycle buckets; historical filled rows remain
  // visible in Orders (Filled sub-tab) and Order History.

  // ── Bench predicate ─────────────────────────────────────────────────────────
  // A HistoricalOrder is "on the bench" only if it was created in this session
  // (closingTime >= SESSION_START) AND its 2-minute TTL has not yet elapsed.
  // Orders from previous sessions never satisfy the first clause, so they vanish
  // from the Orders tab immediately after a page refresh.
  function isBenchHistoricalOrder(o: HistoricalOrder): boolean {
    return o.closingTime >= SESSION_START && o.closingTime + BENCH_TTL_MS > now;
  }

  const allOrderDisplayRows: OrderDisplayRow[] = [
    ...inactivePendingExitRows,
    ...exitOrderRows,
    ...pendingOrders.map((o) => ({ kind: 'pending' as const, data: o })),
    // Historical rows are only included while they are "on the bench" (within the
    // 2-minute TTL window for this session). Outside that window they exist only
    // in Order History, not here.
    ...orders.filter(isBenchHistoricalOrder).map((o) => ({ kind: 'historical' as const, data: o })),
  ].sort((a, b) => {
    const ta =
      a.kind === 'pending'
        ? a.data.placedAt
        : a.kind === 'exit-order'
          ? a.data.placedAt
          : a.data.placingTime;
    const tb =
      b.kind === 'pending'
        ? b.data.placedAt
        : b.kind === 'exit-order'
          ? b.data.placedAt
          : b.data.placingTime;
    return tb - ta;
  });

  const filteredOrderRows: OrderDisplayRow[] =
    orderSubTab === 'all'
      ? allOrderDisplayRows
      : orderSubTab === 'working'
        ? allOrderDisplayRows.filter(
            (r) => r.kind === 'pending' || (r.kind === 'exit-order' && r.data.status === 'working')
          )
        : orderSubTab === 'inactive'
          ? allOrderDisplayRows.filter(
              (r) => r.kind === 'exit-order' && r.data.status === 'inactive'
            )
          : orderSubTab === 'filled'
            ? allOrderDisplayRows.filter(
                (r) => r.kind === 'historical' && r.data.status === 'filled'
              )
            : orderSubTab === 'cancelled'
              ? allOrderDisplayRows.filter(
                  (r) => r.kind === 'historical' && r.data.status === 'cancelled'
                )
              : allOrderDisplayRows.filter(
                  (r) => r.kind === 'historical' && r.data.status === 'rejected'
                );

  // Top-level Orders badge mirrors TV: active rows only (working/inactive),
  // not historical filled/cancelled/rejected rows.
  const activeOrdersBadgeCount = allOrderDisplayRows.filter(
    (r) => r.kind === 'pending' || r.kind === 'exit-order'
  ).length;

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
  /** Assets → Sell: put the free coins into the Spot form (TradingPanel takes the request). */
  function handleSellAsset(symbol: string, qty: number) {
    const { activePane, setPaneMarket } = useLayoutStore.getState();
    setPaneMarket(activePane, 'spot', symbol);
    prefillOrder({ category: 'spot', symbol, side: 'sell', qty });
  }

  function handleClose(positionId: string) {
    // Closes at the server's live price; the server's profit / loss sound plays via the feed
    void closePosition(positionId);
  }

  async function handleSaveNote() {
    const text = noteText.trim();
    // Keep the draft if the server didn't take it (network error, over-long note)
    if (text && (await addJournalNote(text))) return;
    setNoteText('');
    setIsAddingNote(false);
  }

  function handleStartEdit(entry: JournalEntry) {
    setEditingId(entry.id);
    setEditText(entry.text);
  }

  async function handleSaveEdit() {
    const text = editText.trim();
    // Stay in edit mode if the server didn't take the change
    if (editingId && text && (await editJournalEntry(editingId, text))) return;
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
        <span className="text-xs font-bold text-white/80 tracking-wide">
          Order &amp; Account Management
        </span>

        {/* Right: sound + settings + collapse/expand + maximize/restore */}
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
            {/* One-time notice for pre-BP-5 isolated accounts (BP-5 E, O2) */}
            <CrossMarginNotice />

            {/* ── Account Summary Bar ─────────────────────────────────────── */}
            <div
              className="flex shrink-0 items-center gap-4 overflow-x-auto border-b border-white/4 px-3 py-1.5 scrollbar-none"
              style={{ background: bg.panel }}
            >
              {(
                [
                  {
                    label: 'Balance',
                    anchor: 'account.summary.balance',
                    value: `$${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    col: undefined,
                  },
                  {
                    label: 'Equity',
                    anchor: 'account.summary.equity',
                    value: `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    col: undefined,
                  },
                  {
                    label: 'Unrealized P&L',
                    anchor: 'account.summary.upnl',
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
                  // Cross margin (BP-5 E): Bybit's account figures
                  ...(cross
                    ? [
                        {
                          label: 'Margin Balance',
                          value: `$${cross.marginBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                          col: undefined,
                        },
                        {
                          label: 'IM Rate',
                          value: Number.isFinite(cross.imRate)
                            ? `${(cross.imRate * 100).toFixed(2)}%`
                            : '—',
                          col: undefined,
                        },
                      ]
                    : []),
                ] as {
                  label: string;
                  anchor?: GuideAnchor;
                  value: string;
                  col: string | undefined;
                }[]
              ).map(({ label, anchor, value, col }) => (
                <div key={label} className="flex shrink-0 flex-col gap-px">
                  <span
                    style={{ fontSize: fontSize.xs10, color: color.muted }}
                    className="whitespace-nowrap font-medium uppercase tracking-wider"
                  >
                    {label}
                  </span>
                  <span
                    {...(anchor ? guide(anchor) : {})}
                    className="whitespace-nowrap tabular-nums font-semibold"
                    style={{ fontSize: fontSize.xs11, color: col ?? `${color.white}bf` }}
                  >
                    {value}
                  </span>
                </div>
              ))}
              {cross && (
                <div className="flex shrink-0 flex-col gap-px" data-testid="account-mm-rate">
                  <span
                    style={{ fontSize: fontSize.xs10, color: color.muted }}
                    className="whitespace-nowrap font-medium uppercase tracking-wider"
                    title={CROSS_MM_RATE_HELP}
                  >
                    MM Rate
                  </span>
                  <MmrBar rate={Number.isFinite(cross.mmRate) ? cross.mmRate : 1} />
                </div>
              )}
            </div>

            {/* ── Tab bar ─────────────────────────────────────────────────── */}
            <div
              className="relative flex items-center overflow-x-auto border-b border-white/6 scrollbar-none"
              style={{ background: bg.panel }}
            >
              {(
                [
                  ...(market === 'spot'
                    ? (['assets'] as const)
                    : (['positions', 'closedpnl'] as const)),
                  'orders',
                  'orderhistory',
                  'balancehistory',
                  'journal',
                ] as const
              ).map((tab) => (
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
                  {tab === 'orderhistory'
                    ? 'Order History'
                    : tab === 'balancehistory'
                      ? 'Balance History'
                      : tab === 'closedpnl'
                        ? 'Closed P&L'
                        : tab}
                  {tab === 'assets' && spotBalances.some((h) => h.free + h.locked > 0) && (
                    <span
                      className="rounded-full px-1.5 py-px font-bold text-white"
                      style={{ fontSize: fontSize.xxs, background: color.purpleDark }}
                    >
                      {spotBalances.filter((h) => h.free + h.locked > 0).length}
                    </span>
                  )}
                  {tab === 'positions' && positions.length > 0 && (
                    <span
                      className="rounded-full px-1.5 py-px font-bold text-white"
                      style={{ fontSize: fontSize.xxs, background: color.purpleDark }}
                    >
                      {positions.length}
                    </span>
                  )}
                  {tab === 'orders' && activeOrdersBadgeCount > 0 && (
                    <span
                      className="rounded-full px-1.5 py-px font-bold text-white"
                      style={{ fontSize: fontSize.xxs, background: color.amber }}
                    >
                      {activeOrdersBadgeCount}
                    </span>
                  )}
                  {tab === 'orderhistory' && orderHistoryRows.length > 0 && (
                    <span
                      className="rounded-full bg-white/8 px-1.5 py-px font-semibold"
                      style={{ fontSize: fontSize.xxs, color: color.muted }}
                    >
                      {orderHistoryRows.length}
                    </span>
                  )}
                  {tab === 'balancehistory' && balanceHistoryRows.length > 0 && (
                    <span
                      className="rounded-full bg-white/8 px-1.5 py-px font-semibold"
                      style={{ fontSize: fontSize.xxs, color: color.muted }}
                    >
                      {balanceHistoryRows.length}
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
              {infoTab !== 'journal' && infoTab !== 'assets' && infoTab !== 'closedpnl' && (
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
                                  color: on ? color.white : color.muted,
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
                {(
                  ['all', 'working', 'inactive', 'filled', 'cancelled', 'rejected'] as OrderSubTab[]
                ).map((sub) => {
                  const count =
                    sub === 'all'
                      ? allOrderDisplayRows.length
                      : sub === 'working'
                        ? allOrderDisplayRows.filter(
                            (r) =>
                              r.kind === 'pending' ||
                              (r.kind === 'exit-order' && r.data.status === 'working')
                          ).length
                        : sub === 'inactive'
                          ? allOrderDisplayRows.filter(
                              (r) => r.kind === 'exit-order' && r.data.status === 'inactive'
                            ).length
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
                                : `color-mix(in srgb, ${color.white} 7%, transparent)`,
                            color: orderSubTab === sub ? color.purple : color.muted,
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Order History sub-tab bar ───────────────────────────────── */}
            {infoTab === 'orderhistory' && (
              <div
                className="flex shrink-0 items-center gap-0 border-b border-white/4 px-2"
                style={{ background: bg.panel }}
              >
                {(['all', 'filled', 'cancelled', 'rejected'] as OrderHistorySubTab[]).map((sub) => {
                  const count =
                    sub === 'all'
                      ? orderHistoryRows.length
                      : orderHistoryRows.filter((o) => o.status === sub).length;
                  return (
                    <button
                      key={sub}
                      onClick={() => setOrderHistorySubTab(sub)}
                      className="relative flex items-center gap-1 px-3 py-1.5 transition-colors"
                      style={{
                        fontSize: fontSize.xs11,
                        fontWeight: orderHistorySubTab === sub ? 600 : 400,
                        color: orderHistorySubTab === sub ? color.purple : color.muted,
                      }}
                    >
                      {orderHistorySubTab === sub && (
                        <motion.span
                          layoutId="order-history-sub-tab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                          style={{ background: color.purpleDark }}
                        />
                      )}
                      <span className="capitalize">
                        {sub.charAt(0).toUpperCase() + sub.slice(1)}
                      </span>
                      {count > 0 && (
                        <span
                          className="rounded-full px-1 py-px tabular-nums"
                          style={{
                            fontSize: fontSize.xxs,
                            background:
                              orderHistorySubTab === sub
                                ? `${color.purpleDark}40`
                                : `color-mix(in srgb, ${color.white} 7%, transparent)`,
                            color: orderHistorySubTab === sub ? color.purple : color.muted,
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={infoTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                  className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden"
                >
                  {/* ════ Assets (Spot) ═════════════════════════════════════════════ */}
                  {infoTab === 'assets' && (
                    <AssetsTable
                      usdtBalance={balance}
                      usdtReserved={reserved}
                      rows={assetRows}
                      onSell={handleSellAsset}
                    />
                  )}

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
                      <div className="flex-1 overflow-auto">
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
                                    {col.id === 'liq' || col.id === 'mmr' ? (
                                      <span className="inline-flex items-center gap-1">
                                        {col.label}
                                        <span
                                          title={
                                            col.id === 'liq' ? LIQUIDATION_EXPLAINER : MMR_EXPLAINER
                                          }
                                        >
                                          <Info className="h-3 w-3 opacity-60" />
                                        </span>
                                      </span>
                                    ) : (
                                      col.label
                                    )}
                                  </th>
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            <AnimatePresence>
                              {positions.map((pos, i) => {
                                const markPrice = getMark(pos.symbol) ?? pos.entryPrice;
                                const lastPrice = getPrice('linear', pos.symbol);
                                const pnl = positionPnl(pos, markPrice);
                                // Cross: the account's MM rate (liquidation is account-wide)
                                const mmrRate = cross
                                  ? Number.isFinite(cross.mmRate)
                                    ? cross.mmRate
                                    : 1
                                  : positionMmrRate(pos, markPrice);
                                const pnlPct = (pnl / pos.entryUsdtAmount) * 100;
                                const isProfit = pnl >= 0;
                                // Position margin as Bybit shows it: IM + margin added by hand
                                const margin = pos.entryUsdtAmount + pos.extraMargin;
                                // The open fee actually charged (stored with the position)
                                const commission = pos.entryFee;
                                const tradeValue = pos.entryPrice * pos.quantity;
                                const marketValue = markPrice * pos.quantity;

                                return (
                                  <motion.tr
                                    key={pos.id}
                                    {...guide('positions.row', `${pos.category}:${pos.symbol}`)}
                                    custom={i}
                                    variants={rowVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    layout
                                    className="group border-b border-white/3 transition-colors hover:bg-white/2"
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
                                          {pos.side === 'long' ? 'Long' : 'Short'}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('positions', 'qty') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {fmtQty(pos.quantity)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'entry') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        ${fmtMktPrice(pos.entryPrice)}
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
                                        <span className="inline-flex items-center justify-end gap-1">
                                          {onEditPosition && (
                                            <button
                                              onClick={() => onEditPosition(pos.id)}
                                              title="Edit exits"
                                              className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                              style={{ color: color.muted }}
                                            >
                                              <Pencil className="h-2.5 w-2.5" />
                                            </button>
                                          )}
                                          {pos.takeProfit ? `$${fmtMktPrice(pos.takeProfit)}` : '—'}
                                        </span>
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
                                        <span className="inline-flex items-center justify-end gap-1">
                                          {onEditPosition && (
                                            <button
                                              onClick={() => onEditPosition(pos.id)}
                                              title="Edit exits"
                                              className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                              style={{ color: color.muted }}
                                            >
                                              <Pencil className="h-2.5 w-2.5" />
                                            </button>
                                          )}
                                          {pos.stopLoss ? `$${fmtMktPrice(pos.stopLoss)}` : '—'}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('positions', 'mark') && (
                                      <td
                                        {...guide('positions.row.mark')}
                                        className="px-3 py-1.5 text-right tabular-nums text-white/60"
                                      >
                                        ${fmtMktPrice(markPrice)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'last') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {lastPrice !== null ? `$${fmtMktPrice(lastPrice)}` : '—'}
                                      </td>
                                    )}
                                    {isVisible('positions', 'liq') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ color: color.amber }}
                                        data-testid="position-liq-price"
                                      >
                                        {(() => {
                                          // Cross: Bybit's estimate from the whole account
                                          const liq = cross
                                            ? crossLiqPrice(pos, getMark(pos.symbol), cross)
                                            : pos.liqPrice;
                                          return liq !== null && liq > 0
                                            ? `$${fmtMktPrice(liq)}`
                                            : '—';
                                        })()}
                                      </td>
                                    )}
                                    {isVisible('positions', 'mmr') && (
                                      <td className="px-3 py-1.5">
                                        {mmrRate !== null ? (
                                          <MmrBar
                                            rate={mmrRate}
                                            title={(() => {
                                              const info = riskTierInfo(
                                                pos.symbol,
                                                pos.quantity * pos.entryPrice,
                                                pos.leverage
                                              );
                                              return info ? riskTierLabel(info) : undefined;
                                            })()}
                                          />
                                        ) : (
                                          <span style={{ color: color.muted }}>—</span>
                                        )}
                                      </td>
                                    )}
                                    {isVisible('positions', 'pnl') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums font-semibold"
                                        style={{ color: isProfit ? color.green : color.red }}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          <span {...guide('positions.row.pnl')}>
                                            {isProfit ? '+' : ''}
                                            {pnl.toFixed(2)}
                                          </span>
                                          <span
                                            style={{
                                              fontSize: fontSize.xs10,
                                              color: isProfit ? color.green : color.red,
                                              opacity: 0.7,
                                            }}
                                          >
                                            USD
                                          </span>
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('positions', 'pnlPct') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums font-semibold"
                                        style={{ color: isProfit ? color.green : color.red }}
                                      >
                                        {isProfit ? '+' : ''}
                                        {pnlPct.toFixed(2)}%
                                      </td>
                                    )}
                                    {isVisible('positions', 'funding') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        data-testid="position-funding"
                                        style={{
                                          // cumFunding + = paid (money out), − = received
                                          color:
                                            pos.cumFunding > 0
                                              ? color.red
                                              : pos.cumFunding < 0
                                                ? color.green
                                                : color.muted,
                                        }}
                                        title="Funding settled on this position so far (paid −, received +)"
                                      >
                                        {pos.cumFunding === 0
                                          ? '0.00'
                                          : `${pos.cumFunding > 0 ? '−' : '+'}${Math.abs(pos.cumFunding).toFixed(2)}`}
                                      </td>
                                    )}
                                    {isVisible('positions', 'tradeValue') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        <span className="inline-flex items-center gap-1">
                                          <span>{tradeValue.toFixed(2)}</span>
                                          <span
                                            style={{
                                              fontSize: fontSize.xs10,
                                              color: color.muted,
                                            }}
                                          >
                                            USD
                                          </span>
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('positions', 'marketValue') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        <span className="inline-flex items-center gap-1">
                                          <span>{marketValue.toFixed(2)}</span>
                                          <span
                                            style={{
                                              fontSize: fontSize.xs10,
                                              color: color.muted,
                                            }}
                                          >
                                            USD
                                          </span>
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('positions', 'leverage') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        1:{pos.leverage}
                                      </td>
                                    )}
                                    {isVisible('positions', 'margin') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        <span className="inline-flex items-center gap-1">
                                          {/* Isolated only — cross has no per-position margin */}
                                          {!cross && (
                                            <button
                                              type="button"
                                              onClick={() => setMarginDialogFor(pos.id)}
                                              title="Add / reduce margin"
                                              aria-label={`Adjust margin for ${pos.symbol}`}
                                              className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-white"
                                              style={{ color: color.muted }}
                                            >
                                              <Pencil className="h-2.5 w-2.5" />
                                            </button>
                                          )}
                                          <span>{margin.toFixed(2)}</span>
                                          <span
                                            style={{
                                              fontSize: fontSize.xs10,
                                              color: color.muted,
                                            }}
                                          >
                                            USD
                                          </span>
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('positions', 'im') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {pos.positionIM.toFixed(2)}
                                      </td>
                                    )}
                                    {isVisible('positions', 'mm') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {pos.positionMM !== null ? pos.positionMM.toFixed(2) : '—'}
                                      </td>
                                    )}
                                    {isVisible('positions', 'expiry') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        —
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
                                          {...guide('positions.row.close')}
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
                      <div className="flex-1 overflow-auto">
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
                                const isExitOrder = row.kind === 'exit-order';
                                const isPending = row.kind === 'pending';
                                const p = isPending ? row.data : null;
                                const h = !isPending && !isExitOrder ? row.data : null;
                                const ex = isExitOrder ? row.data : null;
                                const rowId = row.data.id;
                                const symbol = row.data.symbol;
                                const side = isExitOrder ? ex!.side : row.data.side;
                                const type = isExitOrder
                                  ? ex!.exitType.toLowerCase().replace(' ', '-')
                                  : row.data.type;
                                const qty = isExitOrder ? ex!.qty : row.data.qty;
                                const placingTs = isPending
                                  ? p!.placedAt
                                  : isExitOrder
                                    ? ex!.placedAt
                                    : h!.placingTime;

                                // status badge config
                                const statusLabel = isPending
                                  ? 'Working'
                                  : isExitOrder
                                    ? ex!.status === 'inactive'
                                      ? 'Inactive'
                                      : 'Working'
                                    : h!.status === 'filled'
                                      ? 'Filled'
                                      : h!.status === 'cancelled'
                                        ? 'Cancelled'
                                        : 'Rejected';
                                const statusColor = isPending
                                  ? color.amber
                                  : isExitOrder
                                    ? ex!.status === 'inactive'
                                      ? color.muted
                                      : color.amber
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
                                    className="group border-b border-white/3 transition-colors hover:bg-white/2"
                                    // Bench terminal rows (filled/cancelled/rejected within TTL) are
                                    // dimmed so users can distinguish them from live active rows.
                                    style={
                                      !isPending && !isExitOrder ? { opacity: 0.65 } : undefined
                                    }
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
                                        <span className="inline-flex items-center gap-1">
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
                                          {/* Clock icon signals this terminal row is temporary —
                                              it will auto-evict from Orders after the 2-min TTL */}
                                          {!isPending && !isExitOrder && (
                                            <span title="This row will clear from Orders in ~2 minutes. It stays permanently in Order History.">
                                              <Clock
                                                className="shrink-0"
                                                style={{
                                                  width: 10,
                                                  height: 10,
                                                  color: color.amber,
                                                  opacity: 0.7,
                                                }}
                                              />
                                            </span>
                                          )}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orders', 'type') && (
                                      <td className="px-3 py-1.5">
                                        <span
                                          className="rounded px-1 py-px font-bold uppercase"
                                          style={{
                                            fontSize: fontSize.xs10,
                                            // Same pill as Order History: a spot TP / SL leg is a
                                            // pending row but gets the green / red exit pill
                                            ...(isExitOrder
                                              ? {
                                                  background:
                                                    ex!.exitType === 'Take Profit'
                                                      ? `${color.green}22`
                                                      : `${color.red}22`,
                                                  color:
                                                    ex!.exitType === 'Take Profit'
                                                      ? color.green
                                                      : color.red,
                                                }
                                              : orderTypePillStyle(type, color)),
                                          }}
                                        >
                                          {isExitOrder ? ex!.exitType : orderTypeLabel(type)}
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
                                        {qty > 0 ? fmtQty(qty) : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'limitPrice') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                        <span className="inline-flex items-center justify-end gap-1">
                                          {/* Pencil: pending main order — limit orders only
                                              (stop orders have their pencil in the stopPrice column) */}
                                          {isPending && type === 'limit' && onEditPendingOrder && (
                                            <button
                                              onClick={() => onEditPendingOrder(rowId)}
                                              title="Edit order"
                                              className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                              style={{ color: color.muted }}
                                            >
                                              <Pencil className="h-2.5 w-2.5" />
                                            </button>
                                          )}
                                          {/* Pencil: Working TP row → edit open position exits */}
                                          {isExitOrder &&
                                            ex!.status === 'working' &&
                                            ex!.exitType === 'Take Profit' &&
                                            onEditPosition && (
                                              <button
                                                onClick={() => onEditPosition(ex!.positionId)}
                                                title="Edit exits"
                                                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                                style={{ color: color.muted }}
                                              >
                                                <Pencil className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          {/* Pencil: Inactive TP row → edit the parent pending order */}
                                          {isExitOrder &&
                                            ex!.status === 'inactive' &&
                                            ex!.exitType === 'Take Profit' &&
                                            onEditPendingOrder && (
                                              <button
                                                onClick={() => onEditPendingOrder(ex!.positionId)}
                                                title="Edit pending order"
                                                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                                style={{ color: color.muted }}
                                              >
                                                <Pencil className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          {isExitOrder
                                            ? ex!.exitType === 'Take Profit'
                                              ? `$${fmtMktPrice(ex!.price)}`
                                              : '—'
                                            : isPending
                                              ? // a spot take-profit leg rests at its price, like a limit
                                                type === 'limit' || type === 'take-profit'
                                                ? `$${fmtMktPrice(p!.triggerPrice)}`
                                                : '—'
                                              : h!.limitPrice != null
                                                ? `$${fmtMktPrice(h!.limitPrice)}`
                                                : '—'}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orders', 'stopPrice') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                        <span className="inline-flex items-center justify-end gap-1">
                                          {/* Pencil: pending main order (stop) */}
                                          {isPending && type === 'stop' && onEditPendingOrder && (
                                            <button
                                              onClick={() => onEditPendingOrder(rowId)}
                                              title="Edit order"
                                              className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                              style={{ color: color.muted }}
                                            >
                                              <Pencil className="h-2.5 w-2.5" />
                                            </button>
                                          )}
                                          {/* Pencil: Working SL row → edit open position exits */}
                                          {isExitOrder &&
                                            ex!.status === 'working' &&
                                            ex!.exitType === 'Stop Loss' &&
                                            onEditPosition && (
                                              <button
                                                onClick={() => onEditPosition(ex!.positionId)}
                                                title="Edit exits"
                                                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                                style={{ color: color.muted }}
                                              >
                                                <Pencil className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          {/* Pencil: Inactive SL row → edit the parent pending order */}
                                          {isExitOrder &&
                                            ex!.status === 'inactive' &&
                                            ex!.exitType === 'Stop Loss' &&
                                            onEditPendingOrder && (
                                              <button
                                                onClick={() => onEditPendingOrder(ex!.positionId)}
                                                title="Edit pending order"
                                                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                                style={{ color: color.muted }}
                                              >
                                                <Pencil className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          {isExitOrder
                                            ? ex!.exitType === 'Stop Loss'
                                              ? `$${fmtMktPrice(ex!.price)}`
                                              : '—'
                                            : isPending
                                              ? // a spot stop-loss leg is a stop trigger
                                                type === 'stop' || type === 'stop-loss'
                                                ? `$${fmtMktPrice(p!.triggerPrice)}`
                                                : '—'
                                              : h!.stopPrice != null
                                                ? `$${fmtMktPrice(h!.stopPrice)}`
                                                : '—'}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orders', 'fillPrice') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                        {!isPending && !isExitOrder && h!.fillPrice != null
                                          ? `$${fmtMktPrice(h!.fillPrice)}`
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
                                        <span className="inline-flex items-center justify-end gap-1">
                                          {isPending &&
                                            hasEditableExits(p!) &&
                                            onEditPendingOrder && (
                                              <button
                                                onClick={() => onEditPendingOrder(rowId)}
                                                title="Edit TP"
                                                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                                style={{ color: color.muted }}
                                              >
                                                <Pencil className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          {isPending && p!.takeProfit
                                            ? `$${fmtMktPrice(p!.takeProfit)}`
                                            : '—'}
                                        </span>
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
                                        <span className="inline-flex items-center justify-end gap-1">
                                          {isPending &&
                                            hasEditableExits(p!) &&
                                            onEditPendingOrder && (
                                              <button
                                                onClick={() => onEditPendingOrder(rowId)}
                                                title="Edit SL"
                                                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                                                style={{ color: color.muted }}
                                              >
                                                <Pencil className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          {isPending && p!.stopLoss
                                            ? `$${fmtMktPrice(p!.stopLoss)}`
                                            : '—'}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orders', 'commission') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {!isPending && !isExitOrder ? <FeeCell order={h!} /> : '—'}
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
                                        {isPending && p!.category === 'linear'
                                          ? `1:${p!.leverage}`
                                          : h?.leverage
                                            ? `1:${h.leverage}`
                                            : '—'}
                                      </td>
                                    )}
                                    {isVisible('orders', 'margin') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {isPending
                                          ? p!.usdtAmount != null
                                            ? `$${p!.usdtAmount.toFixed(2)}`
                                            : '—'
                                          : isExitOrder
                                            ? '—'
                                            : h!.margin != null
                                              ? `$${h!.margin.toFixed(2)}`
                                              : '—'}
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
                                        ) : isExitOrder && ex!.status === 'working' ? (
                                          <motion.button
                                            onClick={() =>
                                              cancelExitOrder(
                                                ex!.positionId,
                                                ex!.exitType === 'Take Profit'
                                                  ? 'take-profit'
                                                  : 'stop-loss'
                                              )
                                            }
                                            whileHover={{ scale: 1.2 }}
                                            whileTap={{ scale: 0.9 }}
                                            title={`Cancel ${ex!.exitType}`}
                                            className="mx-auto flex h-5 w-5 items-center justify-center rounded transition-colors hover:text-brand-red"
                                            style={{ color: color.muted }}
                                          >
                                            <X className="h-3 w-3" />
                                          </motion.button>
                                        ) : isExitOrder && ex!.status === 'inactive' ? (
                                          <motion.button
                                            onClick={() =>
                                              cancelPendingExitLeg(
                                                ex!.positionId,
                                                ex!.exitType === 'Take Profit'
                                                  ? 'take-profit'
                                                  : 'stop-loss'
                                              )
                                            }
                                            whileHover={{ scale: 1.2 }}
                                            whileTap={{ scale: 0.9 }}
                                            title={`Cancel ${ex!.exitType} (no balance refund)`}
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

                  {/* ════ Order History ════════════════════════════════════════════ */}
                  {infoTab === 'orderhistory' &&
                    (filteredOrderHistoryRows.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex h-full flex-col items-center justify-center gap-1 text-xs"
                        style={{ color: color.muted }}
                      >
                        <Clock className="h-4 w-4 opacity-40" />
                        No order history
                      </motion.div>
                    ) : (
                      <div className="flex-1 overflow-auto">
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
                              {ORDER_HISTORY_COLS.filter((c) =>
                                isVisible('orderhistory', c.id)
                              ).map((col) => (
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
                              {filteredOrderHistoryRows.map((o, i) => {
                                const statusColor =
                                  o.status === 'filled'
                                    ? color.green
                                    : o.status === 'cancelled'
                                      ? color.muted
                                      : color.red;
                                return (
                                  <motion.tr
                                    key={o.id}
                                    custom={i}
                                    variants={rowVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    layout
                                    className="border-b border-white/3 transition-colors hover:bg-white/2"
                                  >
                                    {isVisible('orderhistory', 'symbol') && (
                                      <td className="px-3 py-1.5">
                                        <span className="flex items-center gap-2">
                                          <SymbolPair
                                            base={o.symbol.replace('USDT', '')}
                                            quote="USDT"
                                            baseSize={16}
                                          />
                                          <span className="font-bold text-white">{o.symbol}</span>
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'side') && (
                                      <td className="px-3 py-1.5">
                                        <span
                                          className="font-bold uppercase"
                                          style={{
                                            fontSize: fontSize.xs10,
                                            color: o.side === 'buy' ? color.green : color.red,
                                          }}
                                        >
                                          {o.side === 'buy' ? 'Buy' : 'Sell'}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'type') && (
                                      <td className="px-3 py-1.5">
                                        <span
                                          className="rounded px-1 py-px font-bold"
                                          style={{
                                            fontSize: fontSize.xs10,
                                            ...(o.liquidation
                                              ? { background: `${color.red}22`, color: color.red }
                                              : orderTypePillStyle(o.type, color)),
                                          }}
                                          title={
                                            o.liquidation
                                              ? 'Closed by liquidation at the bankruptcy price (Bybit CreateByLiq)'
                                              : undefined
                                          }
                                        >
                                          {o.liquidation ? 'Liquidation' : orderTypeLabel(o.type)}
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'qty') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                                        {o.qty > 0 ? fmtQty(o.qty) : '—'}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'limitPrice') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                        {o.limitPrice != null
                                          ? `$${fmtMktPrice(o.limitPrice)}`
                                          : '—'}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'stopPrice') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                        {o.stopPrice != null ? `$${fmtMktPrice(o.stopPrice)}` : '—'}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'fillPrice') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                                        {o.fillPrice != null ? `$${fmtMktPrice(o.fillPrice)}` : '—'}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'status') && (
                                      <td className="px-3 py-1.5">
                                        {o.status === 'rejected' ? (
                                          <span
                                            className="inline-flex items-center gap-1"
                                            title={o.rejectionReason ?? 'Order rejected'}
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
                                            className="rounded px-1.5 py-px font-bold capitalize"
                                            style={{
                                              fontSize: fontSize.xs10,
                                              background: `${statusColor}22`,
                                              color: statusColor,
                                            }}
                                          >
                                            {o.status}
                                          </span>
                                        )}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'commission') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {o.commission > 0 ? <FeeCell order={o} /> : '—'}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'placingTime') && (
                                      <td
                                        className="whitespace-nowrap px-3 py-1.5 tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {fmtTime(o.placingTime)}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'closingTime') && (
                                      <td
                                        className="whitespace-nowrap px-3 py-1.5 tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {fmtTime(o.closingTime)}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'orderId') && (
                                      <td
                                        className="px-3 py-1.5 tabular-nums font-mono"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                        title={o.id}
                                      >
                                        {shortId(o.id)}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'leverage') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {o.leverage ? `1:${o.leverage}` : '—'}
                                      </td>
                                    )}
                                    {isVisible('orderhistory', 'margin') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {o.margin != null ? `$${o.margin.toFixed(2)}` : '—'}
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
                  {/* ════ Balance History ══════════════════════════════════════ */}
                  {infoTab === 'balancehistory' &&
                    (balanceHistoryRows.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex h-full items-center justify-center text-xs"
                        style={{ color: color.muted }}
                      >
                        No balance history yet
                      </motion.div>
                    ) : (
                      <div className="flex-1 overflow-auto">
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
                              {BALANCE_HISTORY_COLS.filter((c) =>
                                isVisible('balancehistory', c.id)
                              ).map((col) => (
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
                              {balanceHistoryRows.map((entry, i) => {
                                const pnlColor =
                                  entry.pnl > 0
                                    ? color.green
                                    : entry.pnl < 0
                                      ? color.red
                                      : color.muted;
                                return (
                                  <motion.tr
                                    key={entry.id}
                                    custom={i}
                                    variants={rowVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    layout
                                    className="border-b border-white/3 transition-colors hover:bg-white/2"
                                  >
                                    {isVisible('balancehistory', 'time') && (
                                      <td
                                        className="whitespace-nowrap px-3 py-1.5 tabular-nums"
                                        style={{ fontSize: fontSize.xs10, color: color.muted }}
                                      >
                                        {fmtTime(entry.time)}
                                      </td>
                                    )}
                                    {isVisible('balancehistory', 'balanceBefore') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/70">
                                        {entry.balanceBefore.toLocaleString(undefined, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}
                                      </td>
                                    )}
                                    {isVisible('balancehistory', 'balanceAfter') && (
                                      <td className="px-3 py-1.5 text-right tabular-nums text-white/70">
                                        {entry.balanceAfter.toLocaleString(undefined, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}
                                      </td>
                                    )}
                                    {isVisible('balancehistory', 'pnl') && (
                                      <td
                                        className="px-3 py-1.5 text-right tabular-nums font-semibold"
                                        style={{ color: pnlColor }}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          <span>
                                            {entry.pnl > 0 ? '+' : ''}
                                            {entry.pnl.toFixed(2)}
                                          </span>
                                          <span
                                            style={{
                                              fontSize: fontSize.xs10,
                                              color: pnlColor,
                                              opacity: 0.7,
                                            }}
                                          >
                                            USD
                                          </span>
                                        </span>
                                      </td>
                                    )}
                                    {isVisible('balancehistory', 'action') && (
                                      <td
                                        className="px-3 py-1.5 text-white/60"
                                        style={{ fontSize: fontSize.xs10, minWidth: 200 }}
                                      >
                                        {entry.action}
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

                  {/* ════ Closed P&L (BP-5 D) ═══════════════════════════════ */}
                  {infoTab === 'closedpnl' && <ClosedPnlTable />}

                  {/* ════ Journal ════════════════════════════════════════════ */}
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
                        <div className="flex-1 overflow-auto">
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
                  border: `1px solid color-mix(in srgb, ${color.white} 8%, transparent)`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal header */}
                <div
                  className="flex items-center justify-between border-b px-4 py-3"
                  style={{ borderColor: `color-mix(in srgb, ${color.white} 7%, transparent)` }}
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
                        background: `color-mix(in srgb, ${color.white} 4%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${color.white} 7%, transparent)`,
                        fontSize: fontSize.xs,
                      }}
                    >
                      {username}
                    </div>
                  </div>

                  {/* Fees (read-only) — Bybit VIP-0 rates; leverage is set per symbol in the
                      trading panel (BP-2) */}
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-xs font-medium"
                      style={{ color: color.muted, fontSize: fontSize.xs11 }}
                    >
                      Fees
                    </label>
                    <div
                      className="flex h-8 items-center justify-between rounded px-3"
                      style={{
                        background: `color-mix(in srgb, ${color.white} 4%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${color.white} 7%, transparent)`,
                      }}
                    >
                      <span
                        style={{
                          fontSize: fontSize.xs,
                          color: `color-mix(in srgb, ${color.white} 60%, transparent)`,
                        }}
                      >
                        Spot {Number(FEE_RATES.spot.taker) * 100}%
                      </span>
                      <span style={{ fontSize: fontSize.xs11, color: color.muted }}>
                        Perpetual {Number(FEE_RATES.linear.taker) * 100}% taker ·{' '}
                        {Number(FEE_RATES.linear.maker) * 100}% maker
                      </span>
                    </div>
                  </div>
                </div>

                {/* Modal footer */}
                <div
                  className="flex items-center justify-between border-t px-4 py-3"
                  style={{ borderColor: `color-mix(in srgb, ${color.white} 7%, transparent)` }}
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
                          background: `color-mix(in srgb, ${color.white} 5%, transparent)`,
                          color: color.muted,
                          border: `1px solid color-mix(in srgb, ${color.white} 8%, transparent)`,
                          fontSize: fontSize.xs,
                        }}
                      >
                        Reset account
                      </motion.button>
                    )}
                  </AnimatePresence>

                  {/* Done */}
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      setConfirmingReset(false);
                    }}
                    className="flex h-7 items-center rounded px-4 text-xs font-semibold transition-opacity hover:opacity-90"
                    style={{
                      background: `color-mix(in srgb, ${color.purple} 75%, transparent)`,
                      color: color.white,
                      fontSize: fontSize.xs,
                    }}
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Add / reduce margin (BP-5 A) ─────────────────────────────────── */}
      {marginDialogFor &&
        (() => {
          const pos = positions.find((p) => p.id === marginDialogFor);
          return pos ? (
            <AdjustMarginDialog position={pos} onClose={() => setMarginDialogFor(null)} />
          ) : null;
        })()}
    </div>
  );
}
