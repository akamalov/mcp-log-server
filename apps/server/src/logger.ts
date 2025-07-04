/**
 * Logger Configuration
 * 
 * Provides structured logging using Pino with appropriate configuration
 * for development and production environments.
 */

import pino from 'pino';

/**
 * Create a configured logger instance
 */
export function createLogger() {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  const logger = pino({
    name: 'mcp-log-server',
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    ...(isDevelopment && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    }),
    serializers: {
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  });

  return logger;
}

export type Logger = ReturnType<typeof createLogger>; 