/**
 * The lessons' pictures (owner 2026-10-22: our own colours and candles, never traced from an
 * inspiration; 2026-10-24: Phosphor duotone icons, the real BTC mark, a dotted world map, and Tick or
 * Tock standing in every scene, presenting it). Decorative: the card's text carries the meaning.
 *
 * Every scene is drawn in a 320 × 160 box and leaves its bottom-left corner (x < 74, y > 56) free
 * for the presenting guide.
 */

import type { JSX } from 'react';
import {
  ArrowsLeftRight,
  Bank,
  Clock,
  Coffee,
  Coins,
  DeviceMobile,
  Eraser,
  GameController,
  HardDrives,
  MagnifyingGlass,
  ListNumbers,
  Mailbox as MailboxIcon,
  Notebook as NotebookIcon,
  Scales,
  Tag,
  User,
} from '@phosphor-icons/react';
import { StampShape } from '@/learn/StampShape';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { Guide, GuideFigure } from './art/Guide';
import { WORLD_DOTS } from './art/worldDots';
import type { LessonArtId, Presenter, Speaker } from './lessons';
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

const RISE = fromCloses([10, 11, 10.5, 13, 12.6, 14.5, 15, 14.4, 16.5, 18]);
const FALL = fromCloses([18, 17.6, 18.2, 15, 15.6, 14.1, 14.6, 13]);
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

/** Lesson 1's cold open: the pizzas and the coin, no words (the beats carry them), slowly zooming */
/** The three keepers of money, each tile dropping in from above after the one before */
function Money() {
  const tile = (x: number, label: string, icon: JSX.Element) => (
    <g key={label} className={styles.drop} data-drop={(x - 80) / 80}>
      <rect x={x} y="12" width="68" height="68" rx="14" className={styles.panel} />
      {icon}
      <Coins weight={DUO} x={x + 44} y={54} size={30} className={styles.amber} />
      <text x={x + 34} y="100" textAnchor="middle" className={styles.label}>
        {label}
      </text>
    </g>
  );
  return (
    <>
      {tile(
        80,
        'a bank',
        <Bank key="i" weight={DUO} x={92} y={22} size={44} className={styles.system} />
      )}
      {tile(
        160,
        'a state',
        <Scales key="i" weight={DUO} x={172} y={22} size={44} className={styles.system} />
      )}
      {tile(
        240,
        'a game maker',
        <GameController key="i" weight={DUO} x={252} y={22} size={44} className={styles.system} />
      )}
      <Label x={200} y={136}>
        each one needs someone in charge
      </Label>
    </>
  );
}

function Notebook() {
  const lines = ['Start → Emi  6', 'Start → Leo  4', 'Start → Sofia  5', 'Leo → Emi  3'];
  return (
    <>
      <rect x="96" y="8" width="206" height="116" rx="10" className={styles.panel} />
      <NotebookIcon weight={DUO} x={108} y={16} size={30} className={styles.amber} />
      <text x="146" y="37" className={styles.notebookTitle}>
        Nora’s notebook
      </text>
      {lines.map((text, i) => (
        <text key={text} x="112" y={60 + i * 19} className={styles.notebookLine}>
          {i + 1}. {text}
        </text>
      ))}
      <Label x={200} y={146}>
        a list of payments, no balances
      </Label>
    </>
  );
}

/** What one keeper could do with one pen: four tiles dropping in, one after another */
function OneNora() {
  const risks = [
    ['print', Coins, styles.amber],
    ['move', ArrowsLeftRight, styles.system],
    ['rewrite', Eraser, styles.system],
    ['lose', Coffee, styles.system],
  ] as const;
  return (
    <>
      {risks.map(([label, Icon, tone], i) => {
        const x = 84 + i * 58;
        return (
          <g key={label} className={styles.drop} data-drop={i}>
            <rect x={x} y="16" width="50" height="50" rx="12" className={styles.panel} />
            <Icon weight={DUO} x={x + 10} y={26} size={30} className={tone} />
            <text x={x + 25} y="84" textAnchor="middle" className={styles.label}>
              {label}
            </text>
          </g>
        );
      })}
      <Label x={200} y={124}>
        one pen, one notebook, one Nora
      </Label>
    </>
  );
}

// The dotted world map: 67 × 34 map units, scaled into the scene beside the presenter
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

/** The address and the key drop in one after the other, as the Nora card's tiles (owner 2026-11-08) */
function Mailbox() {
  const tiles = [
    ['address', MailboxIcon, styles.system, 112],
    ['private key', null, styles.amber, 222],
  ] as const;
  return (
    <>
      {tiles.map(([label, Icon, tone, x], i) => (
        <g key={label} className={styles.drop} data-drop={i}>
          <rect x={x} y="14" width="66" height="66" rx="14" className={styles.panel} />
          {Icon ? (
            <Icon weight={DUO} x={x + 11} y={25} size={44} className={tone} />
          ) : (
            // The private key is the stamp from the articles, seated in its checker
            <StampShape x={x + 8} y={37} width={50} outline className={tone} />
          )}
          <text x={x + 33} y="98" textAnchor="middle" className={styles.label}>
            {label}
          </text>
        </g>
      ))}
      <Label x={200} y={124}>
        anyone can pay in; only the key opens it
      </Label>
    </>
  );
}

