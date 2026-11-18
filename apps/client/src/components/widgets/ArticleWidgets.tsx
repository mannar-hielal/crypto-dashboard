/**
 * The interactive pieces inside knowledge-base articles (knowledge-base plan, owner 2026-10-23),
 * rebuilt in our tokens from the owner's SunCoin and mailbox demos. Doing replaces reading: press,
 * edit, step, and watch what happens. SunCoin is amber; money in and out is green and red, always
 * with a + or − so colour is never the only signal.
 */

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  ArrowsLeftRight,
  Coffee,
  Coins,
  Database,
  DeviceMobile,
  Eraser,
  FileText,
  ListNumbers,
  Lock,
  Mailbox as MailboxIcon,
  Notebook,
  QrCode,
  ShareNetwork,
  ShieldCheck,
} from '@phosphor-icons/react';
// A 192 px thumbnail for the 64 px tile, not the lesson's 1200 px photo (review 2026-11-12)
import pizzaDayThumb from '@/assets/lessons/pizza-day-thumb.jpg';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { guide } from '@/lib/guideAnchors';
import type { WidgetId } from './widgetIds';
import { StampShape } from './StampShape';
import { STAMP_SHAPES } from './stamp';
import { NOTEBOOK, balancesAfter, copiesAgreeing, ledgerTotal, PEOPLE } from './suncoin';
import styles from './Widgets.module.css';

// ─── SunCoin: the notebook, one payment at a time ────────────────────────────

