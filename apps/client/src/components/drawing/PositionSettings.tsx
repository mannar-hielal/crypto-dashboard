/**
 * The Long / Short Position settings (TradingView's risk / reward Inputs and its Style extras), for
 * DrawingSettingsDialog. They edit the dialog's draft: the account, the risk, the entry, the leverage,
 * the target and stop as ticks or a price, the qty decimals; the stop and target colours, the text,
 * which stats the labels show. Ticks count the chart's price step (the symbol's tick), as the
 * drawing's labels do.
 * Left out as irrelevant here: TradingView's account currency (always USDT) and lot size (a USDT
 * contract is one coin).
 */

import {
  POSITION_STATS,
  factoryStyleFor,
  levelFromPrice,
  positionLevels,
  positionStatOn,
  type Drawing,
  type DrawingStyle,
} from 'lightweight-charts-drawing';
import { FONT_SIZES } from '@/lib/drawingCapabilities';
import { stepDecimals } from '@/lib/priceFormat';
import { ColorField, NumberField } from './SettingsFields';
import styles from './DrawingSettingsDialog.module.css';

/** TradingView's factory values, for drawings saved without them */
const FACTORY = { accountSize: 1000, risk: 25, leverage: 10000 } as const;
const QTY_PRECISIONS = ['default', '0', '1', '2', '3', '4', '5', '6', '7', '8'] as const;

const positive = (n: number) => n > 0;
const wholeTicks = (n: number) => n >= 1 && Number.isInteger(n);
/** Money and percents at 2 decimals */
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Inputs tab ─────────────────────────────────────────────────────────────

interface PositionInputsProps {
  draft: Drawing;
  /** The chart's price step: what a tick is */
  pip: number;
  setStyle: (patch: Partial<DrawingStyle>) => void;
  setEntry: (price: number) => void;
}

