/**
 * The visitor's IP address — the one key for every per-IP control (rate limits, the WS connection
 * caps) and every stored IP (`termsAcceptedIp`, `consentIp`).
 *
 * 🔐 In production every request reaches the server through Fly's proxy, often two hops (the edge
 * nearest the visitor, then the machine's region), so the socket address and the
 * `X-Forwarded-For` hops are Fly's addresses, not the visitor's (seen in the production logs on
 * 2026-09-27). Fly's proxy sets `Fly-Client-IP` to the address it accepted the connection from,
 * so that header is the visitor. It is trusted only:
 * - in production;
 * - when the connection itself comes from Fly's private proxy network (the socket peer is in
 *   172.16.0.0/12 or fdaa::/16) — a request that somehow reached the app without crossing Fly's
 *   proxy can't pick its own IP;
 * - when it is exactly one valid IP.
 *
 * Accepted scope (review #149): that private network is Fly's 6PN mesh, so any machine in the same
 * Fly organisation (another app, a `fly ssh` / WireGuard session) could also reach the app and set
 * the header. This is Fly's own documented way to recover the client IP, and public traffic only
 * arrives through Fly's proxy (`http_service`). Revisit if another app is added to the organisation.
 * Otherwise the socket address is used; in production that fallback is logged (throttled), so a
 * change in Fly's behaviour shows up instead of silently sharing one rate-limit bucket again.
 * Never key anything on `request.ip` directly.
 */

import { BlockList, isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { logger } from '../logger.js';

const log = logger.child({ service: 'clientIp' });

const FLY_CLIENT_IP = 'fly-client-ip';
/** Fly's own health checks come from the private network without a visitor */
const HEALTH_PATH = '/health';
/** At most one fallback warning per this many ms (bounded — no per-request log flood) */
const WARN_EVERY_MS = 60_000;

/** Fly's private network: the proxy that forwards public traffic to the machine lives here */
const FLY_PROXY_NETWORK = new BlockList();
FLY_PROXY_NETWORK.addSubnet('172.16.0.0', 12, 'ipv4');
FLY_PROXY_NETWORK.addSubnet('fdaa::', 16, 'ipv6');

/** True when `address` (the socket peer) is on Fly's private proxy network. */
export function isFlyProxyPeer(address: string): boolean {
  // An IPv4 peer can arrive IPv4-mapped on a dual-stack socket
  const ip = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  const family = isIP(ip);
  if (family === 4) return FLY_PROXY_NETWORK.check(ip, 'ipv4');
  if (family === 6) return FLY_PROXY_NETWORK.check(ip, 'ipv6');
  return false;
}

type IpSource = Pick<FastifyRequest, 'ip' | 'headers' | 'url'>;

/** A client-IP reader for one environment (exported for tests). */
export function clientIpFor(
  nodeEnv: string,
  warn: (context: Record<string, unknown>) => void = (context) =>
    log.warn(context, 'Visitor IP unavailable — using the socket address')
): (request: IpSource) => string {
  let lastWarnAt = 0;
  return (request) => {
    if (nodeEnv !== 'production') return request.ip;
    // header name is a known constant — safe, controlled access
    // eslint-disable-next-line security/detect-object-injection
    const header = request.headers[FLY_CLIENT_IP];
    const value = typeof header === 'string' ? header.trim() : '';
    const fromFly = isFlyProxyPeer(request.ip);
    if (fromFly && value && isIP(value)) return value;
    if (request.url !== HEALTH_PATH) {
      const now = Date.now();
      if (now - lastWarnAt >= WARN_EVERY_MS) {
        lastWarnAt = now;
        // No header values in the log line — only what went wrong
        warn({ fromFlyProxy: fromFly, headerPresent: header !== undefined });
      }
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
  // Logging must never itself warn: the request's own reader already reports a fallback
  const read = clientIpFor(nodeEnv, () => undefined);
  return (request: Pick<FastifyRequest, 'ip' | 'headers' | 'method' | 'url' | 'host'>) => ({
    method: request.method,
    url: request.url,
    host: request.host,
    remoteAddress: read(request),
  });
}