function SunCoinNotebook() {
  const [shown, setShown] = useState(0);
  const last = shown > 0 ? NOTEBOOK[shown - 1] : null;
  const balances = balancesAfter(NOTEBOOK.slice(0, shown));

  return (
    <figure className={styles.widget} aria-label="Nora’s notebook, the SunCoin ledger">
      <p className={styles.widgetTitle}>
        <Notebook weight="duotone" size={22} className={styles.amberIcon} aria-hidden="true" />
        Nora’s notebook
      </p>
      <div className={styles.people}>
        {PEOPLE.map((name) => {
          const b = balances[name];
          const active = last && (last.from === name || last.to === name);
          return (
            <div
              key={name}
              className={`${styles.person}${active ? ` ${styles.personActive}` : ''}`}
            >
              <p className={styles.personName}>{name}</p>
              <p className={styles.personBalance}>{b.total}</p>
              <p className={styles.personSteps}>
                {b.steps.length === 0
                  ? 'no lines yet'
                  : b.steps.map((step) => (
                      <span
                        key={step.line}
                        className={step.amount > 0 ? styles.plus : styles.minus}
                      >
                        {step.amount > 0 ? `+${step.amount} ` : `−${-step.amount} `}
                      </span>
                    ))}
              </p>
            </div>
          );
        })}
      </div>
      <p className={styles.story} aria-live="polite">
        {last ? last.story : 'Press “Next payment” to start the notebook.'}
      </p>
      <div className={styles.widgetActions}>
        <button
          type="button"
          className={styles.primary}
          disabled={shown >= NOTEBOOK.length}
          onClick={() => setShown((n) => Math.min(n + 1, NOTEBOOK.length))}
          {...guide('article.notebook.next')}
        >
          Next payment
        </button>
        <button
          type="button"
          className={styles.link}
          onClick={() => setShown(0)}
          {...guide('article.notebook.reset')}
        >
          Start over
        </button>
        <span className={styles.counter}>
          {shown} of {NOTEBOOK.length} lines
        </span>
      </div>
      <table className={styles.table}>
        <caption className={styles.caption}>Nora’s notebook: only what happened, in order</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">SunCoins</th>
          </tr>
        </thead>
        <tbody>
          {shown === 0 ? (
            <tr>
              <td colSpan={4} className={styles.empty}>
                The notebook is empty.
              </td>
            </tr>
          ) : (
            NOTEBOOK.slice(0, shown).map((line) => (
              <tr key={line.line}>
                <td>{line.line}</td>
                <td>{line.from}</td>
                <td>{line.to}</td>
                <td className={styles.sun}>{line.amount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </figure>
  );
}

// ─── Nora cheats: edit line 4, then ask the other notebooks ──────────────────

const EDITABLE_LINE = 4;

function NoraCheats({ copiesCheck = true }: { copiesCheck?: boolean }) {
  const original = NOTEBOOK[EDITABLE_LINE - 1].amount;
  const [raw, setRaw] = useState(String(original));
  const [copies, setCopies] = useState(false);
  const parsed = parseInt(raw.replace(/,/g, ''), 10);
  const amount = Number.isFinite(parsed) && parsed > 0 && parsed < 100 ? parsed : original;
  const edited = NOTEBOOK.map((l) => (l.line === EDITABLE_LINE ? { ...l, amount } : l));
  const balances = balancesAfter(edited);
  const total = ledgerTotal(edited);
  const cheated = amount !== original;
  const agree = copiesAgreeing(cheated);

  return (
    <figure className={styles.widget} aria-label="Nora cheats: change line 4">
      <p className={styles.widgetTitle}>
        <Notebook weight="duotone" size={22} className={styles.amberIcon} aria-hidden="true" />
        Nora cheats
      </p>
      <p className={styles.story}>
        Nora quietly changes line 4. Type a new amount for “Leo → Emi” and watch the notebook.
      </p>
      <label className={styles.fieldRow}>
        <span>Line 4: Leo → Emi</span>
        <input
          className={styles.input}
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          {...guide('article.nora.amount')}
        />
        <span>SunCoins</span>
      </label>
      <ul className={styles.balances}>
        {PEOPLE.map((name) => (
          <li key={name}>
            {name}: <strong>{balances[name].total}</strong>
          </li>
        ))}
      </ul>
      <p className={cheated ? styles.alert : styles.story} role="status">
        {!cheated
          ? 'Leo has 3 and Emi 5, as the real payments say.'
          : `Leo now has ${balances.Leo.total} and Emi ${balances.Emi.total}${
              balances.Leo.total < 0 ? ': Leo has paid out coins he never had' : ''
            }. The coins still add up to ${total}, so nothing in the notebook gives the edit away.`}
      </p>
      {copiesCheck && (
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={copies}
            onChange={(e) => setCopies(e.target.checked)}
            {...guide('article.nora.copies')}
          />
          <span>Many notebooks: five friends each keep a copy</span>
        </label>
      )}
      {copiesCheck && copies && (
        <p className={cheated ? styles.alert : styles.story}>
          {cheated
            ? `${agree} of 5 copies still say Leo paid ${original}. Nora’s copy is outvoted, and her edit is rejected.`
            : 'All 5 copies agree, line for line.'}
        </p>
      )}
    </figure>
  );
}

// ─── The order book: two queues ──────────────────────────────────────────────

const ASKS = [
  { price: '60,030', size: 3 },
  { price: '60,020', size: 5 },
  { price: '60,010', size: 2 },
];
const BIDS = [
  { price: '60,000', size: 4 },
  { price: '59,990', size: 6 },
  { price: '59,980', size: 2 },
];

function OrderBook() {
  return (
    <figure className={styles.widget} aria-label="An order book: sellers above, buyers below">
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Price (USDT)</th>
            <th scope="col">Waiting</th>
          </tr>
        </thead>
        <tbody>
          {ASKS.map((a) => (
            <tr key={a.price}>
              <td className={styles.minus}>Ask {a.price}</td>
              <td>{'▮'.repeat(a.size)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={2} className={styles.gap}>
              The gap: the spread, $10
            </td>
          </tr>
          {BIDS.map((b) => (
            <tr key={b.price}>
              <td className={styles.plus}>Bid {b.price}</td>
              <td>{'▮'.repeat(b.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className={styles.caption}>
        Sellers ask from above, buyers bid from below. A deal happens where they meet.
      </figcaption>
    </figure>
  );
}

// ─── A payment in three steps ────────────────────────────────────────────────

const MAIL_STEPS = [
  { title: 'Emi shares an address', text: 'Usually as a QR code. It’s safe to share.' },
  {
    title: 'Leo sends bitcoin to it',
    text: 'His wallet stamps the payment with his private key; every node checks the mark.',
  },
  { title: 'The box is locked', text: 'From now on only Emi’s private key can move it.' },
] as const;

/** The three steps in one picture (Phosphor duotone and the real BTC mark, as Lesson 1's card) */
function Mailbox({ step }: { step: number }) {
  return (
    <svg viewBox="0 0 220 120" className={styles.mailbox} aria-hidden="true" focusable="false">
      <MailboxIcon weight="duotone" x={64} y={6} size={104} className={styles.system} />
      {step === 0 && <QrCode weight="duotone" x={170} y={34} size={44} className={styles.white} />}
      {step === 1 && (
        <>
          <image href={CRYPTO_ICON_URLS.BTC} x={8} y={22} width={36} height={36} />
          <ArrowRight weight="bold" x={46} y={30} size={22} className={styles.muted} />
          {/* The stamp from Many notebooks, seated in its checker: the signature */}
          {/* Leo signs with his own stamp; Emi's, in step 3, has other notches */}
          <StampShape who="leo" x={8} y={74} width={50} outline className={styles.amberIcon} />
          <text x="8" y="108" className={styles.sceneNote}>
            Leo’s stamp
          </text>
          <text x="62" y="90" className={styles.sceneLabel}>
            ✓
          </text>
        </>
      )}
      {step === 2 && (
        <>
          <Lock weight="duotone" x={120} y={58} size={40} className={styles.amberIcon} />
          <StampShape x={166} y={70} width={48} outline className={styles.amberIcon} />
          <text x="166" y="104" className={styles.sceneNote}>
            Emi’s stamp
          </text>
        </>
      )}
    </svg>
  );
}

function MailboxSteps() {
  const [step, setStep] = useState(0);
  return (
    <figure className={styles.widget} aria-label="A Bitcoin payment in three steps">
      <Mailbox step={step} />
      <p className={styles.story} aria-live="polite">
        <strong>
          {step + 1}. {MAIL_STEPS[step].title}.
        </strong>{' '}
        {MAIL_STEPS[step].text}
      </p>
      <div className={styles.widgetActions} role="group" aria-label="Steps">
        {MAIL_STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            className={i === step ? styles.stepOn : styles.stepBtn}
            aria-pressed={i === step}
            onClick={() => setStep(i)}
            {...guide('article.mailbox.step', String(i + 1))}
          >
            Step {i + 1}
          </button>
        ))}
      </div>
    </figure>
  );
}

// ─── Many notebooks: a node's three jobs ─────────────────────────────────────

const JOBS = [
  { name: 'Store', text: 'a full copy of every payment since 2009', Icon: Database },
  { name: 'Relay', text: 'pass each new payment on to its neighbours', Icon: ShareNetwork },
  {
    name: 'Verify',
    text: 'check it against the rules, and drop any that break them',
    Icon: ShieldCheck,
  },
] as const;

function NodeJobs() {
  return (
    <figure className={styles.widget} aria-label="The three jobs every node does">
      <ol className={styles.tiles}>
        {JOBS.map(({ name, text, Icon }) => (
          <li key={name} className={styles.tile}>
            <Icon weight="duotone" size={32} className={styles.system} aria-hidden="true" />
            <strong className={styles.tileName}>{name}</strong>
            <span className={styles.tileText}>{text}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

// ─── Gossip: 1 node, then 8, then 64 ─────────────────────────────────────────

const CENTRE = 100;
const ring = (count: number, radius: number, turn = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * 2 * Math.PI + turn;
    return { x: CENTRE + radius * Math.cos(a), y: CENTRE + radius * Math.sin(a) };
  });
/** Ring 1: the 8 neighbours; ring 2: their 64, drawn as two staggered circles of 32 */
const GOSSIP_RINGS = [ring(8, 34), [...ring(32, 64), ...ring(32, 84, Math.PI / 32)]] as const;
const GOSSIP_STORY = [
  'One node hears about Sofia’s payment and checks it.',
  'It tells its 8 neighbours, who check it too.',
  'They tell theirs: 64, then everyone, usually within seconds.',
] as const;
const GOSSIP_MS = 800;

function Gossip() {
  const reduced = useReducedMotion();
  /** 0: only the first node knows; 1: its 8 neighbours; 2: the 64 after them */
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);

  const busy = running && step < 2;

  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setStep(step + 1), GOSSIP_MS);
    return () => window.clearTimeout(timer);
  }, [busy, step]);

  const send = () => {
    if (reduced) {
      setStep(2);
      return;
    }
    setStep(0);
    setRunning(true);
  };

  return (
    <figure className={styles.widget} aria-label="A payment spreading from node to node">
      <svg viewBox="0 0 200 200" className={styles.gossip} aria-hidden="true" focusable="false">
        {GOSSIP_RINGS.map((dots, r) =>
          dots.map((d, i) => (
            <circle
              key={`${r}-${i}`}
              cx={d.x}
              cy={d.y}
              r={r === 0 ? 6 : 3.5}
              className={step > r ? styles.dotLit : styles.dot}
            />
          ))
        )}
        <circle cx={CENTRE} cy={CENTRE} r={9} className={styles.dotLit} />
      </svg>
      <p className={styles.story} aria-live="polite" data-step={step}>
        {GOSSIP_STORY[step]}
      </p>
      <div className={styles.widgetActions}>
        <button
          type="button"
          className={styles.primary}
          disabled={busy}
          onClick={send}
          {...guide('article.gossip.send')}
        >
          {step === 2 ? 'Send again' : 'Send a payment'}
        </button>
        <span className={styles.counter}>1 → 8 → 64 → everyone</span>
      </div>
    </figure>
  );
}

// ─── Check 1: a balance is what the history adds up to ───────────────────────

const SOFIA_HISTORY = [
  { day: 'Mon', amount: 5 },
  { day: 'Tue', amount: 3 },
  { day: 'Wed', amount: -2 },
] as const;
const SOFIA_HAS = SOFIA_HISTORY.reduce((sum, h) => sum + h.amount, 0);
const SOFIA_TRIES = 9;

function BalanceHistory() {
  const [tried, setTried] = useState(false);
  return (
    <figure className={styles.widget} aria-label="Sofia’s balance, added up from her history">
      <ol className={styles.coins}>
        {SOFIA_HISTORY.map((h) => (
          <li key={h.day} className={styles.coin}>
            <span className={h.amount > 0 ? styles.plus : styles.minus}>
              {h.amount > 0 ? `+${h.amount}` : `−${-h.amount}`}
            </span>
            <span className={styles.coinDay}>{h.day}</span>
          </li>
        ))}
        <li className={`${styles.coin} ${styles.coinTotal}`}>
          <span>= {SOFIA_HAS}</span>
          <span className={styles.coinDay}>she has</span>
        </li>
      </ol>
      <p className={tried ? styles.alert : styles.story} role="status">
        {tried
          ? `✗ Rejected by every node: ${SOFIA_TRIES} is more than ${SOFIA_HAS}.`
          : 'Nodes add up what the ledger says she received and spent.'}
      </p>
      <div className={styles.widgetActions}>
        <button
          type="button"
          className={styles.primary}
          aria-pressed={tried}
          onClick={() => setTried((t) => !t)}
          {...guide('article.balance.try')}
        >
          {tried ? 'Start over' : `Sofia tries to send ${SOFIA_TRIES}`}
        </button>
      </div>
    </figure>
  );
}

// ─── Check 2: the stamp and the stamp-checker ────────────────────────────────

type StampTry = 'sofia' | 'sam' | 'edit';
const STAMP_TRIES: Record<
  StampTry,
  { button: string; message: string; mark: 'sofia' | 'sam'; ok: boolean; result: string }
> = {
  sofia: {
    button: 'Sofia stamps',
    message: 'Send 2 to Leo',
    mark: 'sofia',
    ok: true,
    result: '✓ Matches Sofia’s checker: every node passes it on.',
  },
  sam: {
    button: 'Sneaky Sam stamps',
    message: 'Send 2 to Leo',
    mark: 'sam',
    ok: false,
    result: '✗ Not Sofia’s mark: every node drops it.',
  },
  edit: {
    button: 'Sam edits the amount',
    message: 'Send 20 to Sam',
    mark: 'sofia',
    ok: false,
    result: '✗ The mark no longer fits the message: dropped.',
  },
};
const STAMP_ORDER: readonly StampTry[] = ['sofia', 'sam', 'edit'];

/**
 * The owner's sketch (2026-11-08): the stamp is a solid shape, the checker the same shape in outline.
 * Sofia's stamp drops into the checker exactly; Sam's has other notches and jams; an edited message
 * leaves Sofia's mark out of line. The shapes live in `stamp.ts`, shared with the lesson cards.
 */
/** Where the stamp sits: resting below the checker, seated in it, jammed short, or out of line */
type Pose = 'rest' | 'seat' | 'jam' | 'shift';
const POSE: Record<StampTry, Pose> = { sofia: 'seat', sam: 'jam', edit: 'shift' };

/** A small copy of a stamp's mark, printed on the payment slip */
function Mark({ who }: { who: 'sofia' | 'sam' }) {
  return (
    <svg
      viewBox="0 0 100 40"
      className={styles.mark}
      role="img"
      aria-label={who === 'sofia' ? 'Sofia’s mark' : 'Sam’s mark'}
    >
      <path d={STAMP_SHAPES[who]} className={who === 'sofia' ? styles.stampFill : styles.samFill} />
    </svg>
  );
}

function StampCheck() {
  const [tried, setTried] = useState<StampTry | null>(null);
  const t = tried ? STAMP_TRIES[tried] : null;
  const pose: Pose = tried ? POSE[tried] : 'rest';
  return (
    <figure className={styles.widget} aria-label="Sofia’s stamp and the stamp-checker">
      <div className={styles.stampMessage} data-tried={tried ?? 'none'}>
        <span>“{t?.message ?? 'Send 2 to Leo'}”</span>
        {t && <Mark who={t.mark} />}
      </div>
      <svg viewBox="0 0 230 124" className={styles.stampScene} aria-hidden="true" focusable="false">
        <g className={styles.stamp} data-pose={pose}>
          <path
            d={STAMP_SHAPES[t?.mark ?? 'sofia']}
            className={t?.mark === 'sam' ? styles.samFill : styles.stampFill}
          />
        </g>
        {/* The checker on top: a stamp that fits fills its outline exactly */}
        <g transform="translate(8 14)">
          <path d={STAMP_SHAPES.sofia} className={styles.checkerLine} />
        </g>
        <text x="122" y="20" className={styles.sceneLabel}>
          stamp checker
        </text>
        <text x="122" y="33" className={styles.sceneNote}>
          <tspan x="122">public key:</tspan>
          <tspan x="122" dy="11">
            everyone has one
          </tspan>
        </text>
        <text x="122" y="88" className={styles.sceneLabel}>
          {t?.mark === 'sam' ? 'Sam’s stamp' : 'stamp'}
        </text>
        <text x="122" y="101" className={styles.sceneNote}>
          {t?.mark === 'sam' ? (
            <>
              <tspan x="122">not Sofia’s</tspan>
              <tspan x="122" dy="11">
                private key
              </tspan>
            </>
          ) : (
            <>
              <tspan x="122">private key:</tspan>
              <tspan x="122" dy="11">
                only Sofia has it
              </tspan>
            </>
          )}
        </text>
      </svg>
      <p className={styles.srOnly}>
        Sofia’s stamp is her private key. The checker, her public key, has exactly its shape in
        outline.
      </p>
      <p className={t ? (t.ok ? styles.okLine : styles.alert) : styles.story} role="status">
        {t ? t.result : 'Pick who stamps the payment.'}
      </p>
      <div className={styles.widgetActions} role="group" aria-label="Who stamps">
        {STAMP_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={tried === id ? styles.stepOn : styles.stepBtn}
            aria-pressed={tried === id}
            onClick={() => setTried(id)}
            {...guide('article.stamp.try', id)}
          >
            {STAMP_TRIES[id].button}
          </button>
        ))}
      </div>
    </figure>
  );
}

// ─── Pages that seal each other ──────────────────────────────────────────────

const BLOCKS = [
  { line: 'Start → Sofia 5', seal: 'a3f9' },
  { line: 'Sofia → Leo 2', seal: '7c21', changed: { line: 'Sofia → Leo 20', seal: 'd40e' } },
  { line: 'Leo → Emi 3', seal: 'e04b' },
  { line: 'Emi → Sofia 4', seal: '59d8' },
] as const;
const CHANGED_BLOCK = 1;

function BlockChain() {
  const [changed, setChanged] = useState(false);
  return (
    <figure className={styles.widget} aria-label="Blocks sealed to each other">
      <ol className={styles.chain}>
        {BLOCKS.map((b, i) => {
          const edited = changed && 'changed' in b ? b.changed : null;
          const broken = changed && i > CHANGED_BLOCK;
          return (
            <li
              key={b.seal}
              className={`${styles.block}${broken ? ` ${styles.blockBroken}` : ''}`}
              data-broken={broken}
            >
              <span className={styles.blockName}>Block {i + 1}</span>
              <span className={edited ? styles.sun : undefined}>{edited?.line ?? b.line}</span>
              {i > 0 && (
                <span className={styles.coinDay}>
                  previous seal {BLOCKS[i - 1].seal}
                  {broken && i === CHANGED_BLOCK + 1 ? ' ✗' : ''}
                </span>
              )}
              <span className={styles.seal}>seal {edited?.seal ?? b.seal}</span>
            </li>
          );
        })}
      </ol>
      <p className={changed ? styles.alert : styles.story} role="status">
        {changed
          ? '✗ Block 2’s seal changed, so block 3 no longer matches it: every later page breaks, and every node sees it.'
          : 'Each block carries the seal of the one before it.'}
      </p>
      <div className={styles.widgetActions}>
        <button
          type="button"
          className={styles.primary}
          disabled={changed}
          onClick={() => setChanged(true)}
          {...guide('article.chain.change')}
        >
          Change an old line
        </button>
        <button
          type="button"
          className={styles.link}
          onClick={() => setChanged(false)}
          {...guide('article.chain.reset')}
        >
          Reset
        </button>
      </div>
    </figure>
  );
}

// ─── Nora's four problems, answered ──────────────────────────────────────────

const ANSWERS = [
  {
    id: 'print',
    problem: 'Print coins',
    answer: 'New coins only come from mining, on a schedule every node checks.',
    Icon: Coins,
  },
  {
    id: 'move',
    problem: 'Move your coins',
    answer: 'Only a mark from your private key moves them.',
    Icon: ArrowsLeftRight,
  },
  {
    id: 'rewrite',
    problem: 'Rewrite history',
    answer: 'Every block seals the one before; redoing the work costs too much.',
    Icon: Eraser,
  },
  {
    id: 'lose',
    problem: 'Lose everything',
    answer: 'Tens of thousands of copies: losing one changes nothing.',
    Icon: Coffee,
  },
] as const;

function NoraAnswered() {
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const flip = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <figure className={styles.widget} aria-label="Nora’s four problems and the network’s answers">
      <p className={styles.story}>
        With one Nora she could… Tap a tile to see the network’s answer.
      </p>
      <div className={styles.answers}>
        {ANSWERS.map(({ id, problem, answer, Icon }) => {
          const on = flipped.has(id);
          return (
            <button
              key={id}
              type="button"
              className={on ? styles.answerOn : styles.answer}
              aria-pressed={on}
              onClick={() => flip(id)}
              {...guide('article.answer.tile', id)}
            >
              <Icon
                weight="duotone"
                size={28}
                className={on ? styles.system : styles.amberIcon}
                aria-hidden="true"
              />
              <strong className={styles.tileName}>{problem}</strong>
              {/* Both faces are always in the page; the hidden one is only out of sight */}
              <span className={on ? styles.tileText : styles.srOnly}>{answer}</span>
            </button>
          );
        })}
      </div>
    </figure>
  );
}

// ─── Mailboxes and keys: two things, two rules ───────────────────────────────

/** Leo's address: shown on his tile's example and in the public ledger */
const LEO_ADDRESS = 'bc1q…7f9a';

const ADDRESS_KEY = [
  {
    name: 'Address',
    Icon: MailboxIcon,
    tone: styles.system,
    does: 'A mailbox slot: anyone can pay in.',
    like: 'Like your home address.',
    /** What a real one looks like (owner 2026-11-08); the same one the public ledger shows below */
    example: true,
    share: '✓ Share it: it’s safe.',
    safe: true,
  },
  {
    name: 'Private key',
    Icon: null,
    tone: styles.amberIcon,
    does: 'The only key that opens the box, and the stamp on every payment.',
    like: 'Like your house key and password in one.',
    example: false,
    share: '✗ Never share it, with anyone.',
    safe: false,
  },
] as const;

function AddressKey() {
  return (
    <figure className={styles.widget} aria-label="An address and a private key">
      <ol className={`${styles.tiles} ${styles.tilesTwo}`}>
        {ADDRESS_KEY.map(({ name, Icon, tone, does, like, example, share, safe }) => (
          <li key={name} className={styles.tile}>
            {Icon ? (
              <Icon weight="duotone" size={32} className={tone} aria-hidden="true" />
            ) : (
              <StampShape width={48} outline className={tone} />
            )}
            <strong className={styles.tileName}>{name}</strong>
            <span className={styles.tileText}>{does}</span>
            <span className={styles.tileText}>{like}</span>
            {example && (
              <span className={styles.tileText}>
                A real one is a long string such as{' '}
                <code className={styles.seal}>{LEO_ADDRESS}</code>, often shown as a QR code.
              </span>
            )}
            <span className={safe ? styles.shareOk : styles.shareNo}>{share}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

// ─── Your bitcoin isn't in your phone ─────────────────────────────────────────

type Loss = 'phone' | 'all' | 'scam';
// Owner 2026-11-12: no coins pictured, as in Lesson 2: what you hold is entries in the ledger
type Holding = 'phone' | 'words' | 'ledger';

const HOLDINGS: readonly { id: Holding; name: string; note: string; Icon: typeof Notebook }[] = [
  { id: 'phone', name: 'Your phone', note: 'holds the key', Icon: DeviceMobile },
  { id: 'words', name: 'Recovery words', note: 'back up the key', Icon: ListNumbers },
  { id: 'ledger', name: 'Your bitcoin', note: 'entries in the ledger', Icon: Notebook },
];

const LOSSES: Record<
  Loss,
  { button: string; lost: Record<Holding, string | null>; ok: boolean; result: string }
> = {
  phone: {
    button: 'Lose your phone',
    lost: { phone: '✗ lost', words: null, ledger: null },
    ok: true,
    result: '✓ Type your recovery words into a new phone: the key is back, and so is your bitcoin.',
  },
  all: {
    button: 'Lose phone and words',
    lost: { phone: '✗ lost', words: '✗ lost', ledger: '✗ locked forever' },
    ok: false,
    result: '✗ Nobody can open the box any more: not you, not the wallet company, not anyone.',
  },
  scam: {
    button: '“Support” asks for your words',
    lost: { phone: null, words: '✗ handed over', ledger: '✗ moved by the scammer' },
    ok: false,
    result:
      '✗ A scam: whoever has the words controls the bitcoin. Nothing was hacked; the key was given away.',
  },
};
const LOSS_ORDER: readonly Loss[] = ['phone', 'all', 'scam'];

function KeyScenarios() {
  const [loss, setLoss] = useState<Loss | null>(null);
  const l = loss ? LOSSES[loss] : null;
  return (
    <figure className={styles.widget} aria-label="What each loss means for your bitcoin">
      <ol className={styles.holdings}>
        {HOLDINGS.map(({ id, name, note, Icon }) => {
          const lost = l?.lost[id] ?? null;
          return (
            <li key={id} className={lost ? styles.holdingLost : styles.holding} data-lost={!!lost}>
              <Icon
                weight="duotone"
                size={30}
                className={id === 'phone' ? styles.system : styles.amberIcon}
                aria-hidden="true"
              />
              <strong className={styles.tileName}>{name}</strong>
              <span className={lost ? styles.shareNo : styles.tileText}>{lost ?? note}</span>
            </li>
          );
        })}
      </ol>
      <p className={l ? (l.ok ? styles.okLine : styles.alert) : styles.story} role="status">
        {l ? l.result : 'Pick what goes wrong.'}
      </p>
      <div className={styles.widgetActions} role="group" aria-label="What goes wrong">
        {LOSS_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={loss === id ? styles.stepOn : styles.stepBtn}
            aria-pressed={loss === id}
            onClick={() => setLoss(id)}
            {...guide('article.scenario.try', id)}
          >
            {LOSSES[id].button}
          </button>
        ))}
      </div>
    </figure>
  );
}

// ─── Public, but not named ───────────────────────────────────────────────────

const PUBLIC_LINES = [
  { from: LEO_ADDRESS, to: 'bc1q…2c41', amount: '0.010' },
  { from: 'bc1q…88d0', to: LEO_ADDRESS, amount: '0.004' },
  { from: LEO_ADDRESS, to: 'bc1q…e51b', amount: '0.002' },
] as const;

function Who({ address, linked }: { address: string; linked: boolean }) {
  return (
    <>
      {address}
      {linked && address === LEO_ADDRESS && <strong className={styles.nameTag}> Leo</strong>}
    </>
  );
}

function PublicLedger() {
  const [linked, setLinked] = useState(false);
  return (
    <figure className={styles.widget} aria-label="The public ledger, with and without a name">
      <table className={styles.table}>
        <caption className={styles.caption}>The public ledger: anyone can read every line</caption>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">BTC</th>
          </tr>
        </thead>
        <tbody>
          {PUBLIC_LINES.map((line) => (
            <tr key={`${line.from}-${line.to}`}>
              <td>
                <Who address={line.from} linked={linked} />
              </td>
              <td>
                <Who address={line.to} linked={linked} />
              </td>
              <td className={styles.sun}>{line.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={linked ? styles.alert : styles.story} role="status">
        {linked
          ? `An exchange checked Leo’s ID when he bought, so ${LEO_ADDRESS} is now Leo: every line with it is traced to him, past and future.`
          : `Who is ${LEO_ADDRESS}? The ledger doesn’t say.`}
      </p>
      <div className={styles.widgetActions}>
        <button
          type="button"
          className={styles.primary}
          aria-pressed={linked}
          onClick={() => setLinked((v) => !v)}
          {...guide('article.ledger.link')}
        >
          {linked ? 'Start over' : 'An exchange checks Leo’s ID'}
        </button>
      </div>
    </figure>
  );
}

// ─── Bitcoin's first steps: the timeline ─────────────────────────────────────

/**
 * Owner 2026-11-12: the story article's three dates as a rail, each with its picture. Block 0's
 * headline is real (Bitcoin Wiki, "Genesis block", in the article's sources); the pizza photo is
 * Lesson 1's, whose rights the owner holds
 */
const TIMELINE = [
  {
    date: '31 October 2008',
    picture: 'paper',
    text: (
      <>
        Someone, or some group, using the name <strong>Satoshi Nakamoto</strong> publishes the
        Bitcoin paper. Nobody knows who it is to this day.
      </>
    ),
  },
  {
    date: '3 January 2009',
    picture: 'block',
    text: (
      <>
        The network starts. Its first block, block 0, carries a real newspaper headline:{' '}
        <em>“The Times 03/Jan/2009 Chancellor on brink of second bailout for banks”</em>.
      </>
    ),
  },
  {
    date: '22 May 2010',
    picture: 'pizza',
    text: (
      <>
        A programmer pays 10,000 bitcoin for two pizzas, one of the first times bitcoin buys
        something real. The day is now called Bitcoin Pizza Day.{' '}
        {/* Credited as in Lesson 1, where the photo first appears */}
        <span className={styles.timelineCredit}>Photo: Laszlo Hanyecz</span>
      </>
    ),
  },
] as const;

function TimelinePicture({ picture }: { picture: (typeof TIMELINE)[number]['picture'] }) {
  if (picture === 'paper') {
    return <FileText weight="duotone" size={30} className={styles.system} aria-hidden="true" />;
  }
  if (picture === 'block') {
    return <img src={CRYPTO_ICON_URLS.BTC} alt="" className={styles.timelineMark} />;
  }
  return (
    <img
      src={pizzaDayThumb}
      alt="Laszlo Hanyecz at a table with two children and two large pizzas."
      className={styles.timelinePhoto}
      loading="lazy"
    />
  );
}

function BitcoinTimeline() {
  return (
    <figure className={styles.widget} aria-label="Bitcoin’s first steps">
      <ol className={styles.timeline}>
        {TIMELINE.map(({ date, picture, text }, i) => (
          <li key={date} className={styles.timelineEntry} data-drop={i}>
            <span className={styles.timelineDot} aria-hidden="true" />
            <div className={styles.timelineHead}>
              <span className={styles.timelinePicture} data-picture={picture}>
                <TimelinePicture picture={picture} />
              </span>
              <strong className={styles.timelineDate}>{date}</strong>
            </div>
            <p className={styles.timelineText}>{text}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}

// ─── Mining: the race to seal the next block ─────────────────────────────────

/**
 * Owner 2026-11-12: four miners guess numbers until one gives the block a fingerprint (hash) starting
 * with zeros; that block seals onto the chain and its miner is paid. A sketch: real fingerprints are
 * 64 characters and real miners try trillions of guesses a second, so here a winner comes on round 3.
 * The reward is 3.125 bitcoin since the April 2024 halving (bitcoin-story's sources)
 */
const MINERS = ['Miner A', 'Miner B', 'Miner C', 'Miner D'] as const;
const WIN_ROUND = 3;
const WINNER = 2;

/** A made-up but steady guess and fingerprint for a miner in a round (never starting 0000 by chance) */
function miningGuess(round: number, miner: number): { guess: number; hash: string } {
  let h = 2166136261 ^ (round * 97 + miner * 31);
  const hex: string[] = [];
  for (let i = 0; i < 6; i++) {
    h = Math.imul(h ^ (h >>> 13), 16777619) >>> 0;
    hex.push((h & 0xff).toString(16).padStart(2, '0'));
  }
  const guess = 10000 + (h % 89999);
  const won = round === WIN_ROUND && miner === WINNER;
  const tail = hex.join('').slice(4, 8);
  // A losing fingerprint starts with a letter, so it never looks like a win
  const hash = won ? `0000${tail}` : `${'abcdef'[h % 6]}${hex.join('').slice(1, 8)}`;
  return { guess, hash };
}

function MiningRace() {
  const [round, setRound] = useState(0);
  const won = round >= WIN_ROUND;
  const status =
    round === 0
      ? 'Payments are waiting. Press Try a guess.'
      : won
        ? '✓ Miner C found a fingerprint starting 0000. Every node checks it with one calculation, the block is sealed onto the chain, and Miner C is paid 3.125 new bitcoin plus the fees.'
        : `Round ${round}: no fingerprint starts with 0000 yet. Real miners make trillions of guesses a second.`;
  return (
    <figure className={styles.widget} aria-label="Miners racing to seal the next block">
      <p className={styles.miningPending}>
        Waiting to be recorded: <code className={styles.seal}>Sofia → Leo, 2</code>{' '}
        <code className={styles.seal}>Emi → Sam, 1</code> …
      </p>
      <ol className={styles.miners}>
        {MINERS.map((name, i) => {
          const g = round > 0 ? miningGuess(Math.min(round, WIN_ROUND), i) : null;
          const win = won && i === WINNER;
          return (
            <li key={name} className={win ? styles.minerWin : styles.miner} data-win={win}>
              <strong className={styles.tileName}>{name}</strong>
              <span className={styles.tileText}>{g ? `guess ${g.guess}` : 'ready'}</span>
              <code className={styles.seal}>{g ? `${g.hash}…` : '········'}</code>
              <span aria-hidden="true">{g ? (win ? '✓' : '✗') : ''}</span>
            </li>
          );
        })}
      </ol>
      {won && (
        <p className={styles.miningBlock}>
          <span className={styles.miningChain} aria-hidden="true">
            ▭ ─ ▭ ─ <span className={styles.miningNew}>▣</span>
          </span>{' '}
          New block sealed to the one before. Reward: 3.125 new bitcoin + the fees.
        </p>
      )}
      <p className={won ? styles.okLine : styles.story} role="status">
        {status}
      </p>
      <div className={styles.widgetActions}>
        <button
          type="button"
          className={styles.stepBtn}
          disabled={won}
          onClick={() => setRound((r) => r + 1)}
          {...guide('article.mining.guess')}
        >
          Try a guess
        </button>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => setRound(0)}
          {...guide('article.mining.reset')}
        >
          Start over
        </button>
      </div>
    </figure>
  );
}

// ─── Sell into the queue (How an exchange sets the price, 2026-11-12) ────────

interface Level {
  price: number;
  size: number;
}

/** Made-up queues: a busy one, a cent apart, and a thin one with gaps between its offers */
const BUSY_BIDS: readonly Level[] = [100, 99.99, 99.98, 99.97, 99.96].map((price) => ({
  price,
  size: 5,
}));
const THIN_BIDS: readonly Level[] = [
  { price: 100, size: 1 },
  { price: 99, size: 1 },
  { price: 97, size: 2 },
  { price: 94, size: 2 },
  { price: 90, size: 4 },
];
const QUEUE_LIMIT = 97;

/** Each coin's sale price, best bid first, never below `limit` (the rest waits unsold) */
function sellInto(queue: readonly Level[], coins: number, limit?: number): number[] {
  const fills: number[] = [];
  for (const level of queue) {
    if (limit !== undefined && level.price < limit) break;
    for (let i = 0; i < level.size && fills.length < coins; i++) fills.push(level.price);
  }
  return fills;
}

const usd = (n: number, digits = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function QueueColumn({
  name,
  queue,
  fills,
}: {
  name: string;
  queue: readonly Level[];
  fills: number[];
}) {
  // How many coins each level sold, best bid first
  const takenAt = queue.map((level, i) => {
    const before = queue.slice(0, i).reduce((n, l) => n + l.size, 0);
    return Math.max(0, Math.min(level.size, fills.length - before));
  });
  const avg = fills.length ? fills.reduce((a, b) => a + b, 0) / fills.length : 0;
  const last = fills.at(-1);
  return (
    <li className={styles.tile}>
      <strong className={styles.tileName}>{name}</strong>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Bid</th>
            <th scope="col">Waiting</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((level, i) => {
            const taken = takenAt[i];
            return (
              <tr key={level.price}>
                <td className={styles.plus}>{usd(level.price)}</td>
                <td>
                  <s className={styles.eaten} aria-label={`${taken} sold`}>
                    {'▮'.repeat(taken)}
                  </s>
                  <span aria-label={`${level.size - taken} left`}>
                    {'▮'.repeat(level.size - taken)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {last !== undefined && (
        <span className={styles.tileText}>
          Average {usd(avg, 3)} · worst {usd(last)} ·{' '}
          <span className={last < 100 ? styles.minus : undefined}>
            slippage −{usd(((100 - last) / 100) * 100, 2)}%
          </span>
        </span>
      )}
    </li>
  );
}

function EatTheQueue() {
  const [coins, setCoins] = useState(6);
  const [limit, setLimit] = useState(false);
  const busy = sellInto(BUSY_BIDS, coins, limit ? QUEUE_LIMIT : undefined);
  const thin = sellInto(THIN_BIDS, coins, limit ? QUEUE_LIMIT : undefined);
  const unsold = coins - thin.length;
  const status = `Thin queue: your ${thin.length} coin${thin.length === 1 ? '' : 's'} sold at ${thin
    .map((p) => usd(p, 0))
    .join(', ')}. The price on everyone’s screen is now ${usd(thin.at(-1) ?? 100, 0)}.${
    unsold > 0 ? ` ${unsold} wait unsold: a limit sets the worst price you accept.` : ''
  }`;
  return (
    <figure
      className={styles.widget}
      aria-label="Sell the same amount into a busy queue and a thin one"
    >
      <label className={styles.story} htmlFor="queue-size">
        Sell how many coins? <strong>{coins}</strong>
      </label>
      <input
        id="queue-size"
        type="range"
        min={1}
        max={10}
        value={coins}
        aria-valuetext={`Sell ${coins} coins`}
        className={styles.range}
        onChange={(e) => setCoins(Number(e.target.value))}
        {...guide('article.queue.size')}
      />
      <ul className={`${styles.tiles} ${styles.tilesTwo}`}>
        <QueueColumn name="Busy" queue={BUSY_BIDS} fills={busy} />
        <QueueColumn name="Thin" queue={THIN_BIDS} fills={thin} />
      </ul>
      <p className={styles.story} role="status">
        {status}
      </p>
      <div className={styles.widgetActions}>
        <button
          type="button"
          className={limit ? styles.stepOn : styles.stepBtn}
          aria-pressed={limit}
          onClick={() => setLimit((l) => !l)}
          {...guide('article.queue.limit')}
        >
          Set a limit at {QUEUE_LIMIT}
        </button>
      </div>
      <figcaption className={styles.caption}>
        Made-up numbers. Every price starts at 100.00.
      </figcaption>
    </figure>
  );
}

// ─── Build a candle from its deals (Candles, news and big swings) ────────────

/** Made-up deals in two one-minute slots: one ends green, one red */
const CANDLE_MINUTES: readonly (readonly number[])[] = [
  [64010, 64060, 63940, 63980, 64120, 64090],
  [64090, 64150, 64030, 63900, 63960, 63920],
];

function CandleBuilder() {
  const reduced = useReducedMotion();
  const [minute, setMinute] = useState(0);
  const [deals, setDeals] = useState(1);
  const all = CANDLE_MINUTES[minute];
  const seen = all.slice(0, deals);
  const open = seen[0];
  const close = seen.at(-1) ?? open;
  const high = Math.max(...seen);
  const low = Math.min(...seen);
  const done = deals === all.length;
  const up = close >= open;
  // The y scale covers both minutes, so the candle grows inside a steady frame
  const top = 64200;
  const bottom = 63850;
  const y = (v: number) => 10 + ((top - v) / (top - bottom)) * 140;
  const body = {
    y: y(Math.max(open, close)),
    h: Math.max(y(Math.min(open, close)) - y(Math.max(open, close)), 2),
  };
  const fmt = (n: number) => n.toLocaleString('en-US');
  const status = done
    ? `${up ? '▲ Closed higher than it opened: green.' : '▼ Closed lower than it opened: red.'} That’s all a candle says. Open ${fmt(open)}, high ${fmt(high)}, low ${fmt(low)}, close ${fmt(close)}.`
    : `Deal ${deals} of ${all.length}: ${fmt(close)}. Open ${fmt(open)}, high ${fmt(high)}, low ${fmt(low)}, close so far ${fmt(close)}.`;
  return (
    <figure className={styles.widget} aria-label="A candle drawn deal by deal">
      <div className={styles.candleRow}>
        <svg viewBox="0 0 120 160" className={styles.candleSvg} aria-hidden="true">
          <g className={done ? (up ? styles.plus : styles.minus) : styles.system}>
            <line
              x1="40"
              x2="40"
              y1={y(high)}
              y2={y(low)}
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <rect
              x="26"
              y={body.y}
              width="28"
              height={body.h}
              rx="2"
              fill="currentColor"
              className={reduced ? undefined : styles.candleGrow}
            />
          </g>
          <text x="62" y={y(high) + 4} className={styles.candleLabel}>
            {high === low ? 'Open' : 'High'}
          </text>
          {y(low) - y(high) > 12 && (
            <text x="62" y={y(low) + 4} className={styles.candleLabel}>
              Low
            </text>
          )}
        </svg>
        <ol className={styles.dealList}>
          {all.map((p, i) => (
            <li key={i} className={i < deals ? styles.dealOn : styles.dealOff}>
              {i < deals ? fmt(p) : '·····'}
              {i === 0 && i < deals ? ' (open)' : ''}
              {i === deals - 1 && i > 0 ? (done ? ' (close)' : ' (latest)') : ''}
            </li>
          ))}
        </ol>
      </div>
      <p className={done ? styles.okLine : styles.story} role="status">
        {status}
      </p>
      <div className={styles.widgetActions}>
        {done ? (
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => {
              setMinute((m) => (m + 1) % CANDLE_MINUTES.length);
              setDeals(1);
            }}
            {...guide('article.candle.next')}
          >
            Try another minute
          </button>
        ) : (
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => setDeals((d) => d + 1)}
            {...guide('article.candle.next')}
          >
            Next deal
          </button>
        )}
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => {
            setMinute(0);
            setDeals(1);
          }}
          {...guide('article.candle.reset')}
        >
          Start over
        </button>
      </div>
      <figcaption className={styles.caption}>Made-up deals in one minute.</figcaption>
    </figure>
  );
}

// ─── Same swing, different sizes (Candles, news and big swings) ──────────────

/** Bybit BTCUSDT perpetual daily, 19 May 2021 (checked 2026-11-12) */
const MAY_19 = { open: 42903.5, low: 28801, close: 36727 } as const;
const SWING_SIZES = [50, 100, 500, 1000] as const;

/** What a trade bought at the open is worth at the low or the close, to the cent */
function swingValue(size: number, at: 'low' | 'close'): number {
  return Math.round(((size * MAY_19[at]) / MAY_19.open) * 100) / 100;
}

function SwingSizer() {
  const [size, setSize] = useState<number>(100);
  const [at, setAt] = useState<'low' | 'close'>('low');
  const value = swingValue(size, at);
  const pct = ((MAY_19[at] / MAY_19.open - 1) * 100).toFixed(1).replace('-', '−');
  return (
    <figure className={styles.widget} aria-label="One day's swing at different trade sizes">
      <p className={styles.story}>Bitcoin, 19 May 2021, bought at the open ($42,903.50).</p>
      <div className={styles.widgetActions} role="group" aria-label="Trade size">
        {SWING_SIZES.map((n) => (
          <button
            key={n}
            type="button"
            className={size === n ? styles.stepOn : styles.stepBtn}
            aria-pressed={size === n}
            onClick={() => setSize(n)}
            {...guide('article.swing.size', String(n))}
          >
            ${usd(n, 0)}
          </button>
        ))}
      </div>
      <div className={styles.widgetActions} role="group" aria-label="When">
        {(['low', 'close'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={at === m ? styles.stepOn : styles.stepBtn}
            aria-pressed={at === m}
            onClick={() => setAt(m)}
            {...guide('article.swing.moment', m)}
          >
            {m === 'low' ? 'At the low' : 'At the close'}
          </button>
        ))}
      </div>
      <p className={styles.story} role="status">
        ${usd(size)} became ${usd(value)} {at === 'low' ? 'at the low' : 'at the close'}:{' '}
        <span className={styles.minus}>
          −${usd(Math.round((size - value) * 100) / 100)} ({pct}%)
        </span>
        .
      </p>
      <p className={styles.okLine}>
        The swing was the same {pct}% for everyone. Only the size was yours to choose.
      </p>
      <p className={styles.story}>A typical day in 2025, from high to low (Bybit):</p>
      <ul className={styles.swingBars}>
        <li>
          <span>Bitcoin</span>
          <span className={styles.swingBar} style={{ width: '30%' }} aria-hidden="true" />
          <span>about 3%</span>
        </li>
        <li>
          <span>Dogecoin</span>
          <span className={styles.swingBar} style={{ width: '65%' }} aria-hidden="true" />
          <span>about 6.5%</span>
        </li>
      </ul>
    </figure>
  );
}

// ─── Red flag or not? (Check before you trust) ──────────────────────────────

const SCAM_STATEMENTS: readonly { text: string; flag: boolean; why: string }[] = [
  {
    text: 'The team is anonymous: no names, no company.',
    flag: true,
    why: 'Nobody can be held to account if the money disappears.',
  },
  {
    text: 'The website promises 2% a day.',
    flag: true,
    why: 'No honest project promises a fixed return. A promise is a warning, not a reason.',
  },
  {
    text: 'A test sale of $1 fails: “selling paused”.',
    flag: true,
    why: 'If you can’t sell it, you don’t really have it. That was the Squid Game trap.',
  },
  {
    text: 'Its price rose 80% this week.',
    flag: false,
    why: 'Not a red flag on its own, but no proof either: a rise only means people traded. Squid rose too.',
  },
  {
    text: 'A celebrity posted about it.',
    flag: false,
    why: 'Not a red flag on its own, but popularity proves nothing about who runs it or whether you can sell.',
  },
  {
    text: 'It trades on a large exchange with a busy order book.',
    flag: false,
    why: 'A good sign that you could sell, though still no guarantee the coin is worth anything.',
  },
];

const RED_FLAGS = SCAM_STATEMENTS.filter((s) => s.flag).length;

function ScamCheck() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(boolean | undefined)[]>([]);
  const item = SCAM_STATEMENTS[index];
  const answer = answers[index];
  const answered = answers.filter((a) => a !== undefined).length;
  const all = answered === SCAM_STATEMENTS.length;
  const pick = (flag: boolean) =>
    setAnswers((a) => {
      const next = [...a];
      next[index] = flag;
      return next;
    });
  return (
    <figure className={styles.widget} aria-label="Red flag or not: a made-up coin">
      <p className={styles.story}>
        <strong>PupCoin</strong> (made up, not a real coin) · statement {index + 1} of{' '}
        {SCAM_STATEMENTS.length}
      </p>
      <p className={styles.scamStatement}>“{item.text}”</p>
      <div className={styles.widgetActions}>
        {([true, false] as const).map((flag) => (
          <button
            key={String(flag)}
            type="button"
            className={answer === flag ? styles.stepOn : styles.stepBtn}
            aria-pressed={answer === flag}
            onClick={() => pick(flag)}
            {...guide('article.scam.flag', flag ? 'red' : 'not')}
          >
            {flag ? 'Red flag' : 'Not a red flag'}
          </button>
        ))}
      </div>
      <p className={answer === undefined ? styles.story : styles.okLine} role="status">
        {answer === undefined
          ? 'Your call: red flag, or not?'
          : `${answer === item.flag ? '✓' : '•'} ${item.flag ? 'Red flag.' : 'Not a red flag.'} ${item.why}`}
      </p>
      {all && <p className={styles.alert}>{RED_FLAGS} red flags. One is enough to walk away.</p>}
      <div className={styles.widgetActions}>
        <button
          type="button"
          className={styles.stepBtn}
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          ← Back
        </button>
        <button
          type="button"
          className={styles.stepBtn}
          disabled={index === SCAM_STATEMENTS.length - 1}
          onClick={() => setIndex((i) => i + 1)}
          {...guide('article.scam.next')}
        >
          Next →
        </button>
      </div>
    </figure>
  );
}

export function ArticleWidget({ id }: { id: WidgetId }) {
  switch (id) {
    case 'suncoin-notebook':
      return <SunCoinNotebook />;
    case 'nora-cheats':
      return <NoraCheats />;
    case 'nora-edits':
      return <NoraCheats copiesCheck={false} />;
    case 'order-book':
      return <OrderBook />;
    case 'mailbox-steps':
      return <MailboxSteps />;
    case 'node-jobs':
      return <NodeJobs />;
    case 'gossip':
      return <Gossip />;
    case 'balance-history':
      return <BalanceHistory />;
    case 'stamp-check':
      return <StampCheck />;
    case 'block-chain':
      return <BlockChain />;
    case 'nora-answered':
      return <NoraAnswered />;
    case 'address-key':
      return <AddressKey />;
    case 'key-scenarios':
      return <KeyScenarios />;
    case 'public-ledger':
      return <PublicLedger />;
    case 'bitcoin-timeline':
      return <BitcoinTimeline />;
    case 'eat-the-queue':
      return <EatTheQueue />;
    case 'candle-builder':
      return <CandleBuilder />;
    case 'swing-sizer':
      return <SwingSizer />;
    case 'scam-check':
      return <ScamCheck />;
    case 'mining-race':
      return <MiningRace />;
  }
}
