import { Link } from 'react-router';

import { guide } from '@/lib/guideAnchors';
import { font } from '@/lib/tokens';
import styles from './AccountUnlocksTerminal.module.css';

// ─── Content ─────────────────────────────────────────────────────────────────
// What a free account adds to the open chart. Each row is a shipped feature — keep it true:
// order types (TradingPanel), TP/SL trigger source, perps 1–10× cross/isolated (MAX_LEVERAGE),
// spot, history tabs, journal notes, and the server-side matching engine.

const UNLOCKS = [
  { key: 'orders', value: 'market · limit · stop' },
  { key: 'exits', value: 'tp/sl · trigger last | mark | index' },
  { key: 'perps', value: 'long/short · 1–10x · cross | isolated' },
  { key: 'spot', value: 'buy · sell what you hold' },
  { key: 'history', value: 'orders · closed p&l · balance log' },
  { key: 'journal', value: 'notes on every trade' },
  { key: 'engine', value: 'fills 24/7, tab open or not' },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

/** Landing band under the hero: what a free account unlocks, styled as a terminal window. */
export function AccountUnlocksTerminal() {
  return (
    <section className={styles.band} aria-labelledby="account-unlocks-heading">
      <h2 id="account-unlocks-heading" className={styles.heading}>
        The chart's free. So is the trading desk.
      </h2>

      <div className={styles.terminal} style={{ fontFamily: font.mono }}>
        <div className={styles.titleBar}>
          <span className={`${styles.dot} ${styles.dotRed}`} aria-hidden="true" />
          <span className={`${styles.dot} ${styles.dotAmber}`} aria-hidden="true" />
          <span className={`${styles.dot} ${styles.dotGreen}`} aria-hidden="true" />
          <span className={styles.path}>~/cryptopapertrade</span>
        </div>

        <div className={styles.body}>
          <p className={styles.command}>
            <span className={styles.prompt} aria-hidden="true">
              ${' '}
            </span>
            account --create --free
          </p>

          <dl className={styles.list}>
            {UNLOCKS.map((u) => (
              <div key={u.key} className={styles.row}>
                <dt className={styles.key}>
                  <span className={styles.check} aria-hidden="true">
                    ✓
                  </span>
                  {u.key}
                </dt>
                <dd className={styles.value}>{u.value}</dd>
              </div>
            ))}
          </dl>

          <div className={styles.footer}>
            <Link to="/register" className={styles.cta} {...guide('landing.unlocks.register')}>
              Create free account →
            </Link>
            <span className={styles.balance}>$10,000 virtual balance</span>
          </div>
        </div>
      </div>
    </section>
  );
}
