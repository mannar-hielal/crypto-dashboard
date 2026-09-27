/**
 * Trading plugin (BYBIT_PARITY_PLAN BP-1): the server-side paper-trading engine.
 *
 * Decorates:
 *   - fastify.trading      TradingService: executes intents from the /api/paper routes
 *   - fastify.paperEvents  PaperEventBus: committed deltas, fanned out to the private WebSocket
 *
 * Starts the MatchingEngine (24/7 TP/SL + pending-order triggers) once the server is ready,
 * except in tests. Registered after the prisma and bybit plugins, which it depends on.
 */

import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Decimal } from '@prisma/client/runtime/client';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { AccountRepository } from '../trading/AccountRepository.js';
import { MatchingEngine } from '../trading/MatchingEngine.js';
import { PaperEventBus } from '../trading/PaperEventBus.js';
import { TradingService, type MarketSource } from '../trading/TradingService.js';
import { fetchCandles, prismaLeaseStore } from '../trading/infra.js';
import {
  fallbackRiskTiers,
  fallbackRules,
  riskTiersFromBybit,
  rulesFromInstrument,
  type RiskTier,
} from '../trading/bybitSpec.js';
import type { Category, InstrumentRules } from '../trading/engine/index.js';
import { getInstruments, getRiskLimit } from '../services/BybitMarketInfo.js';
import { ALLOWED_CATEGORIES, ALLOWED_SYMBOLS } from '../constants.js';

const log = logger.child({ plugin: 'trading' });

/**
 * Instrument rules and risk-limit tiers are refreshed from Bybit this often (they rarely change).
 */
const RULES_REFRESH_MS = 60 * 60_000;

const toDecimal = (v: number | null | undefined) =>
  v !== null && v !== undefined && Number.isFinite(v) && v > 0
    ? new Decimal(v.toString())
    : undefined;

declare module 'fastify' {
  interface FastifyInstance {
    trading: TradingService;
    paperEvents: PaperEventBus;
    paperRepository: AccountRepository;
  }
}

async function tradingPlugin(fastify: FastifyInstance): Promise<void> {
  // USDT Perpetual risk-limit tiers per symbol (BP-3) — bounded: ALLOWED_SYMBOLS
  const tiers = new Map<string, RiskTier[]>();
  const riskTiers = (symbol: string) => tiers.get(symbol) ?? fallbackRiskTiers(symbol);
  const refreshTiers = () =>
    Promise.all(
      ALLOWED_SYMBOLS.map(async (symbol) => {
        try {
          const live = riskTiersFromBybit(await getRiskLimit(symbol));
          if (live.length > 0) tiers.set(symbol, live);
        } catch (err) {
          // Keep the previous tiers (or the bundled snapshot) — liquidation never blocks on this
          log.warn({ err, symbol }, 'Risk-limit tiers refresh failed');
        }
      })
    );

  const repo = new AccountRepository(fastify.prisma, riskTiers);
  const events = new PaperEventBus();

  // Instrument rules per "category:symbol" — bounded: 2 categories × ALLOWED_SYMBOLS
  const rules = new Map<string, InstrumentRules>();
  // The markets are independent: fetched in parallel, so a slow one never delays the other
  const refreshRules = () =>
    Promise.all(
      ALLOWED_CATEGORIES.map(async (category) => {
        try {
          for (const instrument of await getInstruments(category)) {
            rules.set(`${category}:${instrument.symbol}`, rulesFromInstrument(instrument));
          }
        } catch (err) {
          // Keep the previous rules (or the bundled fallback) — trading never blocks on this
          log.warn({ err, category }, 'Instrument rules refresh failed');
        }
      })
    );

  const market: MarketSource = {
    quote: (category, symbol) => {
      const t = fastify.bybit.getTicker(category, symbol);
      const seenAt = fastify.bybit.quoteSeenAt(category, symbol);
      const last = toDecimal(t?.lastPrice);
      const bid = toDecimal(t?.bid);
      const ask = toDecimal(t?.ask);
      const mark = category === 'linear' ? toDecimal(t?.markPrice) : undefined;
      if (!last || !bid || !ask || seenAt === undefined) return undefined;
      return { last, bid, ask, seenAt, ...(mark ? { mark } : {}) };
    },
    rules: (category: Category, symbol) =>
      rules.get(`${category}:${symbol}`) ?? fallbackRules(category, symbol),
    riskTiers,
  };
  const trading = new TradingService(repo, market, events);

  fastify.decorate('trading', trading);
  fastify.decorate('paperEvents', events);
  fastify.decorate('paperRepository', repo);

  if (config.nodeEnv === 'test') return;

  const engine = new MatchingEngine({
    trading,
    events,
    loadOpenTriggers: () => repo.loadOpenTriggers(),
    reloadUser: (userId) => repo.loadIfExists(userId),
    subscribeTicker: (listener) => fastify.bybit.subscribeTicker(listener),
    fetchCandles,
    riskTiers,
    lease: prismaLeaseStore(fastify.prisma),
    holder: `${hostname()}-${process.pid}-${randomBytes(4).toString('hex')}`,
  });

  // Start after the server is ready so the Bybit feed and DB are up; never block boot on it.
  let rulesTimer: NodeJS.Timeout | null = null;
  fastify.addHook('onReady', async () => {
    void refreshRules();
    void refreshTiers();
    rulesTimer = setInterval(() => {
      void refreshRules();
      void refreshTiers();
    }, RULES_REFRESH_MS);
    rulesTimer.unref();
    void engine.start().catch((err: unknown) => {
      log.error({ err }, 'Matching engine failed to start');
    });
  });
  fastify.addHook('onClose', async () => {
    if (rulesTimer) clearInterval(rulesTimer);
    await engine.stop();
  });
}

export default fp(tradingPlugin, { name: 'trading', dependencies: ['bybit'] });
