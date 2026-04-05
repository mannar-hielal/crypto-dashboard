import { useState } from 'react';
import NumberFlow from '@number-flow/react';
import {
  X,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useMarketStore } from '@/store/marketStore';
import { usePaperStore } from '@/store/paperStore';
import type { PanelSize } from '@/pages/DashboardPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderSide = 'buy' | 'sell';
type InfoTab = 'positions' | 'history';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Quick-fill preset percentages for the amount input */
const PRESETS = [25, 50, 75, 100] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface PaperTradingPanelProps {
  size: PanelSize;
  onSizeChange: (size: PanelSize) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaperTradingPanel({ size, onSizeChange }: PaperTradingPanelProps) {
  // ── Local UI state ───────────────────────────────────────────────────────
  const [orderSide, setOrderSide] = useState<OrderSide>('buy');
  const [infoTab, setInfoTab] = useState<InfoTab>('positions');
  const [usdtInput, setUsdtInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // ── Market data (individual selectors — no unnecessary re-renders) ───────
  const symbol = useMarketStore((s) => s.symbol);
  const latestPrice = useMarketStore((s) => s.latestPrice);

  // ── Paper trading store ──────────────────────────────────────────────────
  const balance = usePaperStore((s) => s.balance);
  const positions = usePaperStore((s) => s.positions);
  const history = usePaperStore((s) => s.history);
  const placeOrder = usePaperStore((s) => s.placeOrder);
  const closePosition = usePaperStore((s) => s.closePosition);
  const reset = usePaperStore((s) => s.reset);

  // ── Derived values ───────────────────────────────────────────────────────

  /** Total unrealized PnL across all open positions at current mark price */
  const unrealizedPnl = positions.reduce((sum, pos) => {
    if (!latestPrice) return sum;
    const pnl =
      pos.side === 'long'
        ? (latestPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - latestPrice) * pos.quantity;
    return sum + pnl;
  }, 0);

  /** Equity = available balance + current market value of all open positions */
  const equity =
    balance +
    positions.reduce((sum, pos) => {
      if (!latestPrice) return sum + pos.entryUsdtAmount;
      return sum + pos.quantity * latestPrice;
    }, 0);

  /** Quantity preview shown below the amount input */
  const parsedUsdt = parseFloat(usdtInput);
  const previewQty =
    latestPrice && !isNaN(parsedUsdt) && parsedUsdt > 0 ? parsedUsdt / latestPrice : null;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleSideChange(side: OrderSide) {
    setOrderSide(side);
    setFormError(null);
  }

  function handlePreset(pct: number) {
    const amount = (balance * pct) / 100;
    setUsdtInput(amount > 0 ? amount.toFixed(2) : '');
    setFormError(null);
  }

  function handleExecute() {
    setFormError(null);

    if (!latestPrice) {
      setFormError('Waiting for live price…');
      return;
    }

    const amount = parseFloat(usdtInput);

    if (isNaN(amount) || amount <= 0) {
      setFormError('Enter a valid USDT amount');
      return;
    }
    if (amount > balance) {
      setFormError('Insufficient balance');
      return;
    }

    const id = placeOrder(symbol, orderSide, latestPrice, amount);
    if (!id) {
      setFormError('Order could not be placed');
      return;
    }

    setUsdtInput('');
    setInfoTab('positions'); // navigate to Positions tab after placing order
  }

  function handleClose(positionId: string) {
    closePosition(positionId, latestPrice ?? 0);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const baseAsset = symbol.replace('USDT', '');

  return (
    <div className="flex h-full w-full flex-col border-t border-white/[0.08] bg-[#1a1d2e]">
      {/* ── Header bar (always visible, even when collapsed) ──────────────── */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        {/* Left: title + quick stats */}
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="text-xs font-semibold text-slate-300">Paper Trading</span>
          <span className="text-slate-600">·</span>
          <span className="text-[11px] tabular-nums text-slate-400">
            <span className="mr-1 text-slate-600">Balance</span>$
            {balance.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-slate-600">·</span>
          <span
            className={`text-[11px] font-medium tabular-nums ${unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
          >
            {unrealizedPnl >= 0 ? '+' : ''}
            {unrealizedPnl.toFixed(2)} P&amp;L
          </span>
        </div>

        {/* Right: panel size controls */}
        <div className="flex items-center gap-0.5">
          {size === 'collapsed' ? (
            /* Collapsed → single "expand to open" button */
            <button
              onClick={() => onSizeChange('open')}
              title="Expand"
              className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          ) : (
            <>
              {/* Maximize / Restore toggle */}
              {size === 'open' ? (
                <button
                  onClick={() => onSizeChange('maximized')}
                  title="Maximize panel"
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              ) : (
                <button
                  onClick={() => onSizeChange('open')}
                  title="Restore panel"
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
                >
                  <Minimize2 className="h-3 w-3" />
                </button>
              )}
              {/* Collapse */}
              <button
                onClick={() => onSizeChange('collapsed')}
                title="Collapse panel"
                className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Panel content (hidden when collapsed) ────────────────────────── */}
      {size !== 'collapsed' && (
        <div className="flex min-h-0 flex-1">
          {/* ── LEFT: Order Entry ──────────────────────────────────────────────── */}
          <div className="flex w-72 shrink-0 flex-col gap-3 border-r border-white/[0.08] p-3">
            {/* Account summary row */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-600">Balance</p>
                <NumberFlow
                  value={balance}
                  format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 2 }}
                  className="text-sm font-semibold tabular-nums text-white"
                />
              </div>

              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-slate-600">
                  Unrealized P&amp;L
                </p>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {unrealizedPnl >= 0 ? '+' : ''}
                  {unrealizedPnl.toFixed(2)} USDT
                </span>
              </div>

              {/* Reset account button */}
              <button
                onClick={reset}
                title="Reset account to $10,000"
                className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-600 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Equity row */}
            <div className="flex items-center justify-between rounded border border-white/[0.07] bg-[#131722] px-2.5 py-1.5">
              <span className="text-[10px] text-slate-600">Equity</span>
              <NumberFlow
                value={equity}
                format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 2 }}
                className="text-xs tabular-nums text-slate-300"
              />
            </div>

            {/* Buy / Sell toggle */}
            <div className="flex rounded bg-[#131722] p-0.5">
              <button
                onClick={() => handleSideChange('buy')}
                className={`flex-1 rounded py-1.5 text-xs font-semibold transition-colors ${
                  orderSide === 'buy'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                Buy / Long
              </button>
              <button
                onClick={() => handleSideChange('sell')}
                className={`flex-1 rounded py-1.5 text-xs font-semibold transition-colors ${
                  orderSide === 'sell'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                Sell / Short
              </button>
            </div>

            {/* USDT amount input */}
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={usdtInput}
                  onChange={(e) => {
                    setUsdtInput(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="Amount"
                  className="w-full rounded border border-white/[0.08] bg-[#131722] px-2.5 py-1.5 pr-14 text-xs text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-600">
                  USDT
                </span>
              </div>

              {/* Quantity preview */}
              {previewQty !== null && (
                <p className="text-[10px] text-slate-500">
                  ≈{' '}
                  <span className="text-slate-400">
                    {previewQty.toFixed(6)} {baseAsset}
                  </span>
                  {latestPrice && (
                    <span className="ml-1 text-slate-600">@ ${latestPrice.toFixed(2)}</span>
                  )}
                </p>
              )}

              {/* Quick-fill presets */}
              <div className="flex gap-1">
                {PRESETS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handlePreset(pct)}
                    className="flex-1 rounded border border-white/[0.06] py-0.5 text-[10px] text-slate-500 transition-colors hover:border-indigo-500/30 hover:text-slate-300"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Form error */}
            {formError && <p className="text-[10px] font-medium text-rose-400">{formError}</p>}

            {/* Execute button */}
            <button
              onClick={handleExecute}
              disabled={!latestPrice || !usdtInput || parseFloat(usdtInput) <= 0}
              className={`w-full rounded py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                orderSide === 'buy'
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 active:bg-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:bg-rose-500/40'
              }`}
            >
              {orderSide === 'buy' ? '↑ Buy' : '↓ Sell'} {symbol} · Market
            </button>
          </div>

          {/* ── RIGHT: Positions / History ─────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Tab bar */}
            <div className="flex items-center border-b border-white/[0.08]">
              <button
                onClick={() => setInfoTab('positions')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                  infoTab === 'positions'
                    ? 'border-b border-indigo-400 text-indigo-400'
                    : 'text-slate-600 hover:text-slate-300'
                }`}
              >
                Positions
                {positions.length > 0 && (
                  <span className="rounded-full bg-indigo-500/20 px-1.5 py-px text-[10px] text-indigo-400">
                    {positions.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setInfoTab('history')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                  infoTab === 'history'
                    ? 'border-b border-indigo-400 text-indigo-400'
                    : 'text-slate-600 hover:text-slate-300'
                }`}
              >
                History
                {history.length > 0 && (
                  <span className="rounded-full bg-white/[0.05] px-1.5 py-px text-[10px] text-slate-500">
                    {history.length}
                  </span>
                )}
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* ── Positions ─────────────────────────────────────────────────── */}
              {infoTab === 'positions' &&
                (positions.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-600">
                    No open positions
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.04] text-[10px] text-slate-600">
                        <th className="px-3 py-1.5 text-left font-medium">Symbol</th>
                        <th className="px-3 py-1.5 text-left font-medium">Side</th>
                        <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                        <th className="px-3 py-1.5 text-right font-medium">Entry</th>
                        <th className="px-3 py-1.5 text-right font-medium">Mark</th>
                        <th className="px-3 py-1.5 text-right font-medium">PnL (USDT)</th>
                        <th className="px-3 py-1.5 text-center font-medium">Close</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos) => {
                        const markPrice = latestPrice ?? pos.entryPrice;
                        const pnl =
                          pos.side === 'long'
                            ? (markPrice - pos.entryPrice) * pos.quantity
                            : (pos.entryPrice - markPrice) * pos.quantity;
                        const pnlPct = (pnl / pos.entryUsdtAmount) * 100;
                        const isProfit = pnl >= 0;

                        return (
                          <tr
                            key={pos.id}
                            className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                          >
                            <td className="px-3 py-1.5 font-medium text-white">{pos.symbol}</td>
                            <td className="px-3 py-1.5">
                              <span
                                className={`flex items-center gap-0.5 font-semibold ${
                                  pos.side === 'long' ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {pos.side === 'long' ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : (
                                  <TrendingDown className="h-3 w-3" />
                                )}
                                {pos.side === 'long' ? 'LONG' : 'SHORT'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">
                              {pos.quantity.toFixed(6)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">
                              ${pos.entryPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">
                              ${markPrice.toFixed(2)}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                                isProfit ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isProfit ? '+' : ''}
                              {pnl.toFixed(2)}{' '}
                              <span className="text-[10px] opacity-70">
                                ({isProfit ? '+' : ''}
                                {pnlPct.toFixed(2)}%)
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                onClick={() => handleClose(pos.id)}
                                title="Close position at market price"
                                className="mx-auto flex h-5 w-5 items-center justify-center rounded text-slate-600 transition-colors hover:bg-rose-500/20 hover:text-rose-400"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}

              {/* ── History ───────────────────────────────────────────────────── */}
              {infoTab === 'history' &&
                (history.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-600">
                    No closed trades yet
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.04] text-[10px] text-slate-600">
                        <th className="px-3 py-1.5 text-left font-medium">Symbol</th>
                        <th className="px-3 py-1.5 text-left font-medium">Side</th>
                        <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                        <th className="px-3 py-1.5 text-right font-medium">Entry</th>
                        <th className="px-3 py-1.5 text-right font-medium">Exit</th>
                        <th className="px-3 py-1.5 text-right font-medium">PnL (USDT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((trade) => {
                        const isProfit = trade.pnl >= 0;
                        return (
                          <tr
                            key={trade.id}
                            className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                          >
                            <td className="px-3 py-1.5 font-medium text-white">{trade.symbol}</td>
                            <td
                              className={`px-3 py-1.5 font-semibold ${
                                trade.side === 'long' ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {trade.side === 'long' ? 'LONG' : 'SHORT'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">
                              {trade.quantity.toFixed(6)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">
                              ${trade.entryPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">
                              ${trade.exitPrice.toFixed(2)}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                                isProfit ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isProfit ? '+' : ''}
                              {trade.pnl.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
