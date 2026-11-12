import type { ReactNode } from 'react';

/**
 * A line with one part of it set apart in `<strong>`: a cold open's headline ("10,000 bitcoin"),
 * a story line's name ("Satoshi Nakamoto"). The plain text when there is no emphasis, or it isn't
 * in the line
 */
export function emphasize(text: string, emphasis?: string, className?: string): ReactNode {
  const at = emphasis ? text.indexOf(emphasis) : -1;
  if (!emphasis || at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <strong className={className}>{emphasis}</strong>
      {text.slice(at + emphasis.length)}
    </>
  );
}
