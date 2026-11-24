/**
 * The lessons' pictures (owner 2026-10-22: our own colours and candles, never traced from an
 * inspiration; 2026-10-24: Phosphor duotone icons, the real BTC mark, a dotted world map, and Tick or
 * Tock standing in every scene, presenting it). Most are decorative: the card's text carries the
 * meaning. Since 2026-11-17 some tell most of their card (`ART_LABELS`, lessons.ts, says what).
 *
 * Every scene is drawn in a 320 × 160 box and leaves its bottom-left corner (x < 74, y > 56) free
 * for the presenting guide.
 */

import { useLayoutEffect, useRef, useState, type JSX } from 'react';
import {
  ArrowsLeftRight,
  Bank,
  Bus,
  Camera,
  Certificate,
  ChartLineUp,
  ChartPieSlice,
  Clock,
  Cloud,
  Coins,
  Compass,
  Cube,
  Detective,
  DeviceMobile,
  EnvelopeSimple,
  Eye,
  GameController,
  Gear,
  HandPalm,
  Handbag,
  HardDrives,
  Key,
  Leaf,
  ListChecks,
  Lock,
  LockKey,
  MagnifyingGlass,
  Mailbox,
  Money,
  Newspaper,
  Note,
  Notebook,
  Package,
  PencilSimple,
  Prohibit,
  RoadHorizon,
  Stack,
  Storefront,
  Swap,
  Ticket,
  Tray,
  Usb,
  UsersThree,
  Vault,
  Wallet,
  Warning,
  Waves,
  WifiHigh,
} from '@phosphor-icons/react';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import lenaUrl from '@/assets/illustrations/open-peeps/lena.svg';
import zoeUrl from '@/assets/illustrations/open-peeps/zoe.svg';
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

