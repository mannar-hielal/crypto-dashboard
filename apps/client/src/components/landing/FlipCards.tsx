import { useId, useRef, useState } from 'react';
import { PencilLine } from 'lucide-react';

import { FLIP_CARDS, type FlipCard } from '@/lib/howItWorksContent';
import { SHOTS } from './featureShots';
import styles from './FlipCards.module.css';

function Shot({ shot }: { shot: FlipCard['shot'] }) {
  const img = SHOTS[shot];
  // A faded crop of the real app behind the face: decorative, the words say it all
  return (
    <img
      className={styles.shot}
      src={img.src}
      width={img.width}
      height={img.height}
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}

function Card({ card }: { card: FlipCard }) {
  const textId = useId();
  // A mouse flips a card on hover and a keyboard on focus (both in CSS); a finger (no hover) flips it by a
  // tap. Both faces are always in the page for a crawler; a screen reader gets the front as the button's
  // name and the back (its title and its text) as the description, so the button carries no pressed state
  const [flipped, setFlipped] = useState(false);
  // Only a finger or a pen turns the card by a tap; a mouse turns it by hover, so its click does nothing
  const touched = useRef(false);
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.card}
        data-flipped={flipped}
        aria-label={`${card.value} ${card.label}`.trim()}
        aria-describedby={textId}
        onPointerDown={(e) => {
          touched.current = e.pointerType !== 'mouse';
        }}
        onClick={() => {
          // One tap, one turn: the next click that is not a tap (the keyboard's Enter) turns nothing
          if (touched.current) setFlipped((f) => !f);
          touched.current = false;
        }}
      >
        <span className={styles.flip} aria-hidden="true">
          <span className={`${styles.face} ${styles.front}`}>
            <Shot shot={card.shot} />
            <span className={styles.frontBody}>
              {card.icon === 'drawing' ? (
                <PencilLine className={styles.icon} aria-hidden="true" />
              ) : (
                <span className={styles.value}>{card.value}</span>
              )}
              <span className={styles.label}>{card.label}</span>
            </span>
          </span>
          <span className={`${styles.face} ${styles.back}`}>
            <Shot shot={card.shot} />
            <span id={textId} className={styles.backBody}>
              <span className={styles.title}>{card.title}</span>
              <span className={styles.text}>{card.text}</span>
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The chart section's cards (owner 2026-11-24): a big figure in front, and when a card is hovered (or
 * tapped, or focused) it turns over to the plain explanation on a faded capture of the app. Both faces
 * are in the page for a crawler, and a screen reader hears the front as the name and the back as the
 * description; with reduced motion the faces cross-fade instead.
 */
export function FlipCards() {
  return (
    <ul className={styles.grid} aria-label="Facts about the chart and the practice account">
      {FLIP_CARDS.map((c) => (
        <Card key={c.id} card={c} />
      ))}
    </ul>
  );
}
