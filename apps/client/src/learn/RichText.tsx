/**
 * The one inline renderer for our own text (owner 2026-11-17: `**word**` showed its asterisks in the
 * lessons): articles, lesson cards, the guides' lines, quizzes and recaps. `**bold**` runs as
 * <strong>, `*italic*` as <em>, a `[[term]]` through `renderTerm` (its plain label without one).
 * Everything else stays plain text: it is never parsed as HTML.
 */

import { Fragment, type ReactNode } from 'react';
import { parseInline } from './terms';

interface RichTextProps {
  text: string;
  /** A term as the surface shows it (a lesson's peek button); its label alone when not given */
  renderTerm?: (label: string, concept: string) => ReactNode;
}

export function RichText({ text, renderTerm }: RichTextProps) {
  return (
    <>
      {parseInline(text).map((seg, i) => {
        // Plain runs need no key; a styled run's key is its kind, place and words (a text never
        // changes under the same renderer, so the place is stable)
        if (seg.concept) {
          return (
            <Fragment key={`t:${i}:${seg.concept}`}>
              {renderTerm ? renderTerm(seg.text, seg.concept) : seg.text}
            </Fragment>
          );
        }
        if (seg.bold) return <strong key={`b:${i}:${seg.text}`}>{seg.text}</strong>;
        if (seg.em) return <em key={`i:${i}:${seg.text}`}>{seg.text}</em>;
        return seg.text;
      })}
    </>
  );
}