/** A real coin logo (the cryptocurrency-icons set, CC0) at its top-left corner, `size` wide (owner 2026-11-20) */
function CoinLogo({
  symbol,
  x,
  y,
  size,
}: {
  symbol: keyof typeof CRYPTO_ICON_URLS;
  x: number;
  y: number;
  size: number;
}) {
  return <image href={CRYPTO_ICON_URLS[symbol]} x={x} y={y} width={size} height={size} />;
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
          <path d={`M${b.cx + 26} 29 L${b.cx + 26} ${b.stop}`} className={styles.moveLine} />
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

// ─── Lesson 4's friends: Open Peeps (CC0), recoloured; each has an accent halo from tokens ──
// (assets/illustrations/open-peeps/README.md). The figure is 240 × 324, shown at height 150.

function Friend({ url, x, halo }: { url: string; x: number; halo: string }) {
  return (
    <g>
      <circle cx={x + 52} cy={86} r={60} className={halo} />
      <image href={url} x={x} y={6} width={104} height={150} />
    </g>
  );
}

function Friends() {
  return (
    <g>
      <Friend url={lenaUrl} x={84} halo={styles.haloGreen} />
      <Friend url={zoeUrl} x={206} halo={styles.haloAmber} />
    </g>
  );
}

function LenaAlone() {
  return <Friend url={lenaUrl} x={108} halo={styles.haloGreen} />;
}

function ZoeAlone() {
  return <Friend url={zoeUrl} x={108} halo={styles.haloAmber} />;
}

// ─── Chapter 2, Lesson 5: coins and tokens (owner's visual Q&A 2026-11-19) ────────────────────────
// The road metaphor, drawn flat from our tokens: a coin has its own road; a token is a shop built
// along someone else's. Phosphor duotone icons for the token jobs; plain ticker badges, never a
// project's logo.

/** A flat road across the scene: a dark band with a dashed middle line */
function Road({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g>
      <rect x={x1} y={y - 9} width={x2 - x1} height="18" rx="3" className={styles.road} />
      <line
        x1={x1 + 6}
        x2={x2 - 6}
        y1={y}
        y2={y}
        className={`${styles.roadLine} ${styles.muted}`}
      />
    </g>
  );
}

/** Lesson 5's cold open: two roads, one all its own and one that a token shares */
function TwoRoads() {
  return (
    <>
      <Road x1={84} x2={312} y={44} />
      <circle cx="244" cy="44" r="16" className={styles.coin} />
      <text x="244" y="48" textAnchor="middle" className={styles.hashText}>
        coin
      </text>
      <text x="198" y="22" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        Its own road
      </text>
      <Road x1={84} x2={312} y={112} />
      <Storefront weight={DUO} x={226} y={70} size={34} className={styles.amber} />
      <text x="198" y="146" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        Someone else’s road
      </text>
    </>
  );
}

/** A coin on its own road, with the signpost naming the blockchain */
function CoinRoad() {
  return (
    <>
      <Road x1={84} x2={312} y={108} />
      <circle cx="196" cy="108" r="16" className={styles.coin} />
      <text x="196" y="112" textAnchor="middle" className={styles.hashText}>
        coin
      </text>
      <line x1="270" x2="270" y1="52" y2="99" className={`${styles.stroke} ${styles.muted}`} />
      <rect x="226" y="30" width="90" height="26" rx="6" className={styles.panel} />
      <text x="271" y="47" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        Its blockchain
      </text>
    </>
  );
}

/** The road's upkeep: a coin pays at the toll booth, and the people who keep the road running are paid */
function TollBooth() {
  return (
    <>
      <Road x1={84} x2={312} y={108} />
      <rect x="170" y="52" width="56" height="48" rx="4" className={styles.panel} />
      <text x="198" y="82" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        Fee
      </text>
      <circle cx="128" cy="108" r="11" className={styles.coin} />
      <PathArrow
        points={[
          [142, 104],
          [158, 90],
          [168, 84],
        ]}
        className={styles.amber}
      />
      <circle cx="270" cy="108" r="11" className={styles.coin} />
      <PathArrow
        points={[
          [226, 80],
          [246, 90],
          [260, 100],
        ]}
        className={styles.up}
      />
      <text x="268" y="76" textAnchor="middle" className={`${styles.small} ${styles.up}`}>
        paid in the coin
      </text>
    </>
  );
}

const COIN_BADGES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOGE'] as const;

/** The eight coins of our market as real logos with their tickers, and LINK set apart in an amber ring: a token */
function TickerBadges() {
  const LOGO = 30;
  return (
    <>
      {COIN_BADGES.map((t, i) => {
        const cx = 108 + (i % 4) * 52;
        const top = 4 + Math.floor(i / 4) * 48;
        return (
          <g key={t}>
            <CoinLogo symbol={t} x={cx - LOGO / 2} y={top} size={LOGO} />
            <text x={cx} y={top + LOGO + 12} textAnchor="middle" className={styles.badgeText}>
              {t}
            </text>
          </g>
        );
      })}
      <circle cx="160" cy="116" r="19" className={styles.tokenRing} />
      <CoinLogo symbol="LINK" x={160 - LOGO / 2} y={116 - LOGO / 2} size={LOGO} />
      <text x="160" y="152" textAnchor="middle" className={styles.badgeText}>
        LINK
      </text>
      <text x="236" y="120" textAnchor="middle" className={`${styles.small} ${styles.amber}`}>
        a token
      </text>
    </>
  );
}

/** A token: a shop built along someone else's road, with its own house rules on the door */
function ShopRoad() {
  return (
    <>
      <Road x1={84} x2={312} y={118} />
      <Storefront weight={DUO} x={176} y={44} size={56} className={styles.amber} />
      <text x="204" y="36" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        Token
      </text>
      <rect x="244" y="62" width="68" height="38" rx="6" className={styles.panel} />
      <text x="278" y="78" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        its house
      </text>
      <text x="278" y="92" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        rules
      </text>
    </>
  );
}

/** Utility: credits you spend inside one app */
function ArcadeCredits() {
  return (
    <>
      <GameController weight={DUO} x={110} y={40} size={72} className={styles.amber} />
      <Ticket weight={DUO} x={214} y={50} size={58} className={styles.white} />
      <text x="243" y="132" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        credits
      </text>
    </>
  );
}

/** Security: a share in something real */
function ShareCertificate() {
  return (
    <>
      <Certificate weight={DUO} x={134} y={30} size={90} className={styles.amber} />
      <text x="190" y="140" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        a share
      </text>
    </>
  );
}

/** Governance: a vote on how the project changes */
function BallotBox() {
  return (
    <>
      <rect x="136" y="84" width="110" height="52" rx="8" className={styles.panel} />
      <rect x="164" y="78" width="54" height="8" rx="3" className={styles.road} />
      <ListChecks weight={DUO} x={166} y={14} size={50} className={styles.up} />
      <text x="191" y="116" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        your vote
      </text>
    </>
  );
}

/** Altcoins: a calm line and a stormy one */
function CalmStormy() {
  return (
    <>
      <polyline
        points="96,52 130,50 164,54 198,51 232,53 266,50 300,52"
        className={`${styles.stroke} ${styles.up}`}
      />
      <text x="198" y="34" textAnchor="middle" className={`${styles.small} ${styles.up}`}>
        steady
      </text>
      <polyline
        points="96,122 116,96 136,134 158,92 182,138 206,98 232,142 258,94 284,130 300,104"
        className={`${styles.stroke} ${styles.down}`}
      />
      <text x="198" y="86" textAnchor="middle" className={`${styles.small} ${styles.down}`}>
        swings
      </text>
    </>
  );
}

/** A shiny coin promising a lot, with a stop sign: slow down and check */
function StopCoin() {
  return (
    <>
      <Coins weight={DUO} x={104} y={44} size={78} className={styles.amber} />
      <HandPalm weight={DUO} x={206} y={32} size={86} className={styles.down} />
    </>
  );
}

// ─── Chapter 2, Lesson 6: stablecoins (owner's visual Q&A 2026-11-19) ─────────────────────────────
// The cloakroom ticket: hand in a dollar, get a ticket. One flat counter, a different vault behind
// it for each kind of stablecoin. The de-peg is drawn, never a real chart (a stablecoin priced in
// another stablecoin would confuse a beginner).

/** The cold open: a coin that swings beside one that sits still */
function WobbleSteady() {
  return (
    <>
      <polyline
        points="96,96 112,60 128,112 144,54 160,118 176,70 192,104"
        className={`${styles.stroke} ${styles.down}`}
      />
      <text x="144" y="142" textAnchor="middle" className={`${styles.small} ${styles.down}`}>
        my coin
      </text>
      <polyline
        points="226,82 246,80 266,83 286,81 306,82"
        className={`${styles.stroke} ${styles.up}`}
      />
      <text x="266" y="142" textAnchor="middle" className={`${styles.small} ${styles.up}`}>
        built to sit still
      </text>
    </>
  );
}

/** A stablecoin's line stays on the $1.00 guide */
function SteadyPeg() {
  return (
    <>
      <line
        x1="96"
        x2="304"
        y1="76"
        y2="76"
        className={`${styles.stroke} ${styles.muted} ${styles.dashed} ${styles.guideLine}`}
      />
      <text x="106" y="64" className={`${styles.chipText} ${styles.white}`}>
        $1.00
      </text>
      <polyline
        points="96,77 128,75 160,78 192,76 224,77 256,75 304,77"
        className={`${styles.stroke} ${styles.up}`}
      />
      <text x="200" y="118" textAnchor="middle" className={`${styles.small} ${styles.up}`}>
        stays on its line
      </text>
    </>
  );
}

/** Hand in a dollar, get a ticket */
function Cloakroom() {
  return (
    <>
      <Money weight={DUO} x={102} y={36} size={44} className={styles.up} />
      <text x="124" y="30" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        $1 in
      </text>
      <PathArrow
        points={[
          [152, 58],
          [182, 58],
        ]}
        className={styles.muted}
      />
      <Ticket weight={DUO} x={190} y={36} size={44} className={styles.white} />
      <text x="212" y="30" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        ticket out
      </text>
      <rect x="96" y="104" width="136" height="32" rx="5" className={styles.panel} />
      <rect x="92" y="98" width="144" height="8" rx="3" className={styles.road} />
      <text x="164" y="125" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        cloakroom
      </text>
    </>
  );
}

/** The same counter for the three kinds; the vault behind it is what changes */
function CounterAndVault({ kind }: { kind: 'dollar' | 'crypto' | 'rule' }) {
  return (
    <>
      <Ticket weight={DUO} x={122} y={46} size={38} className={styles.white} />
      <rect x="96" y="98" width="84" height="38" rx="5" className={styles.panel} />
      <rect x="92" y="92" width="92" height="8" rx="3" className={styles.road} />
      <text x="138" y="122" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        counter
      </text>
      <PathArrow
        points={[
          [188, 106],
          [212, 106],
        ]}
        className={styles.muted}
      />
      <rect x="216" y="32" width="92" height="106" rx="8" className={styles.panel} />
      {kind === 'dollar' && (
        <>
          <Money weight={DUO} x={240} y={44} size={44} className={styles.up} />
          <Money weight={DUO} x={240} y={88} size={44} className={styles.up} />
        </>
      )}
      {kind === 'crypto' && (
        <>
          <Coins weight={DUO} x={236} y={42} size={52} className={styles.amber} />
          <Coins weight={DUO} x={236} y={86} size={52} className={styles.amber} />
        </>
      )}
      {kind === 'rule' && (
        <>
          <line
            x1="228"
            x2="296"
            y1="104"
            y2="104"
            className={`${styles.stroke} ${styles.muted} ${styles.dashed}`}
          />
          <Note weight={DUO} x={240} y={48} size={44} className={styles.muted} />
        </>
      )}
      <text x="262" y="152" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        {kind === 'dollar' ? 'real money' : kind === 'crypto' ? 'extra crypto' : 'just a rule'}
      </text>
    </>
  );
}

const VaultDollar = () => <CounterAndVault kind="dollar" />;
const VaultCrypto = () => <CounterAndVault kind="crypto" />;
const VaultRule = () => <CounterAndVault kind="rule" />;

/** Not every vault is full, and someone should check */
function VaultCheck() {
  return (
    <>
      <Vault weight={DUO} x={112} y={34} size={84} className={styles.amber} />
      <MagnifyingGlass weight={DUO} x={190} y={62} size={62} className={styles.white} />
      <text x="204" y="142" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        who checks?
      </text>
    </>
  );
}

/** Our market is priced in USDT: the pair tag with USDT lit up */
function UsdtPair() {
  return (
    <>
      <rect x="104" y="46" width="188" height="52" rx="26" className={styles.panel} />
      <CoinLogo symbol="BTC" x={112} y={58} size={28} />
      <text x="164" y="78" textAnchor="middle" className={styles.bigNumber}>
        BTC
      </text>
      <text x="196" y="78" textAnchor="middle" className={`${styles.bigNumber} ${styles.muted}`}>
        /
      </text>
      <rect x="208" y="52" width="78" height="40" rx="20" className={styles.badge} />
      <CoinLogo symbol="USDT" x={213} y={58} size={28} />
      <text x="258" y="77" textAnchor="middle" className={styles.badgeText}>
        USDT
      </text>
      <text x="247" y="38" textAnchor="middle" className={`${styles.small} ${styles.amber}`}>
        priced in
      </text>
      <text x="198" y="128" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        1 BTC costs … USDT
      </text>
    </>
  );
}

/** Parking a profit: the coin is sold, a steady coin arrives */
function ParkProfit() {
  return (
    <>
      <circle cx="132" cy="74" r="22" className={styles.coin} />
      <text x="132" y="78" textAnchor="middle" className={styles.hashText}>
        coin
      </text>
      <text x="132" y="116" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        now $300
      </text>
      <PathArrow
        points={[
          [162, 74],
          [200, 74],
        ]}
        className={styles.amber}
      />
      <text x="181" y="64" textAnchor="middle" className={`${styles.small} ${styles.amber}`}>
        sell
      </text>
      <CoinLogo symbol="USDT" x={220} y={50} size={48} />
      <text x="244" y="116" textAnchor="middle" className={`${styles.small} ${styles.up}`}>
        300 USDT, steady
      </text>
    </>
  );
}

/** A drawn dip below the peg and the way back: an example, not a real chart */
function PegDip() {
  return (
    <>
      <line
        x1="96"
        x2="304"
        y1="46"
        y2="46"
        className={`${styles.stroke} ${styles.muted} ${styles.dashed} ${styles.guideLine}`}
      />
      <text x="104" y="38" className={`${styles.chipText} ${styles.white}`}>
        $1.00 peg
      </text>
      <polyline
        points="96,47 164,47 190,112 206,118 232,70 262,48 304,47"
        className={`${styles.stroke} ${styles.down}`}
      />
      <text x="206" y="138" textAnchor="middle" className={`${styles.small} ${styles.down}`}>
        about $0.87
      </text>
      <text x="290" y="150" textAnchor="end" className={`${styles.small} ${styles.muted}`}>
        drawn example
      </text>
    </>
  );
}

/** A reward that looks too good, on a ticket */
function TooSweet() {
  return (
    <>
      <Ticket weight={DUO} x={98} y={44} size={80} className={styles.white} />
      <rect x="190" y="56" width="112" height="40" rx="8" className={styles.panel} />
      <text x="246" y="82" textAnchor="middle" className={`${styles.chipText} ${styles.amber}`}>
        +20% a year
      </text>
      <text x="246" y="122" textAnchor="middle" className={`${styles.small} ${styles.down}`}>
        too good to be true?
      </text>
    </>
  );
}

// ─── Chapter 2, Lesson 7 (owner's visual Q&A 2026-11-22): wallets, keys and who holds them ───
// One metaphor: the mailbox and its key (Lesson 2). Flat shapes, no faces for Mira and Sam; hot is
// amber with signal bars and an "online" tag, cold is purple with a padlock and an "offline" tag
// (the tags carry the meaning, never colour alone). The hardware wallet is generic, with no maker's
// shape, name or logo: no licence covers a real one (owner 2026-11-22).

/** A small rounded tag: "online", "offline", "hot", "cold" */
function Tag({
  x,
  y,
  w,
  cool,
  children,
}: {
  x: number;
  y: number;
  w: number;
  cool?: boolean;
  children: string;
}) {
  return (
    <>
      <rect
        x={x}
        y={y}
        width={w}
        height="18"
        rx="9"
        className={cool ? styles.coolFill : styles.amberFill}
      />
      <text
        x={x + w / 2}
        y={y + 13}
        textAnchor="middle"
        className={cool ? styles.badgeText : styles.tagText}
      >
        {children}
      </text>
    </>
  );
}

/** The cold open: a wall of mailboxes and one key */
function MailboxWall() {
  return (
    <>
      <Mailbox weight={DUO} x={100} y={64} size={44} className={styles.muted} />
      <Mailbox weight={DUO} x={156} y={64} size={44} className={styles.white} />
      <Mailbox weight={DUO} x={212} y={64} size={44} className={styles.muted} />
      <Key weight={DUO} x={160} y={14} size={40} className={styles.amber} />
      <text x="178" y="130" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        one key opens one mailbox
      </text>
    </>
  );
}

/** A wallet is a key ring: the mailboxes stay in the building */
function KeyRing() {
  return (
    <>
      <circle cx="122" cy="62" r="22" className={`${styles.stroke} ${styles.amber}`} />
      <Key weight={DUO} x={100} y={44} size={36} className={styles.amber} />
      <Key weight={DUO} x={120} y={64} size={30} className={styles.amber} />
      <text x="122" y="30" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        wallet = key ring
      </text>
      <PathArrow
        points={[
          [150, 70],
          [190, 70],
        ]}
        className={styles.muted}
      />
      <Mailbox weight={DUO} x={196} y={50} size={32} className={styles.muted} />
      <Mailbox weight={DUO} x={232} y={50} size={32} className={styles.white} />
      <Mailbox weight={DUO} x={268} y={50} size={32} className={styles.muted} />
      <text x="232" y="112" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        the coins stay on the blockchain
      </text>
    </>
  );
}

/** Address: safe to share. Private key: keep it secret */
function SlotAndKey() {
  return (
    <>
      <rect x="96" y="30" width="96" height="90" rx="8" className={styles.panel} />
      <Mailbox weight={DUO} x={122} y={40} size={44} className={styles.up} />
      <text x="144" y="92" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        address
      </text>
      <text x="144" y="108" textAnchor="middle" className={`${styles.small} ${styles.up}`}>
        safe to share
      </text>
      <rect x="208" y="30" width="96" height="90" rx="8" className={styles.panel} />
      <Key weight={DUO} x={234} y={40} size={44} className={styles.amber} />
      <text x="256" y="92" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        private key
      </text>
      <text x="256" y="108" textAnchor="middle" className={`${styles.small} ${styles.down}`}>
        keep it secret
      </text>
    </>
  );
}

/** A wallet's three jobs */
function WalletJobs() {
  const jobs = [
    { x: 100, label: 'see', Icon: Eye },
    { x: 170, label: 'receive', Icon: Tray },
    { x: 240, label: 'sign', Icon: PencilSimple },
  ] as const;
  return (
    <>
      {jobs.map(({ x, label, Icon }) => (
        <g key={label}>
          <rect x={x} y={34} width="64" height="76" rx="8" className={styles.panel} />
          <Icon weight={DUO} x={x + 12} y={44} size={40} className={styles.white} />
          <text
            x={x + 32}
            y={102}
            textAnchor="middle"
            className={`${styles.chipText} ${styles.white}`}
          >
            {label}
          </text>
        </g>
      ))}
    </>
  );
}

/** Sam can see the address and what it holds, but can only look */
function SamGlass() {
  return (
    <>
      <Detective weight={DUO} x={92} y={34} size={52} className={styles.muted} />
      <text x="118" y="104" textAnchor="middle" className={`${styles.small} ${styles.muted}`}>
        Sam
      </text>
      <rect x="170" y="28" width="120" height="84" rx="8" className={styles.panel} />
      <Mailbox weight={DUO} x={182} y={44} size={44} className={styles.white} />
      <text x="254" y="66" textAnchor="middle" className={`${styles.bigNumber} ${styles.amber}`}>
        2 BTC
      </text>
      <Lock weight={DUO} x={240} y={72} size={26} className={styles.down} />
      <text x="230" y="128" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        he can look, not spend
      </text>
    </>
  );
}

/** The phone is gone; the coins are still there, out of reach */
function PhoneSea() {
  return (
    <>
      <g transform="rotate(-25 116 70)">
        <DeviceMobile weight={DUO} x={96} y={36} size={44} className={styles.white} />
      </g>
      <Waves weight={DUO} x={84} y={86} size={64} className={styles.coolText} />
      <Waves weight={DUO} x={132} y={86} size={64} className={styles.coolText} />
      <text x="124" y="30" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        key + phone
      </text>
      <PathArrow
        points={[
          [176, 70],
          [206, 70],
        ]}
        className={styles.muted}
      />
      <Mailbox weight={DUO} x={214} y={44} size={48} className={styles.amber} />
      <text x="254" y="108" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        2 BTC still here
      </text>
      <text x="254" y="122" textAnchor="middle" className={`${styles.small} ${styles.down}`}>
        no key to spend them
      </text>
    </>
  );
}

/** Custodial: the company holds the key and does the signing */
function BankHolds() {
  return (
    <>
      <Bank weight={DUO} x={96} y={34} size={64} className={styles.white} />
      <Key weight={DUO} x={150} y={36} size={34} className={styles.amber} />
      <text x="164" y="116" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        the company holds the key
      </text>
      <PathArrow
        points={[
          [194, 66],
          [226, 66],
        ]}
        className={styles.muted}
      />
      <text x="266" y="62" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        you ask
      </text>
      <text x="266" y="76" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        it to sign
      </text>
    </>
  );
}

/** The catch: a custodial company can freeze withdrawals */
function LockedCounter() {
  return (
    <>
      <Bank weight={DUO} x={100} y={32} size={72} className={styles.white} />
      <Key weight={DUO} x={150} y={34} size={34} className={styles.amber} />
      <Lock weight={DUO} x={184} y={54} size={40} className={styles.down} />
      <text x="170" y="116" textAnchor="middle" className={`${styles.chipText} ${styles.down}`}>
        withdrawals frozen
      </text>
      <text x="170" y="134" textAnchor="middle" className={`${styles.small} ${styles.muted}`}>
        only as safe as the company
      </text>
    </>
  );
}

/** Non-custodial: you hold the key */
function OwnKeys() {
  return (
    <>
      <circle cx="158" cy="68" r="26" className={`${styles.stroke} ${styles.amber}`} />
      <Key weight={DUO} x={136} y={46} size={44} className={styles.amber} />
      <text x="214" y="64" className={`${styles.chipText} ${styles.white}`}>
        you hold
      </text>
      <text x="214" y="80" className={`${styles.chipText} ${styles.white}`}>
        the key
      </text>
    </>
  );
}

/** There is no reset button for a lost key */
function NoReset() {
  return (
    <>
      <rect x="120" y="50" width="100" height="40" rx="20" className={styles.panel} />
      <text x="170" y="76" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        Reset
      </text>
      <Prohibit weight={DUO} x={134} y={36} size={72} className={styles.down} />
      <text x="170" y="124" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        no reset button for a key
      </text>
    </>
  );
}

/** A recovery phrase: twelve numbered slots, never real words */
function PhraseCard() {
  const cells = Array.from({ length: 12 }, (_, i) => i);
  return (
    <>
      <rect x="92" y="18" width="212" height="112" rx="8" className={styles.note} />
      {cells.map((i) => {
        const x = 100 + (i % 4) * 51;
        const y = 28 + Math.floor(i / 4) * 32;
        return (
          <g key={i}>
            <rect x={x} y={y} width="46" height="26" rx="5" className={styles.panel} />
            <text x={x + 5} y={y + 17} className={`${styles.small} ${styles.muted}`}>
              {i + 1}
            </text>
            <line
              x1={x + 16}
              x2={x + 40}
              y1={y + 13}
              y2={y + 13}
              className={`${styles.stroke} ${styles.white}`}
            />
          </g>
        );
      })}
      <text x="198" y="146" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        12 words, in order
      </text>
    </>
  );
}

/** Never a photo, a cloud or a website */
function PhraseNever() {
  const items = [
    { x: 100, label: 'photo', Icon: Camera },
    { x: 170, label: 'cloud', Icon: Cloud },
    { x: 240, label: 'email', Icon: EnvelopeSimple },
  ] as const;
  return (
    <>
      {items.map(({ x, label, Icon }) => (
        <g key={label}>
          <Icon weight={DUO} x={x + 8} y={36} size={44} className={styles.muted} />
          <Prohibit weight={DUO} x={x} y={28} size={60} className={styles.down} />
          <text
            x={x + 30}
            y={110}
            textAnchor="middle"
            className={`${styles.chipText} ${styles.white}`}
          >
            {label}
          </text>
        </g>
      ))}
      <text x="200" y="136" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        paper, offline, and no one else
      </text>
    </>
  );
}

/** A hot wallet: a phone that is online */
function HotPhone() {
  return (
    <>
      <DeviceMobile weight={DUO} x={110} y={30} size={72} className={styles.white} />
      <Key weight={DUO} x={132} y={52} size={28} className={styles.amber} />
      <WifiHigh weight={DUO} x={192} y={42} size={44} className={styles.amber} />
      <Tag x={190} y={92} w={64}>
        online
      </Tag>
      <text x="204" y="128" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        handy, but the key is online
      </text>
    </>
  );
}

/** A cold wallet: a generic hardware wallet, no maker's shape or logo */
function ColdDevice() {
  return (
    <>
      <rect x="116" y="38" width="76" height="52" rx="10" className={styles.panel} />
      <rect x="126" y="46" width="44" height="26" rx="4" className={styles.note} />
      <path d="M140 60 l6 6 l12 -12" className={`${styles.stroke} ${styles.up}`} />
      <circle cx="178" cy="54" r="4" className={styles.coolFill} />
      <circle cx="178" cy="68" r="4" className={styles.coolFill} />
      <Usb weight={DUO} x={192} y={50} size={26} className={styles.muted} />
      <LockKey weight={DUO} x={232} y={36} size={44} className={styles.coolText} />
      <Tag x={218} y={88} w={72} cool>
        offline
      </Tag>
      <text x="204" y="128" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        it signs inside: the key never leaves
      </text>
    </>
  );
}

/** A purse for today, a safe for later */
function PurseSafe() {
  return (
    <>
      <Handbag weight={DUO} x={104} y={32} size={56} className={styles.amber} />
      <Tag x={104} y={92} w={56}>
        hot
      </Tag>
      <text x="132" y="126" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        a little, for today
      </text>
      <Vault weight={DUO} x={200} y={28} size={64} className={styles.coolText} />
      <Tag x={204} y={92} w={56} cool>
        cold
      </Tag>
      <text x="232" y="126" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        the rest, for later
      </text>
    </>
  );
}

// ─── Chapter 2, Lesson 8: why sending crypto costs a fee ───
// One metaphor from Lesson 5's toll booth, carried on: a block is a bus with limited seats, and the
// fee is what you offer for a seat. The spike is drawn from reported averages (never a chart).

/** A send carries a small fee */
function SendFee() {
  return (
    <>
      <Coins weight={DUO} x={100} y={44} size={48} className={styles.amber} />
      <PathArrow
        points={[
          [156, 68],
          [214, 68],
        ]}
        className={styles.muted}
      />
      <Tag x={166} y={78} w={40}>
        + fee
      </Tag>
      <Mailbox weight={DUO} x={222} y={44} size={48} className={styles.white} />
      <text x="196" y="124" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        a small fee rides along
      </text>
    </>
  );
}

/** A block is a bus with a limited number of seats */
function BusBlock() {
  return (
    <>
      <Bus weight={DUO} x={96} y={34} size={64} className={styles.white} />
      <text x="128" y="112" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        a block
      </text>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x={176 + (i % 3) * 38}
          y={44 + Math.floor(i / 3) * 34}
          width="30"
          height="26"
          rx="5"
          className={i === 5 ? styles.panel : styles.badge}
        />
      ))}
      <text x="252" y="112" textAnchor="middle" className={`${styles.small} ${styles.muted}`}>
        1 seat left
      </text>
      <text x="212" y="136" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        a block has limited seats
      </text>
    </>
  );
}

