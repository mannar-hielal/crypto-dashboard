import { afterEach, describe, expect, it } from 'vitest';
import { paneStores } from '../paneStore';

// historyLoaded gates which panes may drive multi-pane time-range sync — a
// pane still on the WS cold snapshot (or the previous symbol's bars) must
// never broadcast its visible range. See lib/chartSync.ts.
describe('paneStore historyLoaded', () => {
  const store = paneStores[0];
  afterEach(() => store.getState().reset());

  it('starts false', () => {
    expect(store.getState().historyLoaded).toBe(false);
  });

  it('is set by setHistoryLoaded', () => {
    store.getState().setHistoryLoaded(true);
    expect(store.getState().historyLoaded).toBe(true);
  });

  it('is not implied by receiving bars (a WS snapshot is not full history)', () => {
    store.getState().setSnapshot(
      [
        {
          timestamp: 1_790_000_000_000,
          open: 1,
          high: 2,
          low: 0.5,
          close: 1.5,
          volume: 1,
          quoteAssetVolume: 1,
        },
      ],
      null
    );
    expect(store.getState().historyLoaded).toBe(false);
  });

  it('is cleared by reset()', () => {
    store.getState().setHistoryLoaded(true);
    store.getState().reset();
    expect(store.getState().historyLoaded).toBe(false);
  });
});
