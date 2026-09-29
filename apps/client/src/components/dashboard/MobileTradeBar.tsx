/**
 * The Buy / Sell bar at the bottom of the dashboard below the lg breakpoint (phones and tablets),
 * where the order form isn't docked beside the chart: each button opens the form on that side,
 * like Bybit's mobile trade page. Phone trading: owner, 2026-09-29.
 */

import { bg, color, fontSize } from '@/lib/tokens';
import { guide } from '@/lib/guideAnchors';

interface MobileTradeBarProps {
  onTrade: (side: 'buy' | 'sell') => void;
}

export function MobileTradeBar({ onTrade }: MobileTradeBarProps) {
  return (
    <div
      className="flex w-full shrink-0 gap-2 border-t border-white/6 px-3 py-2"
      style={{ background: bg.panel }}
    >
      <button
        type="button"
        {...guide('trade.mobile.buy')}
        onClick={() => onTrade('buy')}
        className="flex-1 rounded-md py-2.5 font-bold"
        // Dark text: 9.8:1 on the green (white would be ~2:1)
        style={{ background: color.green, color: bg.page, fontSize: fontSize.sm }}
      >
        Buy / Long
      </button>
      <button
        type="button"
        {...guide('trade.mobile.sell')}
        onClick={() => onTrade('sell')}
        className="flex-1 rounded-md py-2.5 font-bold"
        style={{ background: color.red, color: bg.page, fontSize: fontSize.sm }}
      >
        Sell / Short
      </button>
    </div>
  );
}
