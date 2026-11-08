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
  ListNumbers,
  Lock,
  Mailbox as MailboxIcon,
  Notebook,
  QrCode,
  ShareNetwork,
  ShieldCheck,
} from '@phosphor-icons/react';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { guide } from '@/lib/guideAnchors';
import type { WidgetId } from './articles';
import { StampShape } from './StampShape';
import { STAMP_SHAPES } from './stamp';
import { NOTEBOOK, balancesAfter, copiesAgreeing, ledgerTotal, PEOPLE } from './suncoin';
import styles from './ArticleDrawer.module.css';

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

// ─── Your coins aren't in your phone ─────────────────────────────────────────

type Loss = 'phone' | 'all' | 'scam';
type Holding = 'phone' | 'words' | 'coins';

const HOLDINGS: readonly { id: Holding; name: string; note: string; Icon: typeof Coins }[] = [
  { id: 'phone', name: 'Your phone', note: 'holds the key', Icon: DeviceMobile },
  { id: 'words', name: 'Recovery words', note: 'back up the key', Icon: ListNumbers },
  { id: 'coins', name: 'Your coins', note: 'on the blockchain', Icon: Coins },
];

const LOSSES: Record<
  Loss,
  { button: string; lost: Record<Holding, string | null>; ok: boolean; result: string }
> = {
  phone: {
    button: 'Lose your phone',
    lost: { phone: '✗ lost', words: null, coins: null },
    ok: true,
    result: '✓ Type your recovery words into a new phone: the key, and the coins, are back.',
  },
  all: {
    button: 'Lose phone and words',
    lost: { phone: '✗ lost', words: '✗ lost', coins: '✗ locked forever' },
    ok: false,
    result: '✗ Nobody can open the box any more: not you, not the wallet company, not anyone.',
  },
  scam: {
    button: '“Support” asks for your words',
    lost: { phone: null, words: '✗ handed over', coins: '✗ moved by the scammer' },
    ok: false,
    result:
      '✗ A scam: whoever has the words controls the coins. Nothing was hacked; the key was given away.',
  },
};
const LOSS_ORDER: readonly Loss[] = ['phone', 'all', 'scam'];

function KeyScenarios() {
  const [loss, setLoss] = useState<Loss | null>(null);
  const l = loss ? LOSSES[loss] : null;
  return (
    <figure className={styles.widget} aria-label="What each loss means for your coins">
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
  }
}