/** Payments wait in line; the ones offering more board first */
function WaitingLine() {
  const line = [
    { x: 94, label: 'high' },
    { x: 138, label: 'mid' },
    { x: 182, label: 'low' },
    { x: 226, label: 'low' },
  ] as const;
  return (
    <>
      {line.map(({ x, label }) => (
        <g key={x}>
          <rect x={x} y={52} width="38" height="34" rx="5" className={styles.panel} />
          <Package weight={DUO} x={x + 7} y={54} size={24} className={styles.white} />
          <text x={x + 19} y={82} textAnchor="middle" className={`${styles.small} ${styles.amber}`}>
            {label}
          </text>
        </g>
      ))}
      <PathArrow
        points={[
          [268, 70],
          [286, 70],
        ]}
        className={styles.muted}
      />
      <Bus weight={DUO} x={284} y={50} size={34} className={styles.white} />
      <text x="188" y="40" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        payments waiting, with the fee each offers
      </text>
      <text x="196" y="112" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        higher fees board first
      </text>
    </>
  );
}

/** A busier network: the bids rise */
function FeeBids() {
  const bars = [14, 20, 34, 52, 76];
  return (
    <>
      {bars.map((h, i) => (
        <rect
          key={i}
          x={112 + i * 38}
          y={118 - h}
          width="26"
          height={h}
          rx="4"
          className={styles.amberFill}
        />
      ))}
      <text x="126" y="136" textAnchor="middle" className={`${styles.small} ${styles.muted}`}>
        quiet
      </text>
      <text x="278" y="136" textAnchor="middle" className={`${styles.small} ${styles.muted}`}>
        busy
      </text>
      <text x="200" y="24" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        the fee people offer
      </text>
    </>
  );
}

