/**
 * RTL helpers for guide anchors: query a rendered tree by `data-guide` (and a row's
 * `data-guide-key`), the same way Playwright and the tour find controls.
 */

import { guideSelector, type GuideAnchor } from '@/lib/guideAnchors';

export function queryByGuide(container: ParentNode, anchor: GuideAnchor, key?: string) {
  return container.querySelector<HTMLElement>(guideSelector(anchor, key));
}

export function getByGuide(container: ParentNode, anchor: GuideAnchor, key?: string): HTMLElement {
  const el = queryByGuide(container, anchor, key);
  if (!el) throw new Error(`No element with guide anchor ${anchor}${key ? ` (${key})` : ''}`);
  return el;
}