export function PositionInputs({ draft, pip, setStyle, setEntry }: PositionInputsProps) {
  const s = draft.style;
  const side = draft.kind === 'long-position' ? 1 : -1;
  const entry = draft.points[0]?.price ?? 0;
  const { stop, profit } = positionLevels(draft, pip);
  const decimals = stepDecimals(pip);
  const onStep = (v: number) => Number(v.toFixed(decimals));
  const account = s.accountSize ?? FACTORY.accountSize;
  const money = s.riskDisplayMode === 'money';
  const percent = s.riskPercent ?? FACTORY.risk;
  const amount = s.riskAmount ?? round2((account * percent) / 100);

  function levelRows(leg: 'profit' | 'stop', level: number, title: string) {
    const key = leg === 'profit' ? 'profitLevel' : 'stopLevel';
    // The target is on the trade's side of the entry, the stop on the other
    const price = onStep(entry + (leg === 'profit' ? side : -side) * level);
    return (
      <fieldset className={styles.group}>
        <legend className={styles.section}>{title}</legend>
        <div className={styles.row}>
          <span className={styles.label}>Ticks</span>
          <NumberField
            label={`${title} ticks`}
            value={Math.round(level / pip)}
            valid={wholeTicks}
            onChange={(ticks) => setStyle({ [key]: onStep(ticks * pip) })}
          />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Price</span>
          <NumberField
            label={`${title} price`}
            value={price}
            valid={positive}
            onChange={(p) => setStyle({ [key]: levelFromPrice(p, entry, pip, side, leg) })}
          />
        </div>
      </fieldset>
    );
  }

  return (
    <>
      <div className={styles.row}>
        <span className={styles.label}>Account size</span>
        <NumberField
          label="Account size"
          value={account}
          valid={positive}
          onChange={(accountSize) => setStyle({ accountSize })}
        />
        <span className={styles.time}>USDT</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Risk</span>
        <NumberField
          label="Risk"
          value={money ? amount : percent}
          valid={positive}
          onChange={(v) => setStyle(money ? { riskAmount: v } : { riskPercent: v })}
        />
        <select
          aria-label="Risk unit"
          className={styles.select}
          value={money ? 'money' : 'percents'}
          onChange={(e) =>
            // The same risk in the other unit
            setStyle(
              e.target.value === 'money'
                ? { riskDisplayMode: 'money', riskAmount: amount }
                : {
                    riskDisplayMode: 'percents',
                    riskPercent: round2((Math.min(amount, account) / account) * 100),
                  }
            )
          }
        >
          <option value="percents">%</option>
          <option value="money">USDT</option>
        </select>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Entry price</span>
        {/* Shown on the price step: a drawn entry is wherever the pointer was */}
        <NumberField
          label="Entry price"
          value={onStep(entry)}
          valid={positive}
          onChange={setEntry}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Leverage</span>
        <NumberField
          label="Leverage"
          value={s.leverage ?? FACTORY.leverage}
          valid={positive}
          onChange={(leverage) => setStyle({ leverage })}
        />
      </div>
      {levelRows('profit', profit, 'Profit level')}
      {levelRows('stop', stop, 'Stop level')}
      <div className={styles.row}>
        <span className={styles.label}>Qty precision</span>
        <select
          aria-label="Qty precision"
          className={styles.select}
          value={s.qtyPrecision ?? 'default'}
          onChange={(e) => setStyle({ qtyPrecision: e.target.value })}
        >
          {QTY_PRECISIONS.map((p) => (
            <option key={p} value={p}>
              {p === 'default' ? 'Whole units' : `${p} decimals`}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

// ─── Style tab extras ───────────────────────────────────────────────────────

interface PositionStyleProps {
  style: DrawingStyle;
  setStyle: (patch: Partial<DrawingStyle>) => void;
}

/** Stop and target colours, and the label text — after the Line row */
export function PositionColors({ style: s, setStyle }: PositionStyleProps) {
  // TradingView's position colours, for a drawing saved without them
  const f = factoryStyleFor('long-position');
  return (
    <>
      <div className={styles.row}>
        <span className={styles.label}>Stop</span>
        <ColorField
          label="Stop colour"
          value={s.stopColor ?? f.stopColor ?? s.color}
          opacity={100 - (s.stopTransparency ?? 80)}
          onChange={(stopColor) => setStyle({ stopColor })}
          onOpacityChange={(o) => setStyle({ stopTransparency: 100 - o })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Target</span>
        <ColorField
          label="Target colour"
          value={s.targetColor ?? f.targetColor ?? s.color}
          opacity={100 - (s.targetTransparency ?? 80)}
          onChange={(targetColor) => setStyle({ targetColor })}
          onOpacityChange={(o) => setStyle({ targetTransparency: 100 - o })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Text</span>
        <ColorField
          label="Text colour"
          value={s.textColor ?? f.textColor ?? s.color}
          onChange={(textColor) => setStyle({ textColor })}
        />
        <select
          aria-label="Font size"
          className={styles.select}
          value={s.fontSize ?? 12}
          onChange={(e) => setStyle({ fontSize: Number(e.target.value) })}
        >
          {FONT_SIZES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

/** Which stats the labels show, compact mode, and showing them without a hover */
export function PositionInfo({ style: s, setStyle }: PositionStyleProps) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.section}>Info</legend>
      <div className={styles.stats} role="group" aria-label="Stats">
        {POSITION_STATS.map(([key, title]) => (
          <label key={key} className={styles.check}>
            <input
              type="checkbox"
              checked={positionStatOn(s, key)}
              onChange={(e) =>
                setStyle({ positionStats: { ...s.positionStats, [key]: e.target.checked } })
              }
            />
            {title}
          </label>
        ))}
      </div>
      <div className={styles.row}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={!!s.compactStats}
            onChange={(e) => setStyle({ compactStats: e.target.checked })}
          />
          Compact stats mode
        </label>
      </div>
      <div className={styles.row}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={!!s.showStats}
            onChange={(e) => setStyle({ showStats: e.target.checked })}
          />
          Always show stats
        </label>
      </div>
    </fieldset>
  );
}