/** Bitcoin's average fee, April 2024, drawn from reported averages: about $4, $128 and $35 */
function FeeSpike() {
  return (
    <>
      <line x1="96" x2="308" y1="118" y2="118" className={`${styles.stroke} ${styles.muted}`} />
      <polyline points="110,108 190,30 250,88" className={`${styles.stroke} ${styles.amber}`} />
      <circle cx="190" cy="30" r="4" className={styles.amberFill} />
      <text x="190" y="20" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        20 Apr ≈ $128
      </text>
      <text x="130" y="132" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        early April ≈ $4
      </text>
      <text x="268" y="84" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        21 Apr ≈ $35
      </text>
      <text x="238" y="150" textAnchor="middle" className={`${styles.small} ${styles.muted}`}>
        drawn from reported averages, not to scale
      </text>
    </>
  );
}

/** Some chains are built cheap; others get pricey when busy */
function ChainsCompare() {
  return (
    <>
      <rect x="94" y="28" width="104" height="86" rx="8" className={styles.panel} />
      <Coins weight={DUO} x={124} y={36} size={36} className={styles.up} />
      <text x="146" y="92" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        a cheap chain
      </text>
      <text x="146" y="106" textAnchor="middle" className={`${styles.small} ${styles.up}`}>
        often cents
      </text>
      <rect x="210" y="28" width="104" height="86" rx="8" className={styles.panel} />
      <Coins weight={DUO} x={240} y={36} size={36} className={styles.amber} />
      <text x="262" y="92" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        a pricier chain
      </text>
      <text x="262" y="106" textAnchor="middle" className={`${styles.small} ${styles.amber}`}>
        dollars when busy
      </text>
    </>
  );
}

