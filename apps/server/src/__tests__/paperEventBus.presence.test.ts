import { describe, expect, it } from 'vitest';
import { PaperEventBus } from '../trading/PaperEventBus.js';

describe('PaperEventBus.hasListeners', () => {
  it('should be true while a user has a socket subscribed and false once the last one leaves', () => {
    const bus = new PaperEventBus();
    expect(bus.hasListeners('u1')).toBe(false);

    const off1 = bus.subscribe('u1', () => undefined);
    const off2 = bus.subscribe('u1', () => undefined);
    expect(bus.hasListeners('u1')).toBe(true);
    expect(bus.hasListeners('u2')).toBe(false);

    off1();
    expect(bus.hasListeners('u1')).toBe(true);
    off2();
    expect(bus.hasListeners('u1')).toBe(false);
  });

  it('should not count the engine’s subscribe-to-everything listener as a user being present', () => {
    const bus = new PaperEventBus();
    bus.subscribeAll(() => undefined);
    expect(bus.hasListeners('u1')).toBe(false);
  });
});
