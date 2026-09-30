/**
 * Environment Configuration & Validation
 * Ensures all required environment variables are set before app starts
 *
 * Note: this module bootstraps before the shared app logger exists
 * (logger.ts imports config), so it uses a lightweight `bootLogger` instance instead.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import pino from 'pino';

// Monorepo setup: load from local .env first, fallback to root .env
dotenvConfig({ path: resolve(process.cwd(), '.env') });
dotenvConfig({ path: resolve(process.cwd(), '../../.env') });

const bootLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl: string;
  redisUrl: string;
  bybitApiKey: string;
  bybitApiSecret: string;
  bybitTestnet: boolean;
  jwtSecret: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  corsOrigin: string;
  resendApiKey: string;
  resendFromEmail: string;
  clientUrl: string;
  adminEmail: string;
  /** Where the production error digest goes (lib/errorAlerts.ts); empty = no alerts. Optional. */
  alertEmail: string;
  /**
   * True when the process runs on a Fly Machine (Fly sets FLY_APP_NAME on every Machine). Gates
   * trusting Fly's `Fly-Client-IP` header (lib/clientIp.ts) — the same image run elsewhere must not.
   */
  onFly: boolean;
  /**
   * Test-only overrides of Bybit's public endpoints, for the local fake feed (docs/TRADING_TEST_PLAN.md
   * A5). 🔐 Refused in production. REST: a base URL (`http://localhost:4010`); WS: a base URL the
   * category path is appended to (`ws://localhost:4010` → `ws://localhost:4010/v5/public/spot`).
   */
  bybitRestUrl?: string;
  bybitWsUrl?: string;
  /** Test-only `/api/test/*` routes (F2). 🔐 Refused in production; needs TEST_HOOKS_SECRET. */
  testHooks: boolean;
  testHooksSecret: string;
}

/** Minimum TEST_HOOKS_SECRET length — the header every /api/test request must carry */
export const TEST_HOOKS_SECRET_MIN = 16;