/** A plain send is one step; a swap does more work */
function SimpleComplex() {
  return (
    <>
      <rect x="94" y="28" width="92" height="86" rx="8" className={styles.panel} />
      <Package weight={DUO} x={118} y={38} size={44} className={styles.white} />
      <text x="140" y="94" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        a plain send
      </text>
      <text x="140" y="108" textAnchor="middle" className={`${styles.small} ${styles.up}`}>
        less work, lower fee
      </text>
      <rect x="198" y="28" width="116" height="86" rx="8" className={styles.panel} />
      <Swap weight={DUO} x={206} y={40} size={32} className={styles.white} />
      <Gear weight={DUO} x={242} y={40} size={32} className={styles.white} />
      <Package weight={DUO} x={278} y={40} size={32} className={styles.white} />
      <text x="256" y="94" textAnchor="middle" className={`${styles.chipText} ${styles.white}`}>
        a swap
      </text>
      <text x="256" y="108" textAnchor="middle" className={`${styles.small} ${styles.amber}`}>
        more work, higher fee
      </text>
    </>
  );
}

/** Check the fee before you confirm */
function FeeCheck() {
  return (
    <>
      <rect x="98" y="22" width="132" height="84" rx="8" className={styles.panel} />
      <text x="110" y="44" className={`${styles.small} ${styles.white}`}>
        Send
      </text>
      <text x="218" y="44" textAnchor="end" className={`${styles.chipText} ${styles.white}`}>
        $40
      </text>
      <text x="110" y="68" className={`${styles.small} ${styles.white}`}>
        Network fee
      </text>
      <text x="218" y="68" textAnchor="end" className={`${styles.chipText} ${styles.amber}`}>
        $12
      </text>
      <rect x="110" y="80" width="108" height="18" rx="9" className={styles.amberFill} />
      <text x="164" y="93" textAnchor="middle" className={styles.tagText}>
        Confirm
      </text>
      <MagnifyingGlass weight={DUO} x={242} y={34} size={56} className={styles.white} />
      <text x="204" y="132" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
        look at the fee before you confirm
      </text>
    </>
  );
}

