/**
 * PositionEditPanel
 *
 * TV-style right-column panel for editing TP/SL exits on an open position.
 * Replaces the TradingPanel in the right slot when the user clicks the pencil
 * icon on a position's TP or SL cell in OrderAccountManagementPanel.
 *
 * BP-5 B: each leg picks the price it triggers on (Last / Mark / Index), and a new or changed leg
 * is checked against that price now — as the server does (owner decision O9, Bybit's rule) —
 * instead of against the entry price. A stop-loss beyond the liquidation price is allowed, with an
 * amber warning: the position would be liquidated before it triggers.
 */

import { useState } from 'react';
import type { PaperTriggerBy } from '@crypto-dashboard/sdk';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePaperStore } from '@/store/paperStore';
import { paneStores, getLastKnownMarkPrice, getLastKnownPrice } from '@/store/paneStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { bg, color, fontSize } from '@/lib/tokens';
import { fmtMktPrice } from '@/lib/utils';
import { Toggle } from '@/components/ui/Toggle';
import { NumericInput } from '@/components/ui/NumericInput';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { WarningText } from '@/components/ui/WarningText';
import { TriggerBySelect } from '@/components/ui/TriggerBySelect';

const SOURCE_LABEL: Record<PaperTriggerBy, string> = {
  LastPrice: 'last',
  MarkPrice: 'mark',
  IndexPrice: 'index',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface PositionEditPanelProps {
  positionId: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PositionEditPanel({ positionId, onClose }: PositionEditPanelProps) {
  const position = usePaperStore((s) => s.positions.find((p) => p.id === positionId));
  const updatePositionExits = usePaperStore((s) => s.updatePositionExits);

  // Mark price (what Bybit values a position at, BP-3), falling back to the last price
  const mp0 = useStore(paneStores[0], (s) => s.markPrice);
  const mp1 = useStore(paneStores[1], (s) => s.markPrice);
  const mp2 = useStore(paneStores[2], (s) => s.markPrice);
  const mp3 = useStore(paneStores[3], (s) => s.markPrice);
  const lp0 = useStore(paneStores[0], (s) => s.latestPrice);
  const lp1 = useStore(paneStores[1], (s) => s.latestPrice);
  const lp2 = useStore(paneStores[2], (s) => s.latestPrice);
  const lp3 = useStore(paneStores[3], (s) => s.latestPrice);
  // Positions are USDT Perpetual: only a pane showing that market prices them (spot differs)
  const paneMarkets = useLayoutStore(
    useShallow((s) => s.panes.map((p) => `${p.category}:${p.symbol}`))
  );
  const priceByMarket: Record<string, number> = {};
  const markByMarket: Record<string, number> = {};
  [lp0, lp1, lp2, lp3].forEach((lp, i) => {
    if (lp !== null) priceByMarket[paneMarkets[i]] = lp;
  });
  [mp0, mp1, mp2, mp3].forEach((mp, i) => {
    if (mp !== null) markByMarket[paneMarkets[i]] = mp;
  });
  // The live prices a leg can trigger on (index isn't streamed to the browser: the server checks it)
  const lastNow = position
    ? (priceByMarket[`linear:${position.symbol}`] ?? getLastKnownPrice(position.symbol, 'linear'))
    : null;
  const markNow = position
    ? (markByMarket[`linear:${position.symbol}`] ?? getLastKnownMarkPrice(position.symbol))
    : null;
  const markPrice = position
    ? (markByMarket[`linear:${position.symbol}`] ??
      getLastKnownMarkPrice(position.symbol) ??
      priceByMarket[`linear:${position.symbol}`] ??
      getLastKnownPrice(position.symbol, 'linear') ??
      position.entryPrice)
    : 0;

  // ── Local state ─────────────────────────────────────────────────────────────
  const [tpEnabled, setTpEnabled] = useState(() => !!position?.takeProfit);
  const [slEnabled, setSlEnabled] = useState(() => !!position?.stopLoss);
  const [tpInput, setTpInput] = useState(() =>
    position?.takeProfit ? fmtMktPrice(position.takeProfit, { useGrouping: false }) : ''
  );
  const [slInput, setSlInput] = useState(() =>
    position?.stopLoss ? fmtMktPrice(position.stopLoss, { useGrouping: false }) : ''
  );
  const [tpTriggerBy, setTpTriggerBy] = useState<PaperTriggerBy>(
    () => position?.tpTriggerBy ?? 'LastPrice'
  );
  const [slTriggerBy, setSlTriggerBy] = useState<PaperTriggerBy>(
    () => position?.slTriggerBy ?? 'LastPrice'
  );
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!position) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-2"
        style={{ background: bg.panel, color: color.muted, fontSize: fontSize.xs11 }}
      >
        <span>Position not found.</span>
        <button
          onClick={onClose}
          className="underline hover:text-white"
          style={{ fontSize: fontSize.xs11 }}
        >
          Close
        </button>
      </div>
    );
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isLong = position.side === 'long';
  const tpVal = parseFloat(tpInput) || null;
  const slVal = parseFloat(slInput) || null;

  /** The live price a leg triggers on — null when the browser doesn't have it (index) */
  const sourcePrice = (by: PaperTriggerBy): number | null =>
    by === 'LastPrice' ? lastNow : by === 'MarkPrice' ? markNow : null;

  /**
   * O9 (Bybit): a long's TP above the price it triggers on and its SL below; a short's the
   * reverse. Only a new or changed leg is checked — an untouched one may sit anywhere by now.
   */
  const sideWarning = (
    leg: 'TP' | 'SL',
    val: number | null,
    by: PaperTriggerBy,
    old: number | undefined,
    oldBy: PaperTriggerBy | undefined
  ): string | null => {
    if (val == null || (old === val && by === (oldBy ?? 'LastPrice'))) return null;
    const ref = sourcePrice(by);
    if (ref == null) return null;
    const above = isLong === (leg === 'TP');
    if (above ? val > ref : val < ref) return null;
    const name = leg === 'TP' ? 'Take Profit' : 'Stop Loss';
    return `${name} must be ${above ? 'above' : 'below'} the ${SOURCE_LABEL[by]} price ($${fmtMktPrice(ref)}) for a ${isLong ? 'long' : 'short'} position.`;
  };
  const tpWarning = tpEnabled
    ? sideWarning('TP', tpVal, tpTriggerBy, position.takeProfit, position.tpTriggerBy)
    : null;
  const slWarning = slEnabled
    ? sideWarning('SL', slVal, slTriggerBy, position.stopLoss, position.slTriggerBy)
    : null;
  // Allowed, as on Bybit — but the liquidation comes first
  const liq = position.liqPrice;
  const slPastLiquidation =
    slEnabled && slVal != null && liq != null && liq > 0 && (isLong ? slVal <= liq : slVal >= liq)
      ? `Stop Loss is beyond the liquidation price ($${fmtMktPrice(liq)}) — the position would be liquidated before it triggers.`
      : null;

  // Risk / Reward
  let rrRatio: string | null = null;
  if (tpEnabled && slEnabled && tpVal && slVal && tpVal !== slVal) {
    const reward = Math.abs(tpVal - position.entryPrice);
    const risk = Math.abs(slVal - position.entryPrice);
    if (risk > 0) rrRatio = (reward / risk).toFixed(2);
  }

  // Position info
  const tradeValue = position.entryPrice * position.quantity;
  // The open fee actually charged (stored with the position)
  const commission = position.entryFee;
  const leverage = position.leverage;
  const rewardUsd =
    tpEnabled && tpVal ? Math.abs(tpVal - position.entryPrice) * position.quantity : null;
  const riskUsd =
    slEnabled && slVal ? Math.abs(slVal - position.entryPrice) * position.quantity : null;
  const rewardPct = rewardUsd != null ? (rewardUsd / position.entryUsdtAmount) * 100 : null;
  const riskPct = riskUsd != null ? (riskUsd / position.entryUsdtAmount) * 100 : null;

  // ── Confirm guard ────────────────────────────────────────────────────────────
  // Disabled when: a direction warning is active, or a toggle is on but the
  // parsed value is missing/zero (would silently remove the leg).
  const confirmDisabled = !!(
    saving ||
    tpWarning ||
    slWarning ||
    (tpEnabled && !tpVal) ||
    (slEnabled && !slVal)
  );

  // ── Handlers ────────────────────────────────────────────────────────────────
  // The server has the final word (O9 on its own fresh prices): a refusal stays in the panel
  async function handleConfirm() {
    if (confirmDisabled) return;
    setSaving(true);
    setServerError(null);
    const err = await updatePositionExits(
      positionId,
      tpEnabled && tpVal ? tpVal : null,
      slEnabled && slVal ? slVal : null,
      { tpTriggerBy, slTriggerBy }
    );
    setSaving(false);
    if (err) setServerError(err);
    else onClose();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{
        background: bg.panel,
        borderLeft: `1px solid color-mix(in srgb, ${color.white} 6%, transparent)`,
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 flex-col gap-0.5 border-b px-3 py-2.5"
        style={{ borderColor: `color-mix(in srgb, ${color.white} 7%, transparent)` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white" style={{ fontSize: fontSize.sm }}>
              {position.symbol}
            </span>
          </div>
          <button
            onClick={onClose}
            title="Discard and close"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:text-white"
            style={{ color: color.muted }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div
          className="flex items-center gap-1.5"
          style={{ fontSize: fontSize.xs11, color: color.muted }}
        >
          {isLong ? (
            <TrendingUp className="h-3 w-3" style={{ color: color.green }} />
          ) : (
            <TrendingDown className="h-3 w-3" style={{ color: color.red }} />
          )}
          <span style={{ color: isLong ? color.green : color.red, fontWeight: 600 }}>
            {isLong ? 'Long' : 'Short'}
          </span>
          <span>{position.quantity.toFixed(6)}</span>
          <span>@</span>
          <span className="tabular-nums">${fmtMktPrice(position.entryPrice)}</span>
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-0 overflow-y-auto">
        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="shrink-0 px-3 pt-3">
          <hr style={{ borderColor: `color-mix(in srgb, ${color.white} 7%, transparent)` }} />
        </div>

        {/* ── Exits section ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 px-3 py-3">
          {/* Section heading with R/R */}
          <div className="flex items-center justify-between">
            <span
              className="font-semibold uppercase tracking-wider"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
            >
              Exits
            </span>
            {rrRatio && (
              <span style={{ fontSize: fontSize.xs10, color: color.muted }}>
                Risk / Reward <span className="font-semibold text-white/80">{rrRatio}</span>
              </span>
            )}
          </div>

          {/* ── Take Profit row ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Toggle checked={tpEnabled} onChange={setTpEnabled} label="Enable take profit" />
              <span style={{ fontSize: fontSize.xs, color: tpEnabled ? color.white : color.muted }}>
                Take profit, price
              </span>
              {tpEnabled && (
                <span className="ml-auto">
                  <TriggerBySelect
                    value={tpTriggerBy}
                    onChange={setTpTriggerBy}
                    ariaLabel="Take profit trigger price"
                  />
                </span>
              )}
            </div>
            {tpEnabled && (
              <NumericInput
                suffix="TP"
                suffixColor={`${color.green}b3`}
                borderColor={tpWarning ? color.red : `${color.green}60`}
                suffixPadding="pr-12"
                step={0.01}
                min={0}
                value={tpInput}
                onChange={(e) => setTpInput(e.target.value)}
              />
            )}
            {tpWarning && <WarningText>{tpWarning}</WarningText>}
          </div>

          {/* ── Stop Loss row ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Toggle checked={slEnabled} onChange={setSlEnabled} label="Enable stop loss" />
              <span style={{ fontSize: fontSize.xs, color: slEnabled ? color.white : color.muted }}>
                Stop loss, price
              </span>
              {slEnabled && (
                <span className="ml-auto">
                  <TriggerBySelect
                    value={slTriggerBy}
                    onChange={setSlTriggerBy}
                    ariaLabel="Stop loss trigger price"
                  />
                </span>
              )}
            </div>
            {slEnabled && (
              <NumericInput
                suffix="SL"
                suffixColor={`${color.red}b3`}
                borderColor={slWarning ? color.red : `${color.red}60`}
                suffixPadding="pr-12"
                step={0.01}
                min={0}
                value={slInput}
                onChange={(e) => setSlInput(e.target.value)}
              />
            )}
            {slWarning && <WarningText>{slWarning}</WarningText>}
            {!slWarning && slPastLiquidation && <WarningText>{slPastLiquidation}</WarningText>}
          </div>
          {serverError && (
            <p role="alert" style={{ fontSize: fontSize.xs10, color: color.red }}>
              {serverError}
            </p>
          )}
        </div>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="px-3">
          <hr style={{ borderColor: `color-mix(in srgb, ${color.white} 7%, transparent)` }} />
        </div>

        {/* ── Position info ─────────────────────────────────────────────── */}
        <div
          className="mx-3 my-3 rounded-md border border-white/6 p-2.5"
          style={{ background: bg.page }}
        >
          <FieldLabel as="p" className="mb-2">
            Position info
          </FieldLabel>
          {(
            [
              { label: 'Leverage', value: `1:${leverage}` },
              { label: 'Mark price', value: `$${fmtMktPrice(markPrice)} USD` },
              { label: 'Trade value', value: `${tradeValue.toFixed(2)} USD` },
              { label: 'Commission', value: `$${commission.toFixed(4)} USD` },
              ...(rewardUsd != null && rewardPct != null
                ? [
                    {
                      label: 'Reward',
                      value: `${rewardPct.toFixed(2)}% / ${rewardUsd.toFixed(2)} USD`,
                      col: color.green,
                    },
                  ]
                : []),
              ...(riskUsd != null && riskPct != null
                ? [
                    {
                      label: 'Risk',
                      value: `${riskPct.toFixed(2)}% / ${riskUsd.toFixed(2)} USD`,
                      col: color.red,
                    },
                  ]
                : []),
            ] as { label: string; value: string; col?: string }[]
          ).map(({ label, value, col }) => (
            <div key={label} className="flex items-center justify-between py-0.5">
              <span style={{ fontSize: fontSize.xs10, color: color.muted }}>{label}</span>
              <span
                className="tabular-nums"
                style={{ fontSize: fontSize.xs10, color: col ?? color.white }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer: Confirm / Discard ─────────────────────────────────────── */}
      <div
        className="flex shrink-0 flex-col gap-2 border-t px-3 py-3"
        style={{ borderColor: `color-mix(in srgb, ${color.white} 7%, transparent)` }}
      >
        <motion.button
          onClick={() => void handleConfirm()}
          disabled={confirmDisabled}
          whileTap={!confirmDisabled ? { scale: 0.97 } : {}}
          className="w-full rounded py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: `color-mix(in srgb, ${color.purpleDark} 85%, transparent)`,
            fontSize: fontSize.xs,
          }}
        >
          Confirm
        </motion.button>
        <motion.button
          onClick={onClose}
          whileTap={{ scale: 0.97 }}
          className="w-full rounded py-2 text-sm font-semibold transition-colors hover:text-white"
          style={{
            background: `color-mix(in srgb, ${color.white} 5%, transparent)`,
            color: color.muted,
            fontSize: fontSize.xs,
            border: `1px solid color-mix(in srgb, ${color.white} 8%, transparent)`,
          }}
        >
          Discard
        </motion.button>
      </div>
    </div>
  );
}