function loadConfig(): Config {
  const getEnv = (key: string, defaultValue?: string): string => {
    // process.env is a controlled Namespace object
    // eslint-disable-next-line security/detect-object-injection
    const value = process.env[key] || defaultValue;
    return value || '';
  };

  const config: Config = {
    port: parseInt(getEnv('PORT', '3001'), 10) || 3001,
    nodeEnv: (getEnv('NODE_ENV', 'development') as Config['nodeEnv']) || 'development',
    databaseUrl: getEnv('DATABASE_URL'),
    redisUrl: getEnv('REDIS_URL'),
    bybitApiKey: getEnv('BYBIT_API_KEY'),
    bybitApiSecret: getEnv('BYBIT_API_SECRET'),
    bybitTestnet: getEnv('BYBIT_TESTNET', 'true').toLowerCase() === 'true',
    onFly: getEnv('FLY_APP_NAME') !== '',
    jwtSecret: getEnv('JWT_SECRET'),
    logLevel: (getEnv('LOG_LEVEL', 'info') as Config['logLevel']) || 'info',
    corsOrigin: getEnv('CORS_ORIGIN', 'http://localhost:5173'),
    resendApiKey: getEnv('RESEND_API_KEY', ''),
    resendFromEmail: getEnv('RESEND_FROM_EMAIL', 'onboarding@resend.dev'),
    clientUrl: getEnv('CLIENT_URL', 'http://localhost:5173'),
    adminEmail: getEnv('ADMIN_EMAIL'),
    alertEmail: getEnv('ALERT_EMAIL', ''),
    ...(getEnv('BYBIT_REST_URL') ? { bybitRestUrl: getEnv('BYBIT_REST_URL') } : {}),
    ...(getEnv('BYBIT_WS_URL') ? { bybitWsUrl: getEnv('BYBIT_WS_URL') } : {}),
    testHooks: getEnv('ENABLE_TEST_HOOKS') === '1',
    testHooksSecret: getEnv('TEST_HOOKS_SECRET'),
  };

  // Check for missing critical variables
  const criticalVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'BYBIT_API_KEY',
    'BYBIT_API_SECRET',
    'JWT_SECRET',
    'ADMIN_EMAIL',
  ];
  // process.env is a controlled Namespace object
  // eslint-disable-next-line security/detect-object-injection
  const criticalMissing = criticalVars.filter((v) => !process.env[v]);

  if (criticalMissing.length > 0) {
    bootLogger.error({ missing: criticalMissing }, '❌ Missing required environment variables');
    process.exit(1);
  }

  // 🔐 JWT_SECRET entropy check — require at least 32 bytes (256 bits) so the secret
  //    cannot be brute-forced or guessed. A short secret undermines HS256 security.
  if (Buffer.byteLength(config.jwtSecret, 'utf8') < 32) {
    bootLogger.error(
      '❌ JWT_SECRET is too short. It must be at least 32 bytes (256 bits) of entropy.'
    );
    process.exit(1);
  }

  // 🔐 In production, CLIENT_URL must be explicitly set — the localhost default would
  //    generate password reset links that are unreachable for real users.
  if (config.nodeEnv === 'production' && !process.env.CLIENT_URL) {
    bootLogger.error(
      '❌ CLIENT_URL is not set in production. Password reset links would point to localhost and be unusable.'
    );
    process.exit(1);
  }

  // 🔐 Test-only switches never reach production: fail closed rather than serve a fake feed or an
  //    account factory. Checked by name, so an empty value set by mistake is refused too.
  if (config.nodeEnv === 'production') {
    const testOnly = ['BYBIT_REST_URL', 'BYBIT_WS_URL', 'ENABLE_TEST_HOOKS', 'TEST_HOOKS_SECRET'];
    // process.env is a controlled Namespace object
    // eslint-disable-next-line security/detect-object-injection
    const set = testOnly.filter((v) => process.env[v] !== undefined);
    if (set.length > 0) {
      bootLogger.error({ set }, '❌ Test-only environment variables are set in production');
      process.exit(1);
    }
  }

  // 🔐 The test hooks create users: only behind a shared secret of a real length
  if (config.testHooks && config.testHooksSecret.length < TEST_HOOKS_SECRET_MIN) {
    bootLogger.error(
      `❌ ENABLE_TEST_HOOKS=1 needs TEST_HOOKS_SECRET of at least ${TEST_HOOKS_SECRET_MIN} characters.`
    );
    process.exit(1);
  }

  const overrides = [
    ['BYBIT_REST_URL', config.bybitRestUrl, ['http:', 'https:']],
    ['BYBIT_WS_URL', config.bybitWsUrl, ['ws:', 'wss:']],
  ] as const;
  for (const [name, value, protocols] of overrides) {
    if (value === undefined) continue;
    let protocol = '';
    try {
      protocol = new URL(value).protocol;
    } catch {
      // not a URL — refused below
    }
    if (!(protocols as readonly string[]).includes(protocol)) {
      bootLogger.error(`❌ Invalid ${name}: expected an absolute ${protocols.join(' / ')} URL.`);
      process.exit(1);
    }
  }

  // Validate URL formats — 🔐 never log the actual URL (may contain credentials)
  try {
    new URL(config.databaseUrl);
  } catch {
    bootLogger.error('❌ Invalid DATABASE_URL format. Check your .env file.');
    process.exit(1);
  }

  try {
    new URL(config.redisUrl);
  } catch {
    bootLogger.error('❌ Invalid REDIS_URL format. Check your .env file.');
    process.exit(1);
  }

  // 🔐 Only log host — never log full URLs (credentials exposure risk)
  const dbHost = (() => {
    try {
      return new URL(config.databaseUrl).host;
    } catch {
      return 'unknown';
    }
  })();

  const redisHost = (() => {
    try {
      return new URL(config.redisUrl).host;
    } catch {
      return 'unknown';
    }
  })();

  bootLogger.info('✅ Environment configuration loaded successfully');
  bootLogger.info(
    {
      mode: config.nodeEnv,
      dbHost,
      redisHost,
      bybitTestnet: config.bybitTestnet,
      logLevel: config.logLevel,
      ...(config.bybitRestUrl || config.bybitWsUrl ? { bybitFeed: 'test override' } : {}),
      ...(config.testHooks ? { testHooks: true } : {}),
    },
    '🚀 Server Startup Configuration'
  );

  return config;
}

export const config = loadConfig();
export default config;