// ─── The sneak peek's own graphic (owner 2026-11-22) ───
// Each lesson's "What you will learn" card carries its own picture, derived from the lesson's topics:
// a numbered path through three or four stops, one icon and a two-line label each, in the order of the
// numbered lines below it. One template for every lesson, so the opening always looks the same.

type PeekIcon = typeof Coins;
interface PeekStop {
  Icon: PeekIcon;
  line1: string;
  line2: string;
}

function PeekMap({ stops }: { stops: readonly PeekStop[] }) {
  const four = stops.length === 4;
  const first = four ? 110 : 124;
  const gap = four ? 57 : 78;
  const middle = first + (gap * (stops.length - 1)) / 2;
  return (
    <>
      <text x={middle} y="24" textAnchor="middle" className={`${styles.small} ${styles.muted}`}>
        in this lesson
      </text>
      <line
        x1={first}
        x2={first + gap * (stops.length - 1)}
        y1="62"
        y2="62"
        className={`${styles.stroke} ${styles.muted} ${styles.dashed}`}
      />
      {stops.map(({ Icon, line1, line2 }, i) => {
        const cx = first + gap * i;
        return (
          <g key={line1}>
            <circle cx={cx} cy="62" r="22" className={styles.panel} />
            <Icon weight={DUO} x={cx - 13} y={49} size={26} className={styles.white} />
            <circle cx={cx - 17} cy="42" r="8" className={styles.badge} />
            <text x={cx - 17} y="46" textAnchor="middle" className={styles.badgeText}>
              {i + 1}
            </text>
            <text x={cx} y="104" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
              {line1}
            </text>
            <text x={cx} y="118" textAnchor="middle" className={`${styles.small} ${styles.white}`}>
              {line2}
            </text>
          </g>
        );
      })}
    </>
  );
}

