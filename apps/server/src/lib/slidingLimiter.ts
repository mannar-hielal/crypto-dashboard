/**
 * 🔐 A sliding-window counter, in memory, for the limits the route plugin cannot express (a limit
 * per account, a limit across everyone). Bounded: at most `maxKeys` keys are kept, the expired ones
 * dropped first and then the oldest, so a flood of distinct keys cannot grow it without end.
 * One process only: with several machines each has its own window, which still bounds each.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(max: number, windowMs: number, maxKeys = 10_000) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  /** Counts a hit and answers whether it is within the limit (a refused hit is not counted) */
  allow(key: string, now: number = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.delete(key); // re-inserted last: the Map's order is then oldest-used first
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.trim(now);
    return true;
  }

  /** Gives back the most recent hit of a key (the work it counted for did not happen) */
  refund(key: string): void {
    const hits = this.hits.get(key);
    if (!hits) return;
    hits.pop();
    if (hits.length === 0) this.hits.delete(key);
  }

  private trim(now: number): void {
    for (const [k, v] of this.hits) {
      if (v.every((t) => t <= now - this.windowMs)) this.hits.delete(k);
    }
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }

  reset(): void {
    this.hits.clear();
  }

  get size(): number {
    return this.hits.size;
  }
}
