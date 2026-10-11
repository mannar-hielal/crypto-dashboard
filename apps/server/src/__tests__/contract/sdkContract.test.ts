/**
 * SDK ↔ server contract (F9, test plan roadmap P1d). The Fastify route schemas are the server's
 * half of the contract; `generated/CDSDK` is the client's. `web.md`: a response shape change is
 * never backend-only — this test is what enforces it.
 *
 * Every SDK function is called for real with `fetch` stubbed. The request it makes (method, path,
 * query, body) must match a route in the OpenAPI document the app generates (`app.swagger()`):
 *   - the route exists for that method;
 *   - the body / query sends only fields the route declares, and every field the route requires is
 *     one the SDK type requires (the `min*` fixtures hold required fields only);
 *   - the success response the SDK expects is declared, and every field of the SDK-typed response
 *     fixture is in the route's response schema (fast-json-stringify silently drops the rest),
 *     with a matching JSON type; every field the schema requires is one the SDK type has.
 * The fixtures are typed as the SDK types and type-checked (`tsconfig.contract.json`).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { adminApi, authApi, marketApi, newsletterApi, paperApi } from '@crypto-dashboard/sdk';

// The route schemas are all this needs: Prisma is never reached
vi.mock('../../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    app.decorate('prisma', {} as never);
  };
  // Fastify Symbol-key pattern — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

import { buildApp } from '../../app.js';
import * as f from './fixtures.js';

// ─── The OpenAPI document ───────────────────────────────────────────────────────

interface Schema {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: boolean | Schema;
  enum?: unknown[];
  nullable?: boolean;
}
interface Operation {
  parameters?: { in: string; name: string; required?: boolean }[];
  requestBody?: { content: Record<string, { schema: Schema }> };
  responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
}
type Paths = Record<string, Record<string, Operation>>;

let app: FastifyInstance;
let paths: Paths;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  paths = (app.swagger() as unknown as { paths: Paths }).paths;
});

afterAll(async () => {
  await app.close();
});

// ─── What the SDK sent ────────────────────────────────────────────────────────

interface Sent {
  method: string;
  pathname: string;
  query: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

/** Call an SDK function with `fetch` stubbed to answer `response`; return the request it made. */
async function capture(
  call: () => Promise<unknown>,
  status: number,
  response: unknown
): Promise<Sent> {
  let sent: Sent | undefined;
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    sent = {
      method: (init?.method ?? 'GET').toUpperCase(),
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Sent['body']) : undefined,
    };
    return status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(response), {
          status,
          headers: { 'content-type': 'application/json' },
        });
  });
  try {
    await call();
  } finally {
    vi.unstubAllGlobals();
  }
  if (!sent) throw new Error('the SDK function made no request');
  return sent;
}

/** The route for a concrete path: `/api/paper/orders/o1` → `/api/paper/orders/{id}`. */
function routeFor(method: string, pathname: string): { path: string; op: Operation } | undefined {
  const segments = pathname.split('/');
  for (const [path, ops] of Object.entries(paths)) {
    const template = path.split('/');
    const matches =
      template.length === segments.length &&
      template.every((t, i) => {
        const segment = segments.at(i);
        return t.startsWith('{') ? !!segment : t === segment;
      });
    const op = ops[method.toLowerCase()];
    if (op && matches) return { path, op };
  }
  return undefined;
}

// ─── Schema comparison ────────────────────────────────────────────────────────

function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function typeMatches(schema: Schema, value: unknown): boolean {
  if (!schema.type) return true;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const t = jsonType(value);
  if (t === 'null') return types.includes('null') || schema.nullable === true;
  if (t === 'number') return types.includes('number') || types.includes('integer');
  return types.includes(t);
}

/** Every problem with `value` (an SDK fixture) against the server's response `schema`. */
function responseProblems(schema: Schema, value: unknown, at: string): string[] {
  if (value === undefined) return [];
  if (!typeMatches(schema, value)) {
    return [
      `${at}: the SDK has ${jsonType(value)}, the server sends ${JSON.stringify(schema.type)}`,
    ];
  }
  if (Array.isArray(value)) {
    return schema.items
      ? value.flatMap((v, i) => responseProblems(schema.items!, v, `${at}[${i}]`))
      : [];
  }
  if (value === null || typeof value !== 'object' || !schema.properties) return [];
  const props = schema.properties;
  const problems: string[] = [];
  for (const [key, v] of Object.entries(value)) {
    // eslint-disable-next-line security/detect-object-injection -- keys of a test fixture
    const sub = props[key];
    if (!sub) {
      if (schema.additionalProperties === true) continue;
      problems.push(`${at}.${key}: in the SDK type, not in the route's response (dropped)`);
      continue;
    }
    problems.push(...responseProblems(sub, v, `${at}.${key}`));
  }
  for (const key of schema.required ?? []) {
    if (!(key in (value as object))) {
      problems.push(`${at}.${key}: the route always sends it, the SDK type doesn't have it`);
    }
  }
  return problems;
}

