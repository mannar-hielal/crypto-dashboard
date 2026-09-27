/**
 * The visitor's IP address — the one key for every per-IP control (rate limits, the WS connection
 * caps) and every stored IP (`termsAcceptedIp`).
 *
 * 🔐 In production every request reaches the server through Fly's proxy, often two hops (the edge
 * nearest the visitor, then the machine's region), so the socket address and the
 * `X-Forwarded-For` hops are Fly's addresses, not the visitor's (seen in the production logs on
 * 2026-09-27). Fly's proxy sets `Fly-Client-IP` to the address it accepted the connection from,
 * so that header is the visitor. It is read only in production, and only when it is exactly one
 * valid IP; anywhere else nothing sits in front of the server and the socket address is used.
 * Never key anything on `request.ip` directly.
 */

import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';

const FLY_CLIENT_IP = 'fly-client-ip';

type IpSource = Pick<FastifyRequest, 'ip' | 'headers'>;

/** A client-IP reader for one environment (exported for tests). */
export function clientIpFor(nodeEnv: string): (request: IpSource) => string {
  return (request) => {
    if (nodeEnv === 'production') {
      // header name is a known constant — safe, controlled access
      // eslint-disable-next-line security/detect-object-injection
      const header = request.headers[FLY_CLIENT_IP];
      const value = typeof header === 'string' ? header.trim() : '';
      if (value && isIP(value)) return value;
    }
    return request.ip;
  };
}

/** The visitor's IP for this environment. */
export const clientIp = clientIpFor(config.nodeEnv);

/**
 * Fastify's request log line (`incoming request`) with the visitor's IP as `remoteAddress` — the
 * default logs the socket, which in production is Fly's proxy.
 */
export function requestLogSerializerFor(nodeEnv: string) {
  const read = clientIpFor(nodeEnv);
  return (request: Pick<FastifyRequest, 'ip' | 'headers' | 'method' | 'url' | 'host'>) => ({
    method: request.method,
    url: request.url,
    host: request.host,
    remoteAddress: read(request),
  });
}
