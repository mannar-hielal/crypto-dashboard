/**
 * 🔐 The visitor's IP behind Fly's proxy (lib/clientIp.ts): production reads `Fly-Client-IP` — the
 * address Fly accepted the connection from — because the socket and `X-Forwarded-For` hops are Fly's
 * own addresses (two hops: edge + region). The header is trusted only from Fly's private proxy
 * network, only as a single valid IP, and only in production; a fallback is logged (throttled).
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { clientIpFor, isFlyProxyPeer, requestLogSerializerFor } from '../lib/clientIp.js';

/** The socket peer of public traffic in production (Fly's proxy, from the 2026-09-27 logs) */
const FLY_PROXY = '172.16.23.42';

async function ipSeen(
  nodeEnv: string,
  headers: Record<string, string>,
  opts: {
    peer?: string;
    url?: string;
    onFly?: boolean;
    warn?: (c: Record<string, unknown>) => void;
  } = {}
) {
  const read = clientIpFor({ nodeEnv, onFly: opts.onFly ?? true }, opts.warn ?? (() => undefined));
  const app = Fastify();
  app.get(opts.url ?? '/ip', async (request) => ({ ip: read(request) }));
  const res = await app.inject({
    method: 'GET',
    url: opts.url ?? '/ip',
    remoteAddress: opts.peer ?? FLY_PROXY,
    headers,
  });
  await app.close();
  return res.json<{ ip: string }>().ip;
}

describe('isFlyProxyPeer', () => {
  it.each([
    ['172.16.23.42', true],
    ['172.19.23.41', true],
    ['::ffff:172.16.23.42', true],
    ['fdaa:0:1::3', true],
    ['66.241.124.224', false], // a Fly public edge address — not the private proxy hop
    ['89.217.38.229', false],
    ['10.0.0.1', false],
    ['not-an-ip', false],
  ])('%s → %s', (ip, expected) => {
    expect(isFlyProxyPeer(ip)).toBe(expected);
  });
});

describe('clientIpFor', () => {
  it('production: the visitor is Fly-Client-IP (IPv4 and IPv6)', async () => {
    expect(await ipSeen('production', { 'fly-client-ip': '89.217.38.229' })).toBe('89.217.38.229');
    expect(await ipSeen('production', { 'fly-client-ip': '2001:db8::7' })).toBe('2001:db8::7');
  });

  it('production: X-Forwarded-For is never trusted', async () => {
    expect(
      await ipSeen('production', {
        'fly-client-ip': '89.217.38.229',
        'x-forwarded-for': '1.2.3.4, 89.217.38.229, 66.241.124.224',
      })
    ).toBe('89.217.38.229');
  });

  it('production: a connection not from Fly’s proxy network cannot choose its IP (review #149)', async () => {
    expect(
      await ipSeen('production', { 'fly-client-ip': '1.2.3.4' }, { peer: '203.0.113.50' })
    ).toBe('203.0.113.50');
  });

  it('production off Fly (FLY_APP_NAME unset): the header is never trusted, even from a 172.16/12 peer (review #150)', async () => {
    // e.g. the image on a plain Docker host: a sibling container on the 172.17.0.0/16 bridge
    expect(
      await ipSeen(
        'production',
        { 'fly-client-ip': '1.2.3.4' },
        { peer: '172.17.0.3', onFly: false }
      )
    ).toBe('172.17.0.3');
  });

  it.each([['not-an-ip'], ['1.2.3.4, 5.6.7.8'], ['']])(
    'production: a malformed header (%o) falls back to the socket address',
    async (value) => {
      expect(await ipSeen('production', { 'fly-client-ip': value })).toBe(FLY_PROXY);
    }
  );

  it('outside production the header is ignored', async () => {
    expect(await ipSeen('development', { 'fly-client-ip': '1.2.3.4' })).toBe(FLY_PROXY);
    expect(await ipSeen('test', { 'fly-client-ip': '1.2.3.4' })).toBe(FLY_PROXY);
  });

  it('production: a fallback is logged, throttled, never for /health, never with the header value (review #149)', async () => {
    const warn = vi.fn();
    const read = clientIpFor({ nodeEnv: 'production', onFly: true }, warn);
    const req = (url: string, headers: Record<string, string> = {}) => ({
      ip: FLY_PROXY,
      url,
      headers,
    });
    read(req('/health'));
    expect(warn).not.toHaveBeenCalled();
    read(req('/api/x', { 'fly-client-ip': 'garbage' }));
    read(req('/api/x')); // within the throttle window
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({ onFly: true, fromFlyProxy: true, headerPresent: true });
    // A good request never warns
    warn.mockClear();
    read(req('/api/x', { 'fly-client-ip': '89.217.38.229' }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('rate limits count each visitor separately, even behind one Fly proxy address', async () => {
    const app = Fastify();
    await app.register(rateLimit, {
      max: 1,
      timeWindow: '1 minute',
      keyGenerator: clientIpFor({ nodeEnv: 'production', onFly: true }, () => undefined),
    });
    app.get('/x', async () => ({ ok: true }));
    const hit = (ip: string) =>
      app.inject({
        method: 'GET',
        url: '/x',
        remoteAddress: FLY_PROXY,
        headers: { 'fly-client-ip': ip },
      });
    expect((await hit('89.217.38.229')).statusCode).toBe(200);
    expect((await hit('203.0.113.7')).statusCode).toBe(200); // another visitor, own bucket
    expect((await hit('89.217.38.229')).statusCode).toBe(429); // the first visitor again
    await app.close();
  });

  it('a route with its own limit (login, register…) inherits the visitor key', async () => {
    const app = Fastify();
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      keyGenerator: clientIpFor({ nodeEnv: 'production', onFly: true }, () => undefined),
    });
    app.post('/login', { config: { rateLimit: { max: 1, timeWindow: '1 hour' } } }, async () => ({
      ok: true,
    }));
    const hit = (ip: string) =>
      app.inject({
        method: 'POST',
        url: '/login',
        remoteAddress: FLY_PROXY,
        headers: { 'fly-client-ip': ip },
      });
    expect((await hit('89.217.38.229')).statusCode).toBe(200);
    expect((await hit('203.0.113.7')).statusCode).toBe(200);
    expect((await hit('89.217.38.229')).statusCode).toBe(429);
    await app.close();
  });

  it('the request log shows the visitor as remoteAddress in production', async () => {
    const lines: string[] = [];
    const app = Fastify({
      logger: {
        level: 'info',
        stream: { write: (line: string) => void lines.push(line) },
        serializers: { req: requestLogSerializerFor({ nodeEnv: 'production', onFly: true }) },
      },
    });
    app.get('/x', async () => ({ ok: true }));
    await app.inject({
      method: 'GET',
      url: '/x',
      remoteAddress: FLY_PROXY,
      headers: { 'fly-client-ip': '89.217.38.229' },
    });
    await app.close();
    const incoming = lines.map((l) => JSON.parse(l)).find((l) => l.msg === 'incoming request');
    expect(incoming.req).toMatchObject({
      method: 'GET',
      url: '/x',
      remoteAddress: '89.217.38.229',
    });
  });
});
