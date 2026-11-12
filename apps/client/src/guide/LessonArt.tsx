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
  Globe,
  HardDrives,
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

/** Lesson 2's hook: Tock waits calmly beside the price tag (Tick presents) */
function Hook() {
  return (
    <>
      <rect x="118" y="10" width="110" height="40" rx="20" className={styles.panel} />
      <BtcMark x={128} y={16} size={28} />
      <text x="190" y="37" textAnchor="middle" className={styles.price}>
        ?
      </text>
      <Guide who="tock" mood="calm" x={200} y={62} scale={0.95} />
    </>
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

function Busy() {
  return (
    <>
      <Globe weight={DUO} x={82} y={8} size={80} className={styles.system} />
      <Clock weight={DUO} x={136} y={56} size={36} className={styles.amber} />
      <text x="122" y="118" textAnchor="middle" className={styles.label}>
        24/7, worldwide
      </text>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <User weight={DUO} x={206} y={10 + i * 30} size={26} className={styles.up} />
          <User weight={DUO} x={262} y={10 + i * 30} size={26} className={styles.down} />
        </g>
      ))}
      <Label x={256} y={118}>
        buyers and sellers, always near
      </Label>
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

const ART: Record<LessonArtId, () => JSX.Element> = {
  hook: Hook,
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
  busy: Busy,
  tesla: Tesla,
  etf: Etf,
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
