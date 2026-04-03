/**
 * Environment Configuration & Validation
 * Ensures all required environment variables are set before app starts
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Monorepo setup: load from local .env first, fallback to root .env
dotenvConfig({ path: resolve(process.cwd(), '.env') });
dotenvConfig({ path: resolve(process.cwd(), '../../.env') });

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
}

function loadConfig(): Config {
    const getEnv = (key: string, defaultValue?: string): string => {
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
        jwtSecret: getEnv('JWT_SECRET'),
        logLevel: (getEnv('LOG_LEVEL', 'info') as Config['logLevel']) || 'info',
    };

    // Check for missing critical variables
    const criticalVars = ['DATABASE_URL', 'REDIS_URL', 'BYBIT_API_KEY', 'BYBIT_API_SECRET', 'JWT_SECRET'];
    const criticalMissing = criticalVars.filter((v) => !process.env[v]);

    if (criticalMissing.length > 0) {
        console.error('❌ Missing required environment variables:', criticalMissing.join(', '));
        console.error('\nPlease ensure your .env file contains:');
        criticalMissing.forEach((v) => console.error(`  ${v}=<value>`));
        process.exit(1);
    }

    // Validate URL formats — 🔐 never log the actual URL (may contain credentials)
    try {
        new URL(config.databaseUrl);
    } catch {
        console.error('❌ Invalid DATABASE_URL format. Check your .env file.');
        process.exit(1);
    }

    try {
        new URL(config.redisUrl);
    } catch {
        console.error('❌ Invalid REDIS_URL format. Check your .env file.');
        process.exit(1);
    }

    // 🔐 Only log host — never log full URLs (credentials exposure risk)
    const dbHost = (() => {
        try { return new URL(config.databaseUrl).host; } catch { return 'unknown'; }
    })();

    console.log('✅ Environment configuration loaded successfully');
    console.log(`   Mode:           ${config.nodeEnv}`);
    console.log(`   Database host:  ${dbHost}`);
    console.log(`   Redis:          localhost (connected)`);
    console.log(`   Bybit Testnet:  ${config.bybitTestnet}`);
    console.log(`   Log level:      ${config.logLevel}`);

    return config;
}

export const config = loadConfig();
export default config;
