import type { ISeriesPrimitive, SeriesAttachedParameter } from 'lightweight-charts';

/**
 * CompositeRenderer — batch multiple ISeriesPrimitive renderers
 * into a single one. Mirrors TradingView's pattern of appending
 * renderers to a CompositeRenderer and delegating lifecycle calls.
 */
export class CompositeRenderer implements ISeriesPrimitive {
  private renderers: ISeriesPrimitive[] = [];

  append(r: ISeriesPrimitive): void {
    this.renderers.push(r);
  }

  remove(r: ISeriesPrimitive): void {
    const idx = this.renderers.indexOf(r);
    if (idx !== -1) this.renderers.splice(idx, 1);
  }

  clear(): void {
    this.renderers = [];
  }

  attached(params: SeriesAttachedParameter): void {
    for (const r of this.renderers) {
      r.attached?.(params);
    }
  }

  detached(): void {
    for (const r of this.renderers) {
      r.detached?.();
    }
  }

  updateAllViews(): void {
    for (const r of this.renderers) {
      r.updateAllViews?.();
    }
  }

  renderer(): unknown {
    return null;
  }
}
