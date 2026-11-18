/**
 * The private key as a stamp (the owner's sketch, 2026-11-08): a solid shape, and its checker, the
 * public key, the same shape in outline. One picture for the key wherever it appears, in the
 * articles and on the lesson cards. Paths are in a 100 × 40 box.
 */
export const STAMP_SHAPES = {
  sofia:
    'M2 38 V16 C2 6 7 2 13 2 C19 2 24 6 24 14 V18 H40 L37 9 L63 3 L65 17 L86 10 L97 34 Q98 38 93 38 Z',
  sam: 'M2 38 V9 L17 3 L23 18 H35 C35 8 46 8 46 18 H58 L61 5 L81 5 L84 22 H97 V38 Z',
  /** Leo's own stamp (owner 2026-11-08): a peak, a round bump and a tall tooth, unlike Emi's */
  leo: 'M2 38 V22 L14 6 L26 22 V14 C26 5 40 5 40 14 V24 H52 V6 H66 V24 C73 17 84 17 90 25 L97 38 Z',
} as const;

export type StampOwner = keyof typeof STAMP_SHAPES;

export const STAMP_BOX = { width: 100, height: 40 } as const;