/** Every problem with a request's fields against the route's declared ones. */
function requestProblems(
  sent: Record<string, unknown>,
  declared: string[],
  required: string[],
  closed: boolean,
  what: string
): string[] {
  const problems: string[] = [];
  if (closed) {
    for (const key of Object.keys(sent)) {
      if (!declared.includes(key))
        problems.push(`${what}.${key}: sent by the SDK, dropped by the route (removeAdditional)`);
    }
  }
  for (const key of required) {
    if (!(key in sent))
      problems.push(`${what}.${key}: required by the route, optional or missing in the SDK`);
  }
  return problems;
}

// ─── The SDK surface ──────────────────────────────────────────────────────────

interface Call {
  /** `api.function` — plus a suffix when one function is called more than once */
  name: string;
  run: () => Promise<unknown>;
  /** The success status the route answers with */
  status: number;
  response?: unknown;
}

const T = 'token';
const CALLS: Call[] = [
  // auth
  {
    name: 'authApi.register',
    run: () => authApi.register(f.registerBody),
    status: 201,
    response: f.authResponse,
  },
  {
    name: 'authApi.login',
    run: () => authApi.login({ email: 'a@example.test', password: 'x' }),
    status: 200,
    response: f.authResponse,
  },
  {
    name: 'authApi.refresh',
    run: () => authApi.refresh(),
    status: 200,
    response: f.refreshResponse,
  },
  { name: 'authApi.refresh (no session)', run: () => authApi.refresh(), status: 204 },
  { name: 'authApi.logout', run: () => authApi.logout(), status: 204 },
  { name: 'authApi.me', run: () => authApi.me(T), status: 200, response: f.meResponse },
  {
    name: 'authApi.forgotPassword',
    run: () => authApi.forgotPassword({ email: 'a@example.test' }),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'authApi.resetPassword',
    run: () => authApi.resetPassword({ token: 't', password: 'x' }),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'authApi.updateUsername',
    run: () => authApi.updateUsername({ username: 'u' }, T),
    status: 200,
    response: f.updateUserResponse,
  },
  {
    name: 'authApi.updateEmail',
    run: () => authApi.updateEmail({ email: 'a@example.test', currentPassword: 'x' }, T),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'authApi.updatePassword',
    run: () => authApi.updatePassword({ currentPassword: 'x', newPassword: 'y' }, T),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'authApi.verifyEmail',
    run: () => authApi.verifyEmail({ token: 't' }),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'authApi.resendVerification',
    run: () => authApi.resendVerification({ email: 'a@example.test' }),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'authApi.verifyEmailChange',
    run: () => authApi.verifyEmailChange({ token: 't' }),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'authApi.requestDeletion',
    run: () => authApi.requestDeletion({ password: 'x' }, T),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'authApi.cancelDeletion',
    run: () => authApi.cancelDeletion(T),
    status: 200,
    response: f.messageResponse,
  },
  // market
  {
    name: 'marketApi.getCandles',
    run: () => marketApi.getCandles('BTCUSDT', '1m', 200, 'spot'),
    status: 200,
    response: f.candlesResponse,
  },
  {
    name: 'marketApi.getInstruments',
    run: () => marketApi.getInstruments('linear'),
    status: 200,
    response: f.instrumentsResponse,
  },
  {
    name: 'marketApi.getRiskLimit',
    run: () => marketApi.getRiskLimit('BTCUSDT'),
    status: 200,
    response: f.riskLimitResponse,
  },
  // newsletter
  {
    name: 'newsletterApi.getSubscribers',
    run: () => newsletterApi.getSubscribers(T, 'verified'),
    status: 200,
    response: f.subscribersResponse,
  },
  {
    name: 'newsletterApi.subscribe',
    run: () => newsletterApi.subscribe('a@example.test'),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'newsletterApi.verify',
    run: () => newsletterApi.verify('t'),
    status: 200,
    response: f.messageResponse,
  },
  {
    name: 'newsletterApi.unsubscribe',
    run: () => newsletterApi.unsubscribe('t'),
    status: 200,
    response: f.messageResponse,
  },
  // admin
  {
    name: 'adminApi.getRetentionMetrics',
    run: () => adminApi.getRetentionMetrics(T),
    status: 200,
    response: f.retentionMetricsResponse,
  },
  // paper
  {
    name: 'paperApi.getState',
    run: () => paperApi.getState(T),
    status: 200,
    response: f.paperState,
  },
  {
    name: 'paperApi.placeOrder',
    run: () => paperApi.placeOrder(f.minPlaceOrder, T),
    status: 200,
    response: f.action('id'),
  },
  {
    name: 'paperApi.placeOrder (every field)',
    run: () => paperApi.placeOrder(f.fullPlaceOrder, T),
    status: 200,
    response: f.action(null),
  },
  {
    name: 'paperApi.placeSpotExits',
    run: () => paperApi.placeSpotExits(f.minSpotExits, T),
    status: 200,
    response: f.action('oco'),
  },
  {
    name: 'paperApi.placeSpotExits (every field)',
    run: () => paperApi.placeSpotExits(f.fullSpotExits, T),
    status: 200,
    response: f.action('oco'),
  },
  {
    name: 'paperApi.cancelOrder',
    run: () => paperApi.cancelOrder('o1', T),
    status: 200,
    response: f.action(true),
  },
  {
    name: 'paperApi.editOrder',
    run: () => paperApi.editOrder('o1', f.minEditOrder, T),
    status: 200,
    response: f.action('ok'),
  },
  {
    name: 'paperApi.editOrder (every field)',
    run: () => paperApi.editOrder('o1', f.fullEditOrder, T),
    status: 200,
    response: f.action('rejected'),
  },
  {
    name: 'paperApi.cancelOrderExit',
    run: () => paperApi.cancelOrderExit('o1', 'take-profit', T),
    status: 200,
    response: f.action(true),
  },
  {
    name: 'paperApi.updatePositionExits',
    run: () => paperApi.updatePositionExits('p1', f.minPositionExits, T),
    status: 200,
    response: f.action(true),
  },
  {
    name: 'paperApi.updatePositionExits (every field)',
    run: () => paperApi.updatePositionExits('p1', f.fullPositionExits, T),
    status: 200,
    response: f.action(false),
  },
  {
    name: 'paperApi.adjustPositionMargin',
    run: () => paperApi.adjustPositionMargin('p1', '-10.5', T),
    status: 200,
    response: f.action('0'),
  },
  {
    name: 'paperApi.cancelPositionExit',
    run: () => paperApi.cancelPositionExit('p1', 'stop-loss', T),
    status: 200,
    response: f.action(true),
  },
  {
    name: 'paperApi.closePosition',
    run: () => paperApi.closePosition('p1', T),
    status: 200,
    response: f.action('12.5'),
  },
  {
    name: 'paperApi.setSymbolLeverage',
    run: () => paperApi.setSymbolLeverage('BTCUSDT', 5, T),
    status: 200,
    response: f.action(5),
  },
  {
    name: 'paperApi.setMarginMode',
    run: () => paperApi.setMarginMode('REGULAR_MARGIN', T),
    status: 200,
    response: f.action('REGULAR_MARGIN'),
  },
  {
    name: 'paperApi.resetAccount',
    run: () => paperApi.resetAccount(T),
    status: 200,
    response: f.action(true),
  },
  {
    name: 'paperApi.addNote',
    run: () => paperApi.addNote(f.note, T),
    status: 200,
    response: f.action('j1'),
  },
  {
    name: 'paperApi.editNote',
    run: () => paperApi.editNote('j1', f.note, T),
    status: 200,
    response: f.action(true),
  },
];

