import { LineStyle } from 'lightweight-charts';
import type { IPriceLine, ISeriesApi, SeriesType } from 'lightweight-charts';
import { chart as chartTokens } from '@/lib/tokens';

/**
 * The dashed zero line of an oscillator pane (MACD, Momentum, ROC — owner, 2026-10-03). A price
 * line on one of the pane's series: unlike a full-length zero series it never stretches the
 * autoscale and the crosshair never snaps to it.
 */
export function addZeroLine(series: ISeriesApi<SeriesType>): IPriceLine {
  return series.createPriceLine({
    price: 0,
    color: chartTokens.zeroLine,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    lineVisible: true,
    axisLabelVisible: false,
    title: '',
  });
}
