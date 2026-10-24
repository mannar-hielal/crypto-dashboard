/**
 * The interactive pieces inside knowledge-base articles (knowledge-base plan, owner 2026-10-23),
 * rebuilt in our tokens from the owner's SunCoin and mailbox demos. Doing replaces reading: press,
 * edit, step, and watch what happens. SunCoin is amber; money in and out is green and red, always
 * with a + or − so colour is never the only signal.
 */

import { useState } from 'react';
import {
  ArrowRight,
  Key,
  Lock,
  Mailbox as MailboxIcon,
  Notebook,
  QrCode,
} from '@phosphor-icons/react';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { guide } from '@/lib/guideAnchors';
import type { WidgetId } from './articles';
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

function NoraCheats() {
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
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={copies}
          onChange={(e) => setCopies(e.target.checked)}
          {...guide('article.nora.copies')}
        />
        <span>Many notebooks: five friends each keep a copy</span>
      </label>
      {copies && (
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
  { title: 'Leo sends bitcoin to it', text: 'His wallet signs the payment; nodes check it.' },
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
        </>
      )}
      {step === 2 && (
        <>
          <Lock weight="duotone" x={120} y={58} size={40} className={styles.amberIcon} />
          <Key weight="duotone" x={170} y={64} size={40} className={styles.amberIcon} />
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

export function ArticleWidget({ id }: { id: WidgetId }) {
  switch (id) {
    case 'suncoin-notebook':
      return <SunCoinNotebook />;
    case 'nora-cheats':
      return <NoraCheats />;
    case 'order-book':
      return <OrderBook />;
    case 'mailbox-steps':
      return <MailboxSteps />;
  }
}
