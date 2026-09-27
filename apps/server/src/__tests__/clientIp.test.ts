/**
 * 🔐 The visitor's IP behind Fly's proxy (lib/clientIp.ts): production reads `Fly-Client-IP` — the
 * address Fly accepted the connection from — because the socket and `X-Forwarded-For` hops are Fly's
 * own addresses (two hops: edge + region). Only a single valid IP is accepted, and only in
 * production.
 */

import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { clientIpFor, requestLogSerializerFor } from '../lib/clientIp.js';

const FLY_EDGE = '66.241.124.224'; // what the socket / XFF showed in production

async function ipSeen(nodeEnv: string, headers: Record<string, string>) {
  const read = clientIpFor(nodeEnv);
  const app = Fastify();
  app.get('/ip', async (request) => ({ ip: read(request) }));
  const res = await app.inject({ method: 'GET', url: '/ip', remoteAddress: FLY_EDGE, headers });
  await app.close();
  return res.json<{ ip: string }>().ip;
}

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

  it.each([['not-an-ip'], ['1.2.3.4, 5.6.7.8'], ['']])(
    'production: a malformed header (%o) falls back to the socket address',
    async (value) => {
      expect(await ipSeen('production', { 'fly-client-ip': value })).toBe(FLY_EDGE);
    }
  );

  it('outside production the header is ignored', async () => {
    expect(await ipSeen('development', { 'fly-client-ip': '1.2.3.4' })).toBe(FLY_EDGE);
    expect(await ipSeen('test', { 'fly-client-ip': '1.2.3.4' })).toBe(FLY_EDGE);
  });

  it('rate limits count each visitor separately, even from one Fly proxy address', async () => {
    const app = Fastify();
    await app.register(rateLimit, {
      max: 1,
      timeWindow: '1 minute',
      keyGenerator: clientIpFor('production'),
    });
    app.get('/x', async () => ({ ok: true }));
    const hit = (ip: string) =>
      app.inject({
        method: 'GET',
        url: '/x',
        remoteAddress: FLY_EDGE,
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
      keyGenerator: clientIpFor('production'),
    });
    app.post('/login', { config: { rateLimit: { max: 1, timeWindow: '1 hour' } } }, async () => ({
      ok: true,
    }));
    const hit = (ip: string) =>
      app.inject({
        method: 'POST',
        url: '/login',
        remoteAddress: FLY_EDGE,
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
        serializers: { req: requestLogSerializerFor('production') },
      },
    });
    app.get('/x', async () => ({ ok: true }));
    await app.inject({
      method: 'GET',
      url: '/x',
      remoteAddress: FLY_EDGE,
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
