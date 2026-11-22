import { PATH_SHOTS, SHOTS, type Shot } from '@/lib/landingContent';
import chartShot from '@/assets/landing/shot-chart.webp';
import deskShot from '@/assets/landing/shot-desk.webp';
import lessonShot from '@/assets/landing/shot-lesson.webp';
import pathDesktop from '@/assets/landing/shot-path-desktop.webp';
import pathPhone from '@/assets/landing/shot-path-phone.webp';
import styles from './ShotShowcase.module.css';

// Real captures of the running app (Playwright, 2026-11-22), a throwaway account, no personal data,
// 1100 px wide WebP. Sizes are the images' own, so the page never jumps while they load.
const IMAGES: Record<Shot['id'], { src: string; width: number; height: number }> = {
  chart: { src: chartShot, width: 1100, height: 510 },
  desk: { src: deskShot, width: 1100, height: 657 },
  lesson: { src: lessonShot, width: 1100, height: 657 },
};

function Frame({ shot, wide }: { shot: Shot; wide?: boolean }) {
  const img = IMAGES[shot.id];
  return (
    <figure className={`${styles.figure}${wide ? ` ${styles.wide}` : ''}`}>
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

/** The Crypto path opened: beside the chart on a desktop, and the phone's full screen next to it */
function PathFrames() {
  const { desktop, phone } = PATH_SHOTS;
  return (
    <div className={styles.pathRow}>
      <figure className={`${styles.figure} ${styles.pathDesktop}`}>
        <div className={styles.device}>
          <div className={styles.bar} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
          <img
            src={pathDesktop}
            width={1100}
            height={688}
            alt={desktop.alt}
            loading="lazy"
            decoding="async"
            className={styles.image}
          />
        </div>
        <figcaption className={styles.caption}>
          <strong>{desktop.title}.</strong> {desktop.caption}
        </figcaption>
      </figure>
      <figure className={`${styles.figure} ${styles.pathPhone}`}>
        <div className={`${styles.device} ${styles.phoneBody}`}>
          <img
            src={pathPhone}
            width={520}
            height={1125}
            alt={phone.alt}
            loading="lazy"
            decoding="async"
            className={styles.image}
          />
        </div>
        <figcaption className={styles.caption}>
          <strong>{phone.title}.</strong> {phone.caption}
        </figcaption>
      </figure>
    </div>
  );
}

/** Three real screenshots in device frames: the chart, the practice desk and a lesson */
export function ShotShowcase() {
  const [chart, ...rest] = SHOTS;
  return (
    <div className={styles.grid}>
      {chart && <Frame shot={chart} wide />}
      {rest.map((s) => (
        <Frame key={s.id} shot={s} />
      ))}
      <PathFrames />
    </div>
  );
}

/** One frame on its own, for the features page */
export function SingleShot({ id }: { id: Shot['id'] }) {
  const shot = SHOTS.find((s) => s.id === id);
  return shot ? (
    <div className={styles.single}>
      <Frame shot={shot} />
    </div>
  ) : null;
}
