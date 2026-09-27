/**
 * 🔐 Client IP behind Fly's proxy: production trusts exactly one hop, so `request.ip` is the
 * address Fly appended to X-Forwarded-For — not Fly's private address, and not an address the
 * client put in the header itself.
 */

import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { trustProxyFor } from '../app.js';

async function ipSeen(nodeEnv: string, headers: Record<string, string>) {
  const app = Fastify({ trustProxy: trustProxyFor(nodeEnv) });
  app.get('/ip', async (request) => ({ ip: request.ip }));
  const res = await app.inject({
    method: 'GET',
    url: '/ip',
    remoteAddress: '172.16.23.42', // Fly's proxy, as seen in production logs
    headers,
  });
  await app.close();
  return res.json<{ ip: string }>().ip;
}

describe('trustProxyFor', () => {
  it('production: request.ip is the client IP Fly appended', async () => {
    expect(await ipSeen('production', { 'x-forwarded-for': '203.0.113.7' })).toBe('203.0.113.7');
  });

  it('production: an address the client forged into the header is ignored', async () => {
    expect(await ipSeen('production', { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' })).toBe(
      '203.0.113.7'
    );
  });

  it('outside production no header is trusted', async () => {
    expect(await ipSeen('development', { 'x-forwarded-for': '203.0.113.7' })).toBe('172.16.23.42');
    expect(await ipSeen('test', { 'x-forwarded-for': '203.0.113.7' })).toBe('172.16.23.42');
  });
});
