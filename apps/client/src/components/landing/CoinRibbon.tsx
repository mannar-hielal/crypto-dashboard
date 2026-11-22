import { useState } from 'react';

import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { COINS } from '@/lib/landingContent';
import styles from './CoinRibbon.module.css';

type CoinSymbol = (typeof COINS)[number]['symbol'];

function Coin({ symbol, name, twin }: { symbol: CoinSymbol; name: string; twin?: boolean }) {
  return (
    <li
      className={`${styles.coin}${twin ? ` ${styles.twin}` : ''}`}
      {...(twin && { 'aria-hidden': true })}
    >
      <img
        src={CRYPTO_ICON_URLS[symbol]}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        decoding="async"
        className={styles.icon}
      />
      <span className={styles.name}>{name}</span>
      <span className={styles.symbol}>{symbol}</span>
    </li>
  );
}

/**
 * A slow ribbon of the nine coins you can practise on. The list is real (the first copy is the
 * accessible one); a second, hidden copy makes the loop seamless. With `prefers-reduced-motion` it
 * stops and wraps into a still row, and the copy is dropped.
 */
export function CoinRibbon() {
  // WCAG 2.2.2: a loop that runs over five seconds needs a way to pause it, by keyboard and touch too
  const [paused, setPaused] = useState(false);
  return (
    <div className={`${styles.wrap}${paused ? ` ${styles.paused}` : ''}`}>
      {/* Outside the masked, clipped ribbon, so its focus ring and its text are never cut or faded.
          The label changes with the state, so it carries no aria-pressed (a toggle keeps one label) */}
      <button type="button" className={styles.pause} onClick={() => setPaused((p) => !p)}>
        {paused ? 'Play the coin ticker' : 'Pause the coin ticker'}
      </button>
      <div className={styles.ribbon}>
        <ul className={styles.track} aria-label="The nine coins you can practise on">
          {COINS.map((c) => (
            <Coin key={c.symbol} {...c} />
          ))}
          {COINS.map((c) => (
            <Coin key={`twin-${c.symbol}`} {...c} twin />
          ))}
        </ul>
      </div>
    </div>
  );
}
