import { describe, expect, it } from 'vitest';
import { makeUnsubscribeToken, readUnsubscribeToken } from '../lib/unsubscribeToken.js';

describe('unsubscribe token', () => {
  it('should read back the user it was made for', () => {
    expect(readUnsubscribeToken(makeUnsubscribeToken('cmabc123'))).toBe('cmabc123');
  });

  it('should refuse a token made for another user, a bad mac, and junk', () => {
    const token = makeUnsubscribeToken('user-a');
    const mac = token.slice(token.lastIndexOf('.') + 1);

    expect(readUnsubscribeToken(`user-b.${mac}`)).toBeNull();
    expect(readUnsubscribeToken(`user-a.${'0'.repeat(mac.length)}`)).toBeNull();
    expect(readUnsubscribeToken(`user-a.${mac.slice(0, -2)}`)).toBeNull();
    expect(readUnsubscribeToken('')).toBeNull();
    expect(readUnsubscribeToken('no-dot-at-all')).toBeNull();
    expect(readUnsubscribeToken('.onlymac')).toBeNull();
  });

  it('should not be a JWT: three dot-separated base64url parts is what authenticate reads', () => {
    expect(makeUnsubscribeToken('user-a').split('.')).toHaveLength(2);
  });
});