const peek = (stops: readonly PeekStop[]) => () => <PeekMap stops={stops} />;

const PeekOwnership = peek([
  { Icon: Bank, line1: 'Why it', line2: 'exists' },
  { Icon: Notebook, line1: 'One ledger', line2: 'copied' },
  { Icon: Cube, line1: 'Nodes and', line2: 'blocks' },
  { Icon: UsersThree, line1: 'No one in', line2: 'charge' },
]);
const PeekSwings = peek([
  { Icon: ChartLineUp, line1: 'Swings', line2: 'both ways' },
  { Icon: Newspaper, line1: 'News and', line2: 'hype' },
  { Icon: Stack, line1: 'Thin or', line2: 'deep' },
  { Icon: MagnifyingGlass, line1: 'Check the', line2: 'coin' },
]);
const PeekStyle = peek([
  { Icon: ArrowsLeftRight, line1: 'Trading or', line2: 'investing' },
  { Icon: ChartPieSlice, line1: 'Spreading', line2: 'money' },
  { Icon: Compass, line1: 'Your time,', line2: 'nerves, goals' },
]);
const PeekCoins = peek([
  { Icon: RoadHorizon, line1: 'Coin or', line2: 'token' },
  { Icon: Ticket, line1: 'Token', line2: 'kinds' },
  { Icon: Leaf, line1: 'Altcoin', line2: 'swings' },
  { Icon: MagnifyingGlass, line1: 'Check fast', line2: 'gains' },
]);
const PeekStable = peek([
  { Icon: Coins, line1: 'Steady', line2: 'coins' },
  { Icon: Vault, line1: 'Three', line2: 'kinds' },
  { Icon: Wallet, line1: 'Park and', line2: 'pay' },
  { Icon: Warning, line1: 'Not a', line2: 'promise' },
]);
const PeekWallets = peek([
  { Icon: Key, line1: 'Keys, not', line2: 'coins' },
  { Icon: Bank, line1: 'Who holds', line2: 'the key' },
  { Icon: Note, line1: 'Recovery', line2: 'phrase' },
  { Icon: LockKey, line1: 'Hot and', line2: 'cold' },
]);
const PeekFees = peek([
  { Icon: Bus, line1: 'Send to', line2: 'confirmed' },
  { Icon: Coins, line1: 'Why fees', line2: 'move' },
  { Icon: ChartLineUp, line1: 'A real', line2: 'fee spike' },
  { Icon: MagnifyingGlass, line1: 'Check the', line2: 'fee' },
]);