/** SDK members that aren't HTTP calls (URL builders for the WebSockets) */
const NOT_HTTP = new Set(['marketApi.wsUrl', 'paperApi.wsUrl']);

describe('SDK ↔ server contract (F9)', () => {
  it('covers every SDK function', () => {
    const apis = { adminApi, authApi, marketApi, newsletterApi, paperApi };
    const called = new Set(CALLS.map((c) => c.name.split(' ')[0]));
    const functions = Object.entries(apis).flatMap(([api, members]) =>
      Object.keys(members).map((fn) => `${api}.${fn}`)
    );
    expect(functions.filter((fn) => !NOT_HTTP.has(fn) && !called.has(fn))).toEqual([]);
  });

  it.each(CALLS)('$name', async ({ run, status, response }) => {
    const sent = await capture(run, status, response);
    const route = routeFor(sent.method, sent.pathname);
    expect(route, `${sent.method} ${sent.pathname} has no route`).toBeDefined();
    const { op } = route!;
    const problems: string[] = [];

    // Query
    const queryParams = (op.parameters ?? []).filter((p) => p.in === 'query');
    problems.push(
      ...requestProblems(
        sent.query,
        queryParams.map((p) => p.name),
        queryParams.filter((p) => p.required).map((p) => p.name),
        true,
        'query'
      )
    );

    // Body
    const bodySchema = op.requestBody?.content['application/json']?.schema;
    if (sent.body) {
      if (!bodySchema) problems.push('body: sent by the SDK, the route takes none');
      else {
        problems.push(
          ...requestProblems(
            sent.body,
            Object.keys(bodySchema.properties ?? {}),
            bodySchema.required ?? [],
            bodySchema.additionalProperties === false,
            'body'
          )
        );
      }
    } else if (op.requestBody && bodySchema?.required?.length) {
      problems.push(`body: required by the route, the SDK sends none`);
    }

    // Response
    const declared = op.responses[String(status)];
    if (!declared) problems.push(`response ${status}: not declared by the route`);
    else if (response !== undefined) {
      const schema = declared.content?.['application/json']?.schema;
      if (!schema) problems.push(`response ${status}: the route declares no body`);
      else problems.push(...responseProblems(schema, response, 'response'));
    }

    expect(problems).toEqual([]);
  });
});
