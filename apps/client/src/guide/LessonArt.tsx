/**
 * The lessons' pictures (owner 2026-10-22: our own colours and candles, never traced from an
 * inspiration; 2026-10-24: Phosphor duotone icons, the real BTC mark, a dotted world map, and Tick or
 * Tock standing in every scene, presenting it). Most are decorative: the card's text carries the
 * meaning. Since 2026-11-17 some tell most of their card (`ART_LABELS`, lessons.ts, says what).
 *
 * Every scene is drawn in a 320 × 160 box and leaves its bottom-left corner (x < 74, y > 56) free
 * for the presenting guide.
 */

import type { JSX } from 'react';
import { Clock, HardDrives, MagnifyingGlass } from '@phosphor-icons/react';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { Guide, GuideFigure } from './art/Guide';
import { WORLD_DOTS } from './art/worldDots';
import { ART_LABELS, type LessonArtId, type Presenter, type Speaker } from './lessons';
import styles from './LessonArt.module.css';

/** The guide's face beside a line of dialogue: Tick curious, Tock calm */
export function GuideAvatar({ who }: { who: Speaker }) {
  return <GuideFigure who={who} mood={who === 'tick' ? 'smile' : 'calm'} />;
}

// ─── Small parts ─────────────────────────────────────────────────────────────

interface CandleShape {
  open: number;
  close: number;
  high: number;
  low: number;
}

