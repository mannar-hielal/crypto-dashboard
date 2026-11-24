import type { ReactNode } from 'react';

import styles from './TechLogos.module.css';

// Small one-colour marks of the tools the app is built with, drawn here as simple shapes (no logo
// files, no icon package). Each tile carries the tool's name; the shape is decoration.
const MARKS: Record<string, ReactNode> = {
  React: (
    <>
      <circle cx="12" cy="12" r="1.8" className={styles.solid} />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" />
    </>
  ),
  Vite: <path d="M13.5 2 5 13.5h5.5L9.5 22 19 9.5h-5.8z" />,
  'Tailwind CSS': (
    <>
      <path d="M3 9.5c1.3-3.2 3.2-4.6 5.7-4.2 1.9.3 2.4 2.1 4 2.6 1.6.5 3-.3 4.5-2.4-1.3 3.2-3.2 4.6-5.7 4.2-1.9-.3-2.4-2.1-4-2.6C5.9 6.6 4.5 7.4 3 9.5z" />
      <path d="M3 17c1.3-3.2 3.2-4.6 5.7-4.2 1.9.3 2.4 2.1 4 2.6 1.6.5 3-.3 4.5-2.4-1.3 3.2-3.2 4.6-5.7 4.2-1.9-.3-2.4-2.1-4-2.6C5.9 14.1 4.5 14.9 3 17z" />
    </>
  ),
  TypeScript: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7.5 11h5M10 11v7M16.5 11.2c-.8-.6-2.7-.7-2.7.6 0 1.8 3 1 3 2.8 0 1.4-2.1 1.5-3.1.6" />
    </>
  ),
  'Node.js': (
    <>
      <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" />
      <path d="M9 15.5v-6.8l6 6.8V8.5" />
    </>
  ),
  Fastify: (
    <>
      <path d="m4 6 6 6-6 6" />
      <path d="m11 6 6 6-6 6" />
      <path d="M19 6v12" />
    </>
  ),
  Prisma: (
    <>
      <path d="M4.5 16.5 12 3l7.5 15.5L12 21z" />
      <path d="M12 3v18" />
    </>
  ),
  PostgreSQL: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.8" />
      <path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" />
      <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
    </>
  ),
  Redis: (
    <>
      <path d="m12 3 8.5 3.2L12 9.5 3.5 6.2z" />
      <path d="m3.5 11 8.5 3.2 8.5-3.2" />
      <path d="m3.5 15.8 8.5 3.2 8.5-3.2" />
    </>
  ),
  Bybit: (
    <>
      <path d="M5 4v16M5 4h6.5a3.5 3.5 0 0 1 0 7H5m0 0h7.5a4.5 4.5 0 0 1 0 9H5" />
      <path d="M19 4v7" />
    </>
  ),
};

/** A row of floating logo tiles for one layer of the stack picture */
export function TechLogos({ names }: { names: readonly string[] }) {
  return (
    <ul className={styles.tiles} aria-label="Built with">
      {names.map((n) => (
        <li key={n} className={styles.tile}>
          <svg viewBox="0 0 24 24" className={styles.mark} aria-hidden="true" focusable="false">
            {MARKS[n] ?? null}
          </svg>
          <span className={styles.name}>{n}</span>
        </li>
      ))}
    </ul>
  );
}
