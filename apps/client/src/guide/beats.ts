/** The cold open's counter (CardBeats): pure helpers, no React */

export const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'long',
  maximumFractionDigits: 0,
});

/** "$41", "$41 thousand", "$1 billion" */
export function formatDollars(value: number): string {
  return `$${compact.format(value)}`;
}

/**
 * The counter's value at `t` (0 → 1): it grows by the same factor each moment, so the learner sees
 * hundreds, thousands and millions go by instead of a jump straight to the end
 */
export function counterValue(from: number, to: number, t: number): number {
  return from * Math.pow(to / from, Math.min(Math.max(t, 0), 1));
}
