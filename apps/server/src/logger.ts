/**
 * Shared Pino logger
 * Single logger instance for the entire server process.
 * Services create child loggers with a `service` binding for easy filtering.
 */

import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  ...(config.nodeEnv !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

export default logger;
