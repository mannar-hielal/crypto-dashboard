import { describe, expect, it } from 'vitest';
import {
  canDriveTimeSync,
  followerCrosshairPrice,
  isPanePushingData,
  isTimeSyncPeer,
  runPaneDataPush,
} from '../chartSync';

// Regression: time-range sync used to (a) copy a low-interval pane's window
// onto 4h/1D/1W/1M panes and (b) broadcast the few-minutes-wide range of a pane
// that hadn't loaded its history yet (just mounted by a layout change, or just
// switched symbol/interval) — both left every peer showing a few giant candles.

const HOUR = 3600;
const bars = (n: number, start = 1_790_000_000) =>
  Array.from({ length: n }, (_, i) => ({ time: start + i * HOUR }));
const loaded = (n: number) => ({ loaded: true, bars: n });

describe('isTimeSyncPeer', () => {
  const panes = [{ interval: '1m' }, { interval: '1m' }, { interval: '4h' }];

  it('syncs panes on the same interval', () => {
    expect(isTimeSyncPeer(panes, 0, 1)).toBe(true);
  });

  it('does not sync panes on different intervals', () => {
    expect(isTimeSyncPeer(panes, 0, 2)).toBe(false);
    expect(isTimeSyncPeer(panes, 2, 1)).toBe(false);
  });

  it('does not sync with a pane that does not exist', () => {
    expect(isTimeSyncPeer(panes, 0, 3)).toBe(false);
  });
});

describe('canDriveTimeSync', () => {
  const data = bars(1000);
  const first = data[0].time;
  const last = data[data.length - 1].time;
  const normal = { from: last - 60 * HOUR, to: last + 5 * HOUR };

  it('allows a normal range over loaded history', () => {
    expect(canDriveTimeSync(data, normal, loaded(1000))).toBe(true);
  });

  it('allows a live bar landing between the store and chart updates', () => {
    expect(canDriveTimeSync(data, normal, loaded(1001))).toBe(true);
  });

  it('blocks a pane whose REST history has not loaded yet', () => {
    // The WS cold snapshot grows with server uptime — 60 bars after an hour —
    // so no bar-count threshold can tell it apart from real history.
    const cold = bars(60);
    const t = cold[cold.length - 1].time;
    expect(
      canDriveTimeSync(cold, { from: t - 12 * HOUR, to: t }, { loaded: false, bars: 60 })
    ).toBe(false);
  });

  it('blocks a pane whose chart has not caught up with the loaded history', () => {
    // Store already holds 1000 bars; the chart still shows the 12-bar snapshot.
    const cold = bars(12);
    const t = cold[cold.length - 1].time;
    expect(canDriveTimeSync(cold, { from: t - 12 * HOUR, to: t }, loaded(1000))).toBe(false);
  });

  it('blocks a degenerate (single-instant) range', () => {
    expect(canDriveTimeSync(data, { from: last, to: last }, loaded(1000))).toBe(false);
  });

  it('blocks a range wholly in the empty future padding', () => {
    expect(canDriveTimeSync(data, { from: last + HOUR, to: last + 60 * HOUR }, loaded(1000))).toBe(
      false
    );
  });

  it('blocks a range wholly before the loaded history', () => {
    expect(
      canDriveTimeSync(data, { from: first - 60 * HOUR, to: first - HOUR }, loaded(1000))
    ).toBe(false);
  });

  it('blocks a pane with no series data', () => {
    expect(canDriveTimeSync(undefined, { from: first, to: last }, loaded(0))).toBe(false);
  });
});

describe('runPaneDataPush', () => {
  // lightweight-charts fires visible-range events synchronously inside
  // setData(); a range fired mid-push must never be broadcast to peers.
  it('marks only that pane as pushing, only during the push', () => {
    const seen: boolean[] = [];
    runPaneDataPush(1, () => {
      seen.push(isPanePushingData(1), isPanePushingData(0));
    });
    expect(seen).toEqual([true, false]);
    expect(isPanePushingData(1)).toBe(false);
  });

  it('clears the mark even when the push throws', () => {
    expect(() =>
      runPaneDataPush(2, () => {
        throw new Error('setData failed');
      })
    ).toThrow('setData failed');
    expect(isPanePushingData(2)).toBe(false);
  });
});

describe('[10.6.11] followerCrosshairPrice', () => {
  const base = { mapY: () => 101, barClose: () => 99, followerLatest: 100 };

  it('should map the mouse y through the follower when the mouse is in the price pane', () => {
    expect(followerCrosshairPrice({ ...base, sourcePaneIndex: 0 })).toBe(101);
    expect(followerCrosshairPrice({ ...base, sourcePaneIndex: undefined })).toBe(101);
  });

  it('should use the bar close when the mouse is in an indicator pane (its y is pane-relative)', () => {
    let mapped = false;
    const mapY = () => {
      mapped = true;
      return 101;
    };
    expect(followerCrosshairPrice({ ...base, mapY, sourcePaneIndex: 2 })).toBe(99);
    expect(mapped).toBe(false);
  });

  it('should fall back to the latest price with no bar at that time', () => {
    expect(followerCrosshairPrice({ ...base, sourcePaneIndex: 1, barClose: () => undefined })).toBe(
      100
    );
  });

  it('should use the bar close when the mapped price is implausible for the follower', () => {
    expect(followerCrosshairPrice({ ...base, sourcePaneIndex: 0, mapY: () => 500 })).toBe(99);
    expect(followerCrosshairPrice({ ...base, sourcePaneIndex: 0, mapY: () => null })).toBe(99);
  });
});
