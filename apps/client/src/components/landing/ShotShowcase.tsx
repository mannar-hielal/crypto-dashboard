import { SHOTS, type Shot } from '@/lib/landingContent';
import chartShot from '@/assets/landing/shot-chart.webp';
import styles from './ShotShowcase.module.css';

// A real capture of the running app (Playwright, 2026-11-22), a throwaway account, no personal data,
// 1100 px wide WebP. The size is the image's own, so the page never jumps while it loads.
const IMAGES: Record<Shot['id'], { src: string; width: number; height: number }> = {
  chart: { src: chartShot, width: 1100, height: 510 },
};

function Frame({ shot }: { shot: Shot }) {
  const img = IMAGES[shot.id];
  return (
    <figure className={styles.figure}>
      <div className={styles.device}>
        <div className={styles.bar} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>
        <img
          src={img.src}
          width={img.width}
          height={img.height}
          alt={shot.alt}
          loading="lazy"
          decoding="async"
          className={styles.image}
        />
      </div>
      <figcaption className={styles.caption}>
        <strong>{shot.title}.</strong> {shot.caption}
      </figcaption>
    </figure>
  );
}

/** One frame on its own, for the How it works page */
export function SingleShot({ id }: { id: Shot['id'] }) {
  const shot = SHOTS.find((s) => s.id === id);
  return shot ? (
    <div className={styles.single}>
      <Frame shot={shot} />
    </div>
  ) : null;
}
