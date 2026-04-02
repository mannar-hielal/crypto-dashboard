/**
 * Environment Configuration & Validation
 * Ensures all required environment variables are set before app starts
 */

import 'dotenv/config';

interface Config {
  // App
  port: number;
  nodeEnv: 'development' | 'production' | 'test';

  // Database
  databaseUrl: string;

  // Redis
  redisUrl: string;

  // Bybit
  bybitApiKey: string;
  bybitApiSecret: string;
  bybitTestnet: boolean;

  // JWT
  jwtSecret: string;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Load and validate environment configuration
 */
function loadConfig(): Config {
  const missingVars: string[] = [];

  // Helper to get env var or track missing
  const getEnv = (key: string, defaultValue?: string): string => {
    const value = process.env[key] || defaultValue;
    if (!value) {
      missingVars.push(key);
    }
    return value || '';
  };

  const config: Config = {
    port: parseInt(getEnv('PORT', '3001'), 10) || 3001,
    nodeEnv: (getEnv('NODE_ENV', 'development') as any) || 'development',
    databaseUrl: getEnv('DATABASE_URL'),
    redisUrl: getEnv('REDIS_URL'),
    bybitApiKey: getEnv('BYBIT_API_KEY'),
    bybitApiSecret: getEnv('BYBIT_API_SECRET'),
    bybitTestnet: getEnv('BYBIT_TESTNET', 'true').toLowerCase() === 'true',
    jwtSecret: getEnv('JWT_SECRET'),
    logLevel: (getEnv('LOG_LEVEL', 'info') as any) || 'info',
  };

  // Critical variables that must exist
  const criticalVars = ['DATABASE_URL', 'REDIS_URL', 'BYBIT_API_KEY', 'BYBIT_API_SECRET', 'JWT_SECRET'];
  const criticalMissing = criticalVars.filter((v) => !process.env[v]);

  if (criticalMissing.length > 0) {
    console.error(
      '❌ Missing required environment variables:',
      criticalMissing.join(', ')
    );
    console.error('\nPlease ensure your .env file contains:');
    criticalMissing.forEach((v) => console.error(`  ${v}=<value>`));
    process.exit(1);
  }

  // Validate URL formats
  try {
    new URL(config.databaseUrl);
  } catch (e) {
    console.error('❌ Invalid DATABASE_URL format:', config.databaseUrl);
    process.exit(1);
  }

  try {
    new URL(config.redisUrl);
  } catch (e) {
    console.error('❌ Invalid REDIS_URL format:', config.redisUrl);
    process.exit(1);
  }

  console.log('✅ Environment configuration loaded successfully');
  console.log(`   Mode: ${config.nodeEnv}`);
  console.log(`   Database: ${config.databaseUrl.split('@')[1] || 'localhost'}`);
  console.log(`   Redis: ${config.redisUrl}`);
  console.log(`   Bybit Testnet: ${config.bybitTestnet}`);

  return config;
}

export const config = loadConfig();

export default config;

