import { STAMP_BOX, STAMP_SHAPES, type StampOwner } from './stamp';

interface StampShapeProps {
  /** Whose stamp: each owner's has its own notches (default: the one the articles started with) */
  who?: StampOwner;
  /** Position inside a parent SVG; leave out in HTML */
  x?: number;
  y?: number;
  width: number;
  /** Draw the checker's outline on top: a stamp seated in its checker */
  outline?: boolean;
  /** Fill the stamp; off with `outline` draws the checker alone (the public key) */
  filled?: boolean;
  /** Sets the colour (currentColor), e.g. the amber of keys */
  className?: string;
}

/** The private key, drawn as a stamp; the words beside it carry the meaning */
export function StampShape({
  who = 'sofia',
  x,
  y,
  width,
  outline = false,
  filled = true,
  className,
}: StampShapeProps) {
  const height = (width * STAMP_BOX.height) / STAMP_BOX.width;
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`0 0 ${STAMP_BOX.width} ${STAMP_BOX.height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
      data-stamp={who}
    >
      {filled && <path d={STAMP_SHAPES[who]} fill="currentColor" fillOpacity={0.7} />}
      {outline && (
        <path
          d={STAMP_SHAPES[who]}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
