/**
 * Closed P&L tab (APP_LOG Bybit Parity BP-5 D) — Bybit's closed-position list for USDT Perpetual:
 * one row per close (a partial close, a flip's closing part or a liquidation step), newest first.
 * Closed P&L is Bybit's `closedPnl` = PnL − open fee − close fee − funding; hovering it shows the
 * three deductions.
 */

import { usePaperStore, type ClosedTrade } from '@/store/paperStore';
import { color, fontSize } from '@/lib/tokens';
import { fmtMktPrice } from '@/lib/utils';
import { closedPnlBreakdown, closedPnlOf } from '@/lib/positionMath';
import { guide } from '@/lib/guideAnchors';
import styles from './ClosedPnlTable.module.css';
import { fmtSigned } from '@/lib/format';

const COLUMNS = [
  { id: 'symbol', label: 'Symbol', num: false },
  { id: 'side', label: 'Side', num: false },
  { id: 'qty', label: 'Closed Qty', num: true },
  { id: 'entry', label: 'Entry Price', num: true },
  { id: 'exit', label: 'Exit Price', num: true },
  { id: 'pnl', label: 'Closed P&L', num: true },
  { id: 'type', label: 'Exit Type', num: false },
  { id: 'time', label: 'Time', num: true },
] as const;

const fmtQty = (n: number) => parseFloat(n.toFixed(6)).toString();
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function ClosedPnlTable() {
  const history = usePaperStore((s) => s.history);
  const rows = history.filter((t) => t.category === 'linear');

  if (rows.length === 0) {
    return (
      <div className={styles.empty} style={{ fontSize: fontSize.xs11, color: color.muted }}>
        No closed positions yet
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table} style={{ fontSize: fontSize.xs11 }}>
        <thead>
          <tr className={styles.head} style={{ fontSize: fontSize.xs10, color: color.muted }}>
            {COLUMNS.map((c) => (
              <th key={c.id} className={c.num ? styles.num : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <ClosedPnlRow key={t.id} trade={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClosedPnlRow({ trade: t }: { trade: ClosedTrade }) {
  const pnl = closedPnlOf(t);
  const pnlColor = pnl > 0 ? color.green : pnl < 0 ? color.red : color.muted;
  const isLong = t.side === 'long';
  return (
    <tr className={styles.row} data-testid="closed-pnl-row" {...guide('closed-pnl.row', t.id)}>
      <td style={{ color: color.white }}>{t.symbol}</td>
      <td style={{ color: isLong ? color.green : color.red }}>{isLong ? '▲ Long' : '▼ Short'}</td>
      <td className={styles.num} style={{ color: color.muted }}>
        {fmtQty(t.quantity)}
      </td>
      <td className={styles.num} style={{ color: color.muted }}>
        {fmtMktPrice(t.entryPrice)}
      </td>
      <td className={styles.num} style={{ color: color.muted }}>
        {fmtMktPrice(t.exitPrice)}
      </td>
      <td
        className={`${styles.num} ${styles.pnl}`}
        style={{ color: pnlColor }}
        title={closedPnlBreakdown(t)}
        data-testid="closed-pnl-value"
        {...guide('closed-pnl.value')}
      >
        {fmtSigned(pnl, 4)} USDT
      </td>
      <td
        style={{ color: t.liquidated ? color.amber : color.muted }}
        {...guide('closed-pnl.exit-type')}
      >
        {t.liquidated ? 'Liquidation' : 'Trade'}
      </td>
      <td className={styles.num} style={{ fontSize: fontSize.xs10, color: color.muted }}>
        {fmtTime(t.closedAt)}
      </td>
    </tr>
  );
}
