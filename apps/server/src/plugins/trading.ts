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
import { TradingService } from '../trading/TradingService.js';
import { fetchSpotCandles, prismaLeaseStore } from '../trading/infra.js';

const log = logger.child({ plugin: 'trading' });

declare module 'fastify' {
  interface FastifyInstance {
    trading: TradingService;
    paperEvents: PaperEventBus;
    paperRepository: AccountRepository;
  }
}

async function tradingPlugin(fastify: FastifyInstance): Promise<void> {
  const repo = new AccountRepository(fastify.prisma);
  const events = new PaperEventBus();
  const trading = new TradingService(
    repo,
    {
      // BP-1 trades on the spot feed (every pane is spot until the BP-2 market switch)
      lastPrice: (symbol) => {
        const price = fastify.bybit.getTicker('spot', symbol)?.lastPrice;
        return price !== undefined && Number.isFinite(price)
          ? new Decimal(price.toString())
          : undefined;
      },
    },
    events
  );

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
    fetchCandles: fetchSpotCandles,
    lease: prismaLeaseStore(fastify.prisma),
    holder: `${hostname()}-${process.pid}-${randomBytes(4).toString('hex')}`,
  });

  // Start after the server is ready so the Bybit feed and DB are up; never block boot on it.
  fastify.addHook('onReady', async () => {
    void engine.start().catch((err: unknown) => {
      log.error({ err }, 'Matching engine failed to start');
    });
  });
  fastify.addHook('onClose', async () => {
    await engine.stop();
  });
}

export default fp(tradingPlugin, { name: 'trading', dependencies: ['bybit'] });