/** The private key as a stamp, under its checker (the public key): the articles' picture */
function Stamp() {
  return (
    <>
      <StampShape x={96} y={14} width={120} outline filled={false} className={styles.amber} />
      <text x={224} y="34" className={styles.label}>
        checker
      </text>
      <text x={224} y="48" className={styles.chipText}>
        public key
      </text>
      <StampShape x={96} y={74} width={120} className={styles.amber} />
      <text x={224} y="94" className={styles.label}>
        stamp
      </text>
      <text x={224} y="108" className={styles.chipText}>
        private key
      </text>
      <Label x={200} y={140}>
        anyone can check it; nobody can copy it
      </Label>
    </>
  );
}

/**
 * What the phone holds, what backs it up, and where the bitcoin really is (the ledger: no coins, a
 * balance is its entries added up; owner 2026-11-12), dropping in one by one
 */
function KeyHolders() {
  const tiles = [
    ['your phone', DeviceMobile, styles.system, 86],
    ['recovery words', ListNumbers, styles.amber, 166],
    ['the ledger', NotebookIcon, styles.amber, 246],
  ] as const;
  return (
    <>
      {tiles.map(([label, Icon, tone, x], i) => (
        <g key={label} className={styles.drop} data-drop={i}>
          <rect x={x} y="14" width="62" height="62" rx="14" className={styles.panel} />
          <Icon weight={DUO} x={x + 11} y={25} size={40} className={tone} />
          <text x={x + 31} y="94" textAnchor="middle" className={styles.label}>
            {label}
          </text>
        </g>
      ))}
      <Label x={200} y={124}>
        your balance = the ledger, added up
      </Label>
    </>
  );
}

/** Who holds the key: an exchange for you, or you yourself */
function Custody() {
  const tiles = [
    ['an exchange', Bank, styles.system, 104],
    ['you', User, styles.system, 216],
  ] as const;
  return (
    <>
      {tiles.map(([label, Icon, tone, x], i) => (
        <g key={label} className={styles.drop} data-drop={i}>
          <rect x={x} y="10" width="72" height="72" rx="14" className={styles.panel} />
          <Icon weight={DUO} x={x + 10} y={16} size={40} className={tone} />
          <StampShape x={x + 16} y={58} width={40} className={styles.amber} />
          <text x={x + 36} y="100" textAnchor="middle" className={styles.label}>
            {label}
          </text>
        </g>
      ))}
      <text x={196} y="52" textAnchor="middle" className={styles.chipText}>
        or
      </text>
      <Label x={200} y={126}>
        the key holder can spend the bitcoin
      </Label>
    </>
  );
}

function Queues() {
  const column = (x: number, cls: string, label: string) => (
    <g key={label} className={cls}>
      {[0, 1, 2].map((i) => (
        <User key={i} weight={DUO} x={x} y={14 + i * 30} size={28} />
      ))}
      <text x={x + 14} y="120" textAnchor="middle" className={styles.chipText}>
        {label}
      </text>
    </g>
  );
  return (
    <>
      {column(92, styles.up, 'Buy')}
      {column(262, styles.down, 'Sell')}
      <path d="M126 58 L150 58 M256 58 L232 58" className={styles.link} />
      <Tag weight={DUO} x={166} y={28} size={56} className={styles.amber} />
      <text x="194" y="104" textAnchor="middle" className={styles.price}>
        last deal
      </text>
    </>
  );
}

function Tesla() {
  return (
    <>
      <Candles bars={RISE} x={76} y={14} width={110} height={96} />
      <Candles bars={FALL} x={200} y={14} width={110} height={96} />
      <Label x={131} y={140}>
        Feb 2021: up
      </Label>
      <Label x={255} y={140}>
        May 2021: down
      </Label>
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

const ART: Record<LessonArtId, () => JSX.Element> = {
  money: Money,
  notebook: Notebook,
  oneNora: OneNora,
  ledger: WorldLedgers,
  bitcoin: BitcoinBirth,
  mailbox: Mailbox,
  stamp: Stamp,
  keyHolders: KeyHolders,
  custody: Custody,
  queues: Queues,
  tesla: Tesla,
  etf: Etf,
  flashCrash: FlashCrash,
  staircase: Staircase,
  candleAnatomy: CandleAnatomy,
  swings: Swings,
  checkCoin: CheckCoin,
};

/** A card's picture, with its presenting guide standing in the bottom-left corner */
export function LessonArt({ id, presenter }: { id: LessonArtId; presenter?: Presenter }) {
  const Picture = ART[id];
  return (
    <svg
      viewBox="0 0 320 160"
      className={styles.art}
      aria-hidden="true"
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
