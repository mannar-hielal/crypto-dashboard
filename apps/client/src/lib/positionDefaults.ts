/**
 * A new Long / Short Position drawing's risk inputs, from the account instead of TradingView's stock
 * defaults (account 1000, leverage 10000, qty floored to whole units): the paper balance, the
 * symbol's leverage (Spot 1×) and the qty step's decimals, read from the active pane when the tool is
 * placed. Risk stays TradingView's 25 %. The library merges this over its factory style
 * (`setDefaultStyleOverride`, set by ChartPanel).
 */

import type { DrawingStyle } from 'lightweight-charts-drawing';
import { cachedInstrument } from '@/hooks/useInstruments';
import { stepDecimals } from '@/lib/priceFormat';
import { useLayoutStore } from '@/store/layoutStore';
import { leverageFor, usePaperStore } from '@/store/paperStore';

export function positionDefaultStyle(kind: string): DrawingStyle | undefined {
  if (kind !== 'long-position' && kind !== 'short-position') return undefined;
  const layout = useLayoutStore.getState();
  const pane = layout.panes[layout.activePane];
  if (!pane) return undefined;
  const paper = usePaperStore.getState();
  const style: Partial<DrawingStyle> = {
    leverage: pane.category === 'spot' ? 1 : leverageFor(paper, pane.symbol),
    // 3 decimals until the market's rules have loaded
    qtyPrecision: String(stepDecimals(cachedInstrument(pane.category, pane.symbol)?.qtyStep ?? 0)),
  };
  // Signed out (or an empty account) keeps the factory account size
  if (paper.balance > 0) style.accountSize = Math.floor(paper.balance * 100) / 100;
  return style as DrawingStyle;
}
