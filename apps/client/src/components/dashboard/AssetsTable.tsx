/**
 * Spot "Assets" tab (APP_LOG Bybit Parity BP-2): the USDT wallet and every coin held, with average
 * cost, live value and unrealized PnL. Replaces Positions while the active market is Spot.
 * Row actions: Sell (prefills the Spot form) and TP / SL (protects the free coins).
 */

import { useState } from 'react';
import type { SpotBalance } from '@/store/paperStore';
import { bg, color, fontSize } from '@/lib/tokens';
import { guide } from '@/lib/guideAnchors';
import { SpotExitsModal } from './SpotExitsModal';

export interface AssetRow {
  holding: SpotBalance;
  /** Live (or last known) price of the coin's spot market, null if unknown */
  price: number | null;
}

interface AssetsTableProps {
  usdtBalance: number;
  /** USDT set aside by resting spot buys and perpetual orders */
  usdtReserved: number;
  rows: AssetRow[];
  onSell: (symbol: string, qty: number) => void;
}

const COLS = [
  { id: 'coin', label: 'Coin', align: 'left' },
  { id: 'balance', label: 'Balance', align: 'right' },
  { id: 'available', label: 'Available', align: 'right' },
  { id: 'locked', label: 'Locked', align: 'right' },
  { id: 'avgCost', label: 'Avg cost', align: 'right' },
  { id: 'last', label: 'Last price', align: 'right' },
  { id: 'value', label: 'Value (USDT)', align: 'right' },
  { id: 'pnl', label: 'Unrealized PnL', align: 'right' },
  { id: 'actions', label: '', align: 'right' },
] as const;

const usd = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const coin = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 8 });

export function AssetsTable({ usdtBalance, usdtReserved, rows, onSell }: AssetsTableProps) {
  const [exitsFor, setExitsFor] = useState<SpotBalance | null>(null);
  const held = rows.filter((r) => r.holding.free + r.holding.locked > 0);

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr
            className="border-b border-white/4"
            style={{ background: bg.panel, fontSize: fontSize.xs10, color: color.muted }}
          >
            {COLS.map((col) => (
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
          <tr className="border-b border-white/3" {...guide('assets.row', 'USDT')}>
            <td className="px-3 py-1.5 font-bold text-white">USDT</td>
            <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
              {usd(usdtBalance + usdtReserved)}
            </td>
            <td
              className="px-3 py-1.5 text-right tabular-nums text-white/80"
              {...guide('assets.row.free', 'USDT')}
            >
              {usd(usdtBalance)}
            </td>
            <td
              className="px-3 py-1.5 text-right tabular-nums"
              style={{ color: color.muted }}
              {...guide('assets.row.locked', 'USDT')}
            >
              {usd(usdtReserved)}
            </td>
            <td className="px-3 py-1.5 text-right" style={{ color: color.muted }}>
              —
            </td>
            <td className="px-3 py-1.5 text-right" style={{ color: color.muted }}>
              —
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
              {usd(usdtBalance + usdtReserved)}
            </td>
            <td className="px-3 py-1.5 text-right" style={{ color: color.muted }}>
              —
            </td>
            <td />
          </tr>
          {held.map(({ holding, price }) => (
            <AssetRowView
              key={holding.coin}
              holding={holding}
              price={price}
              onSell={onSell}
              onExits={setExitsFor}
            />
          ))}
          {held.length === 0 && (
            <tr>
              <td
                colSpan={COLS.length}
                className="px-3 py-4 text-center"
                style={{ color: color.muted }}
              >
                No coins yet — buy on Spot to hold them here
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {exitsFor && <SpotExitsModal holding={exitsFor} onClose={() => setExitsFor(null)} />}
    </div>
  );
}

interface AssetRowViewProps {
  holding: SpotBalance;
  price: number | null;
  onSell: (symbol: string, qty: number) => void;
  onExits: (holding: SpotBalance) => void;
}

function AssetRowView({ holding, price, onSell, onExits }: AssetRowViewProps) {
  const total = holding.free + holding.locked;
  const value = price !== null ? total * price : null;
  const pnl = price !== null ? (price - holding.avgCost) * total : null;
  const pnlPct =
    pnl !== null && holding.avgCost > 0 ? (pnl / (holding.avgCost * total)) * 100 : null;
  const sign = (v: number) => (v >= 0 ? '+' : '−');
  const pnlColor = pnl === null ? color.muted : pnl >= 0 ? color.green : color.red;

  return (
    <tr
      {...guide('assets.row', holding.coin)}
      className="border-b border-white/3 transition-colors hover:bg-white/2"
    >
      <td className="px-3 py-1.5 font-bold text-white">{holding.coin}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">{coin(total)}</td>
      <td
        {...guide('assets.row.free', holding.coin)}
        className="px-3 py-1.5 text-right tabular-nums text-white/80"
      >
        {coin(holding.free)}
      </td>
      <td
        {...guide('assets.row.locked', holding.coin)}
        className="px-3 py-1.5 text-right tabular-nums"
        style={{ color: color.muted }}
      >
        {coin(holding.locked)}
      </td>
      <td
        {...guide('assets.row.avg-cost', holding.coin)}
        className="px-3 py-1.5 text-right tabular-nums text-white/80"
      >
        {usd(holding.avgCost)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
        {price !== null ? usd(price) : '—'}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
        {value !== null ? usd(value) : '—'}
      </td>
      <td
        {...guide('assets.row.upnl', holding.coin)}
        className="px-3 py-1.5 text-right tabular-nums"
        style={{ color: pnlColor }}
      >
        {/* +/− with the colour, never colour alone (design.md accessibility) */}
        {pnl !== null
          ? `${sign(pnl)}${usd(Math.abs(pnl))}${pnlPct !== null ? ` (${sign(pnlPct)}${Math.abs(pnlPct).toFixed(2)}%)` : ''}`
          : '—'}
      </td>
      <td className="px-3 py-1.5 text-right">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            {...guide('assets.row.sell', holding.coin)}
            onClick={() => onSell(`${holding.coin}USDT`, holding.free)}
            disabled={holding.free <= 0}
            className="rounded px-2 py-0.5 font-semibold transition-colors disabled:opacity-40"
            style={{
              fontSize: fontSize.xs10,
              color: color.red,
              border: `1px solid ${color.red}40`,
            }}
          >
            Sell
          </button>
          <button
            type="button"
            {...guide('assets.row.tpsl', holding.coin)}
            onClick={() => onExits(holding)}
            disabled={holding.free <= 0}
            className="rounded px-2 py-0.5 font-semibold transition-colors disabled:opacity-40"
            style={{
              fontSize: fontSize.xs10,
              color: color.muted,
              border: `1px solid ${color.muted}30`,
            }}
          >
            TP/SL
          </button>
        </div>
      </td>
    </tr>
  );
}