const ART: Record<LessonArtId, () => JSX.Element> = {
  friends: Friends,
  lena: LenaAlone,
  zoe: ZoeAlone,
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
  twoRoads: TwoRoads,
  coinRoad: CoinRoad,
  tollBooth: TollBooth,
  tickerBadges: TickerBadges,
  shopRoad: ShopRoad,
  arcadeCredits: ArcadeCredits,
  shareCertificate: ShareCertificate,
  ballotBox: BallotBox,
  calmStormy: CalmStormy,
  stopCoin: StopCoin,
  wobbleSteady: WobbleSteady,
  steadyPeg: SteadyPeg,
  cloakroom: Cloakroom,
  vaultDollar: VaultDollar,
  vaultCrypto: VaultCrypto,
  vaultRule: VaultRule,
  vaultCheck: VaultCheck,
  usdtPair: UsdtPair,
  parkProfit: ParkProfit,
  pegDip: PegDip,
  tooSweet: TooSweet,
  mailboxWall: MailboxWall,
  keyRing: KeyRing,
  slotAndKey: SlotAndKey,
  walletJobs: WalletJobs,
  samGlass: SamGlass,
  phoneSea: PhoneSea,
  bankHolds: BankHolds,
  lockedCounter: LockedCounter,
  ownKeys: OwnKeys,
  noReset: NoReset,
  phraseCard: PhraseCard,
  phraseNever: PhraseNever,
  hotPhone: HotPhone,
  coldDevice: ColdDevice,
  purseSafe: PurseSafe,
  sendFee: SendFee,
  busBlock: BusBlock,
  waitingLine: WaitingLine,
  feeBids: FeeBids,
  feeSpike: FeeSpike,
  chainsCompare: ChainsCompare,
  simpleComplex: SimpleComplex,
  feeCheck: FeeCheck,
  peekOwnership: PeekOwnership,
  peekSwings: PeekSwings,
  peekStyle: PeekStyle,
  peekCoins: PeekCoins,
  peekStable: PeekStable,
  peekWallets: PeekWallets,
  peekFees: PeekFees,
};

/** A card's picture, with its presenting guide standing in the bottom-left corner */
export function LessonArt({
  id,
  presenter,
  center = false,
}: {
  id: LessonArtId;
  presenter?: Presenter;
  /** Slide the view so the drawing sits in the middle: the scenes leave room on the left for the
   *  presenting guide, so without one (a card preview) they look pushed to the right */
  center?: boolean;
}) {
  const Picture = ART[id];
  const label = ART_LABELS[id];
  const group = useRef<SVGGElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const g = group.current;
    if (!center || !g) {
      setShift(0);
      return;
    }
    // Measure now, and again whenever the svg's size changes (a card mounted while hidden has an empty
    // box until it shows). jsdom has no getBBox or ResizeObserver: the view stays centred as drawn.
    const measure = () => {
      let next = 0;
      if (typeof g.getBBox === 'function') {
        try {
          const b = g.getBBox();
          if (b.width > 0) next = Math.max(-40, Math.min(60, b.x + b.width / 2 - 160));
        } catch {
          // not laid out yet
        }
      }
      setShift(next);
    };
    measure();
    const svg = g.ownerSVGElement;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [center, id]);
  return (
    <svg
      viewBox={`${center ? shift : 0} 0 320 160`}
      className={styles.art}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
      data-lesson-art={id}
    >
      {center ? (
        <g ref={group}>
          <Picture />
        </g>
      ) : (
        <Picture />
      )}
      {presenter && (
        <g className={styles.presenter}>
          <Guide {...presenter} pose={presenter.pose ?? 'point'} x={0} y={56} scale={1.12} />
        </g>
      )}
    </svg>
  );
}