/** Stylised candles (shapes for the story, not data) in a box, y grows downward */
function Candles({
  bars,
  x,
  y,
  width,
  height,
}: {
  bars: CandleShape[];
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const hi = Math.max(...bars.map((b) => b.high));
  const lo = Math.min(...bars.map((b) => b.low));
  const sy = (v: number) => y + ((hi - v) / (hi - lo)) * height;
  const step = width / bars.length;
  return (
    <g>
      {bars.map((b, i) => {
        const cx = x + step * i + step / 2;
        const up = b.close >= b.open;
        const top = sy(Math.max(b.open, b.close));
        const bottom = sy(Math.min(b.open, b.close));
        return (
          <g key={i} className={up ? styles.up : styles.down}>
            <line x1={cx} x2={cx} y1={sy(b.high)} y2={sy(b.low)} className={styles.wick} />
            <rect
              x={cx - step * 0.3}
              y={top}
              width={step * 0.6}
              height={Math.max(bottom - top, 1.5)}
              rx="1"
              className={styles.body}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Builds stylised candles from a list of closes (each opens at the previous close) */
function fromCloses(closes: number[]): CandleShape[] {
  return closes.slice(1).map((close, i) => {
    const open = closes[i];
    const pad = Math.abs(close - open) * 0.4 + 0.6;
    return { open, close, high: Math.max(open, close) + pad, low: Math.min(open, close) - pad };
  });
}

const SLIDE = fromCloses([16, 16.4, 15.2, 15.5, 14.1, 14.4, 13.4, 13.6, 12.6, 12.2]);

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text x={x} y={y} className={styles.label} textAnchor="middle">
      {children}
    </text>
  );
}

// ─── The pictures ────────────────────────────────────────────────────────────

const DUO = 'duotone' as const;

/** The real Bitcoin mark (cryptocurrency-icons, CC0) */
function BtcMark({
  x,
  y,
  size,
  className,
}: {
  x: number;
  y: number;
  size: number;
  className?: string;
}) {
  return (
    <image
      href={CRYPTO_ICON_URLS.BTC}
      x={x}
      y={y}
      width={size}
      height={size}
      className={className}
    />
  );
}

const MAP_X = 52;
const MAP_Y = 4;
const MAP_SCALE = 3.95;
const mapX = (u: number) => MAP_X + u * MAP_SCALE;
const mapY = (v: number) => MAP_Y + v * MAP_SCALE;

/** Ledger copies around the world, in map units: the Americas, Europe, Africa, Asia, Australia */
const NODES: readonly [number, number][] = [
  [13, 8],
  [23, 24],
  [35, 6],
  [37, 18],
  [49, 8],
  [46, 15],
  [58, 25],
];
const LINKS: readonly [number, number][] = [
  [0, 1],
  [0, 2],
  [2, 3],
  [2, 4],
  [4, 5],
  [3, 5],
  [5, 6],
  [1, 3],
  [4, 6],
];

function WorldLedgers() {
  return (
    <>
      <g className={styles.dots}>
        {WORLD_DOTS.map(([u, v]) => (
          <circle key={`${u}:${v}`} cx={mapX(u)} cy={mapY(v)} r="1.25" />
        ))}
      </g>
      {LINKS.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={mapX(NODES[a][0])}
          y1={mapY(NODES[a][1])}
          x2={mapX(NODES[b][0])}
          y2={mapY(NODES[b][1])}
          className={styles.network}
        />
      ))}
      {NODES.map(([u, v]) => (
        <g key={`${u}:${v}`}>
          <circle cx={mapX(u)} cy={mapY(v)} r="11" className={styles.nodeHalo} />
          <HardDrives
            weight={DUO}
            x={mapX(u) - 8}
            y={mapY(v) - 8}
            size={16}
            className={styles.white}
          />
        </g>
      ))}
    </>
  );
}

function Etf() {
  return (
    <>
      <rect x="80" y="6" width="232" height="30" rx="6" className={styles.panel} />
      <text x="196" y="26" textAnchor="middle" className={styles.headline}>
        “Spot Bitcoin funds approved”
      </text>
      <Candles bars={SLIDE} x={96} y={46} width={200} height={82} />
      <Label x={196} y={150}>
        Jan 2024: big news, then down
      </Label>
    </>
  );
}

/**
 * Lesson 2's Bitcoin card (owner 2026-11-12): the mark that ends Lesson 1 rises again, glowing, with
 * the amber ring bursting out of it; still for reduced motion
 */
function BitcoinBirth() {
  return (
    <>
      <circle cx="204" cy="72" r="54" className={styles.burst} />
      <g className={styles.rise}>
        <BtcMark x={168} y={36} size={72} className={styles.glowMark} />
      </g>
    </>
  );
}

// ─── Lesson 3 (rebuilt 2026-11-12) ───────────────────────────────────────────

/**
 * Bybit's BTCUSDT 1-minute candles, 21 Oct 2021 11:20–11:50 UTC (open, high, low, close; fetched
 * 2026-11-12): the minute Binance.US printed $8,200, the rest of the market dipped about 2%
 */
const OCT_21_2021: readonly CandleShape[] = (
  [
    [65717, 65756, 65717, 65755.5],
    [65755.5, 65766.5, 65755.5, 65766.5],
    [65766.5, 65799, 65766, 65793],
    [65793, 65900, 65792.5, 65880],
    [65880, 65880, 65879.5, 65880],
    [65880, 65940.5, 65879.5, 65922.5],
    [65922.5, 65997.5, 65922, 65997.5],
    [65997.5, 65997.5, 65997, 65997],
    [65997, 66030, 65914, 66029.5],
    [66029.5, 66048, 65998.5, 66048],
    [66048, 66048, 65972, 65972.5],
    [65972.5, 65972.5, 65889, 65943],
    [65943, 65943.5, 65884, 65884],
    [65884, 65884, 65800, 65800],
    [65800, 65815, 64200, 64279],
    [64279, 64940, 64251.5, 64731.5],
    [64731.5, 64943, 64666, 64943],
    [64943, 65320, 64923, 65199],
    [65199, 65199.5, 64952.5, 65064.5],
    [65064.5, 65236, 65064, 65235.5],
    [65235.5, 65433, 65235.5, 65432.5],
    [65432.5, 65487, 65087.5, 65249.5],
    [65249.5, 65300, 64735, 64796],
    [64796, 65039.5, 64796, 64955],
    [64955, 64972, 64856.5, 64856.5],
    [64856.5, 64880.5, 64551, 64760],
    [64760, 65000, 64753, 65000],
    [65000, 65080, 64999.5, 65020.5],
    [65020.5, 65021, 64880.5, 64899],
    [64899, 64920, 64759, 64759],
    [64759, 64873.5, 64755, 64848.5],
  ] as const
).map(([open, high, low, close]) => ({ open, high, low, close }));

/** The 11:34 candle: Binance.US's crash minute */
const CRASH_MINUTE = 14;

/**
 * Lesson 3's cold open (no photo, owner 2026-11-12): Bybit's real minute candles, barely moving, and
 * one dashed wick dropping off the frame to Binance.US's $8,200, drawn, not to scale
 */
function FlashCrash() {
  const x = 40;
  const width = 270;
  const step = width / OCT_21_2021.length;
  const crashX = x + step * CRASH_MINUTE + step / 2;
  return (
    <>
      <text x="40" y="12" className={styles.label}>
        Bybit, 1-minute candles · 21 Oct 2021
      </text>
      <text x="34" y="26" textAnchor="end" className={styles.label}>
        $66k
      </text>
      <text x="34" y="80" textAnchor="end" className={styles.label}>
        $64k
      </text>
      <Candles bars={[...OCT_21_2021]} x={x} y={22} width={width} height={56} />
      <line x1={crashX} x2={crashX} y1={80} y2={150} className={styles.crashWick} />
      <path
        d={`M${crashX - 5} 143 L${crashX} 151 L${crashX + 5} 143`}
        className={styles.crashWick}
      />
      <rect x={crashX - 160} y="112" width="150" height="34" rx="8" className={styles.panel} />
      <text x={crashX - 85} y="127" textAnchor="middle" className={styles.crashText}>
        Binance.US: $8,200
      </text>
      <text x={crashX - 85} y="140" textAnchor="middle" className={styles.label}>
        same minute, off the scale
      </text>
    </>
  );
}

/** A thin queue of buy offers, eaten from the top: each deal lower, the last far below */
function Staircase() {
  const steps = [
    { price: '$65,000', y: 14, eaten: true },
    { price: '$60,000', y: 38, eaten: true },
    { price: '$40,000', y: 62, eaten: true },
    { price: '$8,200', y: 116, eaten: false },
  ];
  return (
    <>
      <text x="196" y="10" textAnchor="middle" className={styles.label}>
        buy offers waiting
      </text>
      {steps.map((s, i) => (
        <g key={s.price}>
          <rect
            x={120 + i * 22}
            y={s.y}
            width="96"
            height="18"
            rx="4"
            className={s.eaten ? styles.eaten : styles.panel}
          />
          <text x={168 + i * 22} y={s.y + 13} textAnchor="middle" className={styles.chipText}>
            {s.price}
          </text>
        </g>
      ))}
      <path d="M220 23 L242 47 L264 71 L290 117" className={styles.crashWick} />
      <text x="150" y="104" textAnchor="middle" className={styles.label}>
        nobody waiting between
      </text>
    </>
  );
}

/**
 * "Thin or deep" (owner 2026-11-17): the same big sell order meets many buy offers packed close to
 * the price (deep: the price barely moves) and a few spread far apart (thin: the price jumps)
 */
function DeepThin() {
  const book = [
    {
      cx: 148,
      name: 'deep',
      note: 'small move',
      offers: [36, 46, 56, 66, 76, 86, 96],
      stop: 46,
    },
    { cx: 262, name: 'thin', note: 'big jump', offers: [36, 98], stop: 102 },
  ];
  return (
    <>
      <text x="205" y="10" textAnchor="middle" className={styles.label}>
        the same big sell order
      </text>
      {book.map((b) => (
        <g key={b.name}>
          <rect x={b.cx - 48} y="16" width="96" height="98" rx="6" className={styles.panel} />
          {/* The price now: the line the buyers wait under */}
          <line x1={b.cx - 40} x2={b.cx + 40} y1="28" y2="28" className={styles.priceLine} />
          <text x={b.cx - 38} y="25" className={styles.label}>
            price
          </text>
          {b.offers.map((y) => (
            <rect
              key={y}
              x={b.cx - 32}
              y={y}
              width="44"
              height="6"
              rx="2"
              className={styles.offer}
            />
          ))}
          <path d={`M${b.cx + 26} 29 L${b.cx + 26} ${b.stop}`} className={styles.crashWick} />
          {/* Neutral colours: green and red mean profit/loss and buy/sell (design.md) */}
          <text x={b.cx} y="132" textAnchor="middle" className={styles.chipText}>
            {b.name}: {b.note}
          </text>
        </g>
      ))}
      <text x="232" y="150" textAnchor="middle" className={styles.label}>
        bars: buyers waiting
      </text>
    </>
  );
}

/** One green and one red candle, open, high, low and close named, and a day-and-night mark */
function CandleAnatomy() {
  const candle = (x: number, up: boolean) => {
    const top = up ? 40 : 50;
    const bottom = up ? 104 : 96;
    return (
      <g className={up ? styles.up : styles.down}>
        <line x1={x} x2={x} y1={18} y2={128} className={styles.wick} />
        <rect x={x - 14} y={top} width="28" height={bottom - top} rx="2" className={styles.body} />
      </g>
    );
  };
  return (
    <>
      {candle(130, true)}
      <text x="150" y="22" className={styles.label}>
        high
      </text>
      <text x="150" y="44" className={styles.label}>
        close
      </text>
      <text x="150" y="104" className={styles.label}>
        open
      </text>
      <text x="150" y="130" className={styles.label}>
        low
      </text>
      {candle(240, false)}
      <text x="260" y="54" className={styles.label}>
        open
      </text>
      <text x="260" y="96" className={styles.label}>
        close
      </text>
      <Clock weight={DUO} x={286} y={4} size={26} className={styles.amber} />
      <Label x={196} y={152}>
        green: closed higher · red: closed lower
      </Label>
    </>
  );
}

/** The chart card's fallback: one long fall, then days that rose, both ways */
function Swings() {
  const bars = fromCloses([16, 16.3, 15.6, 15.9, 15.2, 14.6, 9.4, 11.2, 10.4, 9.6, 11.6, 11.2]);
  return (
    <>
      <Candles bars={bars} x={84} y={10} width={220} height={116} />
      <Label x={194} y={148}>
        May 2021: big swings, both ways
      </Label>
    </>
  );
}

/** "Check before you trust": a made-up coin under the magnifier, three checks beside it */
function CheckCoin() {
  const rows = ['Who runs it?', 'Can you sell it?', 'What does it promise?'];
  return (
    <>
      <circle cx="116" cy="54" r="30" className={styles.coin} />
      <text x="116" y="60" textAnchor="middle" className={styles.coinText}>
        ?
      </text>
      <MagnifyingGlass weight={DUO} x={118} y={40} size={52} className={styles.amber} />
      {rows.map((r, i) => (
        <g key={r}>
          <rect x="182" y={18 + i * 34} width="128" height="26" rx="6" className={styles.panel} />
          <text x="194" y={35 + i * 34} className={styles.chipText}>
            {`${i + 1}. ${r}`}
          </text>
        </g>
      ))}
    </>
  );
}

// ─── Pictures that tell the card (owner 2026-11-17) ──────────────────────────
// Drawn so the learner gets most of the card from the picture alone; our own shapes, primitives only.

type Point = readonly [number, number];

/** A chevron at the end of the segment p → q, pointing along it */
function arrowHead(p: Point, q: Point, size = 8): string {
  const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
  const wing = (turn: number) =>
    `${q[0] + size * Math.cos(angle + turn)} ${q[1] + size * Math.sin(angle + turn)}`;
  return `M${wing(Math.PI * 0.8)} L${q[0]} ${q[1]} L${wing(-Math.PI * 0.8)}`;
}

/** A line through the points with an arrowhead at its end, in the colour of its class */
function PathArrow({ points, className }: { points: readonly Point[]; className: string }) {
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return (
    <g className={className}>
      <path d={d} className={styles.stroke} />
      <path
        d={arrowHead(points[points.length - 2], points[points.length - 1])}
        className={styles.stroke}
      />
    </g>
  );
}

/** "Up or down, you can win": a price that climbs, one that slides, one that drifts sideways */
function ThreePaths() {
  const wave: readonly Point[] = [
    [-28, 30],
    [-18, 18],
    [-9, 24],
    [2, 4],
    [10, 10],
    [26, -24],
  ];
  const paths = [
    { cx: 118, name: 'climbs', result: '▲ up wins', tone: styles.up, dy: (y: number) => y },
    { cx: 196, name: 'slides', result: '▼ down wins', tone: styles.down, dy: (y: number) => -y },
    { cx: 274, name: 'sideways', result: '≈ flat', tone: styles.muted, dy: (y: number) => y / 6 },
  ];
  return (
    <>
      {paths.map((p) => (
        <g key={p.name}>
          <rect x={p.cx - 36} y="12" width="72" height="84" rx="6" className={styles.panel} />
          <PathArrow points={wave.map(([x, y]) => [p.cx + x, 54 + p.dy(y)])} className={p.tone} />
          <Label x={p.cx} y={114}>
            {p.name}
          </Label>
          <text x={p.cx} y="132" textAnchor="middle" className={`${styles.chipText} ${p.tone}`}>
            {p.result}
          </text>
        </g>
      ))}
    </>
  );
}

/** "Buy and Sell": money becomes a coin (Buy), a coin becomes money (Sell) */
function BuySellSwap() {
  return (
    <>
      <circle cx="118" cy="74" r="26" className={styles.coin} />
      <text x="118" y="83" textAnchor="middle" className={styles.coinText}>
        ₿
      </text>
      <rect x="238" y="56" width="70" height="38" rx="4" className={styles.note} />
      <text x="273" y="81" textAnchor="middle" className={`${styles.bigNumber} ${styles.white}`}>
        $
      </text>
      <PathArrow
        points={[
          [238, 58],
          [196, 40],
          [148, 60],
        ]}
        className={styles.up}
      />
      <text x="196" y="22" textAnchor="middle" className={`${styles.chipText} ${styles.up}`}>
        Buy: pay $, get coin
      </text>
      <PathArrow
        points={[
          [148, 90],
          [196, 110],
          [238, 92],
        ]}
        className={styles.down}
      />
      <text x="196" y="134" textAnchor="middle" className={`${styles.chipText} ${styles.down}`}>
        Sell: hand coin, get $
      </text>
    </>
  );
}

/** "Close it to keep it": an open result wobbles on paper; closed, it's locked in */
function CloseToKeep() {
  return (
    <>
      <Label x={130} y={16}>
        open: on paper
      </Label>
      <rect x="82" y="24" width="96" height="64" rx="6" className={styles.panel} />
      <text x="130" y="46" textAnchor="middle" className={`${styles.bigNumber} ${styles.muted}`}>
        +$120?
      </text>
      <path
        d="M90 70 L102 62 L112 74 L124 58 L136 76 L148 64 L160 72 L170 60"
        className={`${styles.stroke} ${styles.muted} ${styles.dashed}`}
      />
      <Label x={130} y={106}>
        can still shrink
      </Label>
      <text x="199" y="48" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        Close
      </text>
      <PathArrow
        points={[
          [184, 56],
          [214, 56],
        ]}
        className={styles.white}
      />
      <Label x={268} y={16}>
        closed: real
      </Label>
      <rect x="222" y="24" width="92" height="64" rx="6" className={styles.lockedPanel} />
      <text x="268" y="50" textAnchor="middle" className={`${styles.bigNumber} ${styles.up}`}>
        +$120
      </text>
      <g className={styles.amber}>
        <path d="M263 68 V63 A5 5 0 0 1 273 63 V68" className={styles.stroke} />
        <rect x="259" y="67" width="18" height="14" rx="2" className={styles.body} />
      </g>
      <Label x={268} y={106}>
        yours to keep
      </Label>
    </>
  );
}

/** "Going short": the borrowed game sold at $60, one bought back at $40, $20 kept */
function ShortGame() {
  const price: readonly Point[] = [
    [100, 30],
    [125, 44],
    [145, 38],
    [170, 58],
    [190, 52],
    [215, 74],
    [238, 68],
    [260, 90],
    [280, 96],
  ];
  return (
    <>
      <path
        d="M100 30 H304 M280 96 H304"
        className={`${styles.stroke} ${styles.muted} ${styles.guideLine}`}
      />
      <path
        d={price.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')}
        className={`${styles.stroke} ${styles.down}`}
      />
      <circle cx="100" cy="30" r="4.5" className={styles.coin} />
      <circle cx="280" cy="96" r="4.5" className={styles.coin} />
      <text x="92" y="18" className={`${styles.chipText} ${styles.white}`}>
        1. sell the borrowed game: $60
      </text>
      <text x="286" y="118" textAnchor="end" className={`${styles.chipText} ${styles.white}`}>
        2. buy one back: $40, return it
      </text>
      <path d="M298 30 H304 V96 H298" className={`${styles.stroke} ${styles.up}`} />
      <text x="258" y="52" textAnchor="middle" className={`${styles.chipText} ${styles.up}`}>
        you keep $20
      </text>
      <Label x={196} y={142}>
        win when the price falls
      </Label>
    </>
  );
}

interface BlockShape {
  title: string;
  /** What the block records ("pays 5"), and the edit that broke it */
  data: string;
  edited?: boolean;
  prev: string;
  own: string;
  /** This block's own fingerprint changed (the edit) */
  changed?: boolean;
  /** Its `prev` no longer matches the block before: it needs its work redone */
  broken?: boolean;
}

const BLOCK_X = [84, 164, 244];
const BLOCK_Y = 14;

/** Three blocks in a row, each carrying the fingerprint (hash) of the block before it */
function BlockRow({ blocks }: { blocks: readonly BlockShape[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        const x = BLOCK_X[i];
        const cx = x + 34;
        return (
          <g key={b.title}>
            <rect
              x={x}
              y={BLOCK_Y}
              width="68"
              height="96"
              rx="6"
              className={b.broken || b.changed ? styles.brokenPanel : styles.panel}
            />
            <text
              x={cx}
              y={BLOCK_Y + 16}
              textAnchor="middle"
              className={`${styles.chipText} ${styles.white}`}
            >
              {b.title}
            </text>
            <text
              x={cx}
              y={BLOCK_Y + 30}
              textAnchor="middle"
              className={`${styles.small} ${b.edited ? styles.down : styles.muted}`}
            >
              {b.data}
            </text>
            <text
              x={cx}
              y={BLOCK_Y + 43}
              textAnchor="middle"
              className={`${styles.small} ${styles.muted}`}
            >
              prev
            </text>
            <rect
              x={x + 8}
              y={BLOCK_Y + 47}
              width="52"
              height="17"
              rx="4"
              className={styles.panel}
            />
            <text
              x={cx}
              y={BLOCK_Y + 59}
              textAnchor="middle"
              className={`${styles.small} ${b.broken ? styles.down : styles.muted}`}
            >
              {b.prev}
            </text>
            <rect
              x={x + 8}
              y={BLOCK_Y + 68}
              width="52"
              height="18"
              rx="4"
              className={b.changed ? styles.hashChanged : styles.hash}
            />
            <text x={cx} y={BLOCK_Y + 81} textAnchor="middle" className={styles.hashText}>
              {b.own}
            </text>
          </g>
        );
      })}
      {blocks.slice(1).map((b, i) => {
        const from: Point = [BLOCK_X[i] + 60, BLOCK_Y + 77];
        const to: Point = [BLOCK_X[i + 1] + 8, BLOCK_Y + 55];
        const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
        return b.broken ? (
          <g key={b.title} className={styles.down}>
            <path
              d={`M${from[0]} ${from[1]} L${to[0]} ${to[1]}`}
              className={`${styles.stroke} ${styles.dashed}`}
            />
            <text x={mid[0]} y={mid[1] + 4} textAnchor="middle" className={styles.chipText}>
              ✕
            </text>
          </g>
        ) : (
          <PathArrow key={b.title} points={[from, to]} className={styles.amber} />
        );
      })}
    </>
  );
}

/** "The hash links the chain": each block carries the fingerprint of the one before */
function HashChain() {
  return (
    <>
      <BlockRow
        blocks={[
          { title: 'Block 1', data: 'pays 5', prev: 'none', own: '#k7q2' },
          { title: 'Block 2', data: 'pays 2', prev: '#k7q2', own: '#m4x9' },
          { title: 'Block 3', data: 'pays 7', prev: '#m4x9', own: '#z8p3' },
        ]}
      />
      <Label x={198} y={132}>
        # = a block’s fingerprint
      </Label>
    </>
  );
}

/** "Sealed by hard work": one old number changed, its fingerprint changes, every later block breaks */
function SealBroken() {
  return (
    <>
      <BlockRow
        blocks={[
          {
            title: 'Block 1',
            data: 'pays 5 → 9',
            edited: true,
            prev: 'none',
            own: '#r2w6',
            changed: true,
          },
          { title: 'Block 2', data: 'pays 2', prev: '#k7q2', own: '#m4x9', broken: true },
          { title: 'Block 3', data: 'pays 7', prev: '#m4x9', own: '#z8p3', broken: true },
        ]}
      />
      <text x="198" y="132" textAnchor="middle" className={`${styles.chipText} ${styles.down}`}>
        change one: redo every block after
      </text>
    </>
  );
}

/** Hours a week (0–1 of each day) a shop is open, Monday to Sunday: 9 to 6, a short Saturday */
const SHOP_HOURS: readonly (readonly [number, number] | null)[] = [
  [0.375, 0.75],
  [0.375, 0.75],
  [0.375, 0.75],
  [0.375, 0.75],
  [0.375, 0.75],
  [0.417, 0.667],
  null,
];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** "The market never sleeps": a shop's week of opening hours against crypto's, open all along */
function AlwaysOpen() {
  const dayX = (i: number) => 128 + i * 26;
  const rows = [
    { name: 'Shop', y: 38, hours: SHOP_HOURS },
    { name: 'Crypto', y: 78, hours: SHOP_HOURS.map(() => [0, 1] as const) },
  ];
  return (
    <>
      <path d="M44 10 A17 17 0 1 0 58 38 A13 13 0 1 1 44 10 Z" className={styles.coin} />
      {DAY_LETTERS.map((d, i) => (
        <Label key={i} x={dayX(i) + 11} y={28}>
          {d}
        </Label>
      ))}
      {rows.map((row) => (
        <g key={row.name}>
          <text x="82" y={row.y + 15} className={`${styles.chipText} ${styles.white}`}>
            {row.name}
          </text>
          {row.hours.map((open, i) => (
            <g key={i}>
              <rect x={dayX(i)} y={row.y} width="22" height="20" rx="3" className={styles.panel} />
              {open && (
                <rect
                  x={dayX(i)}
                  y={row.y + 20 - 20 * (open[1] - open[0]) - 20 * open[0]}
                  width="22"
                  height={20 * (open[1] - open[0])}
                  rx="3"
                  className={styles.openFill}
                />
              )}
            </g>
          ))}
        </g>
      ))}
      <Label x={217} y={124}>
        one bar = one day, 24 hours
      </Label>
      <text x="217" y="142" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        crypto: open 24/7
      </text>
    </>
  );
}

const ART: Record<LessonArtId, () => JSX.Element> = {
  ledger: WorldLedgers,
  bitcoin: BitcoinBirth,
  etf: Etf,
  flashCrash: FlashCrash,
  staircase: Staircase,
  deepThin: DeepThin,
  candleAnatomy: CandleAnatomy,
  swings: Swings,
  checkCoin: CheckCoin,
  threePaths: ThreePaths,
  buySell: BuySellSwap,
  closeToKeep: CloseToKeep,
  shortGame: ShortGame,
  alwaysOpen: AlwaysOpen,
  hashChain: HashChain,
  sealBroken: SealBroken,
};

/** A card's picture, with its presenting guide standing in the bottom-left corner */
export function LessonArt({ id, presenter }: { id: LessonArtId; presenter?: Presenter }) {
  const Picture = ART[id];
  const label = ART_LABELS[id];
  return (
    <svg
      viewBox="0 0 320 160"
      className={styles.art}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
      data-lesson-art={id}
    >
      <Picture />
      {presenter && (
        <g className={styles.presenter}>
          <Guide {...presenter} pose={presenter.pose ?? 'point'} x={0} y={56} scale={1.12} />
        </g>
      )}
    </svg>
  );
}
