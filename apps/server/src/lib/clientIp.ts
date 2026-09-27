/**
 * The visitor's IP address — the one key for every per-IP control (rate limits, the WS connection
 * caps) and every stored IP (`termsAcceptedIp`, `consentIp`).
 *
 * 🔐 In production every request reaches the server through Fly's proxy, often two hops (the edge
 * nearest the visitor, then the machine's region), so the socket address and the
 * `X-Forwarded-For` hops are Fly's addresses, not the visitor's (seen in the production logs on
 * 2026-09-27). Fly's proxy sets `Fly-Client-IP` to the address it accepted the connection from,
 * so that header is the visitor. It is trusted only:
 * - in production, on a Fly Machine (`FLY_APP_NAME` set — review #150: the same image run off Fly,
 *   e.g. on a Docker host whose bridge network is in 172.16.0.0/12, must never trust it);
 * - when the connection itself comes from Fly's proxy — the Machine's private IPv4 link, 172.16.0.0/12
 *   (every public request and health check in the production logs arrived from there:
 *   172.16.23.42, 172.19.23.41);
 * - when it is exactly one valid IP.
 *
 * Fly's organisation-wide 6PN network (fdaa::/16) is deliberately NOT trusted (review #150): other
 * apps in the organisation — `crypto-dashboard-db` today — and `fly ssh` / WireGuard sessions reach
 * the app over it and could otherwise set the header. Fly's proxy doesn't connect over it, so if
 * that ever changed, requests fall back to the socket address and the warning below shows it.
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

/** The Machine's private IPv4 link, where Fly's proxy connects from (not the org's 6PN mesh) */
const FLY_PROXY_NETWORK = new BlockList();
FLY_PROXY_NETWORK.addSubnet('172.16.0.0', 12, 'ipv4');

/** True when `address` (the socket peer) is Fly's proxy, on the Machine's private IPv4 link. */
export function isFlyProxyPeer(address: string): boolean {
  // An IPv4 peer can arrive IPv4-mapped on a dual-stack socket
  const ip = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  const family = isIP(ip);
  return family === 4 && FLY_PROXY_NETWORK.check(ip, 'ipv4');
}

type IpSource = Pick<FastifyRequest, 'ip' | 'headers' | 'url'>;

/** Where the server runs: production, and whether on a Fly Machine. */
export interface IpEnv {
  nodeEnv: string;
  onFly: boolean;
}

/** A client-IP reader for one environment (exported for tests). */
export function clientIpFor(
  env: IpEnv,
  warn: (context: Record<string, unknown>) => void = (context) =>
    log.warn(context, 'Visitor IP unavailable — using the socket address')
): (request: IpSource) => string {
  let lastWarnAt = 0;
  return (request) => {
    if (env.nodeEnv !== 'production') return request.ip;
    // header name is a known constant — safe, controlled access
    // eslint-disable-next-line security/detect-object-injection
    const header = request.headers[FLY_CLIENT_IP];
    const value = typeof header === 'string' ? header.trim() : '';
    const fromFly = env.onFly && isFlyProxyPeer(request.ip);
    if (fromFly && value && isIP(value)) return value;
    if (request.url !== HEALTH_PATH) {
      const now = Date.now();
      if (now - lastWarnAt >= WARN_EVERY_MS) {
        lastWarnAt = now;
        // No header values in the log line — only what went wrong
        warn({ onFly: env.onFly, fromFlyProxy: fromFly, headerPresent: header !== undefined });
      }
    }
    return request.ip;
  };
}

/** The visitor's IP for this environment. */
export const clientIp = clientIpFor({ nodeEnv: config.nodeEnv, onFly: config.onFly });

/**
 * Fastify's request log line (`incoming request`) with the visitor's IP as `remoteAddress` — the
 * default logs the socket, which in production is Fly's proxy.
 */
export function requestLogSerializerFor(env: IpEnv) {
  // Logging must never itself warn: the request's own reader already reports a fallback
  const read = clientIpFor(env, () => undefined);
  return (request: Pick<FastifyRequest, 'ip' | 'headers' | 'method' | 'url' | 'host'>) => ({
    method: request.method,
    url: request.url,
    host: request.host,
    remoteAddress: read(request),
  });
}
