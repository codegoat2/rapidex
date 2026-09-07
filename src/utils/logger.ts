/**
 * Structured JSON logger using Winston.
 *
 * Outputs JSON in production and colorized simple format in development.
 *
 * Usage:
 *   logger.info('message')
 *   logger.info('message', { key: 'value' })   ← extra metadata as second arg
 *   logger.error('message', { err })
 *
 * We use a simple two-argument pattern (message, meta?) so the call sites
 * stay clean and TypeScript is happy across all modules.
 */

import winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isProduction = process.env['NODE_ENV'] === 'production';

const winstonLogger = winston.createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: isProduction
    ? combine(timestamp(), errors({ stack: true }), json())
    : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), simple()),
  defaultMeta: { service: 'rapidex-bot' },
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// Typed wrapper — accepts (message, meta?) so callers can pass objects safely
// ---------------------------------------------------------------------------

type Meta = Record<string, unknown>;

function formatMsg(meta: Meta, message: string): string {
  // Include meta keys inline for non-JSON output
  if (!isProduction) {
    const extra = Object.entries(meta)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' ');
    return extra ? `${message} | ${extra}` : message;
  }
  return message;
}

export const logger = {
  debug: (meta: Meta | string, message?: string) => {
    if (typeof meta === 'string') { winstonLogger.debug(meta); return; }
    winstonLogger.debug(formatMsg(meta, message ?? ''), isProduction ? meta : {});
  },
  info: (meta: Meta | string, message?: string) => {
    if (typeof meta === 'string') { winstonLogger.info(meta); return; }
    winstonLogger.info(formatMsg(meta, message ?? ''), isProduction ? meta : {});
  },
  warn: (meta: Meta | string, message?: string) => {
    if (typeof meta === 'string') { winstonLogger.warn(meta); return; }
    winstonLogger.warn(formatMsg(meta, message ?? ''), isProduction ? meta : {});
  },
  error: (meta: Meta | string, message?: string) => {
    if (typeof meta === 'string') { winstonLogger.error(meta); return; }
    winstonLogger.error(formatMsg(meta, message ?? ''), isProduction ? meta : {});
  },
  child: (defaultMeta: Meta) => {
    const child = winstonLogger.child(defaultMeta);
    return {
      debug: (meta: Meta | string, message?: string) => {
        if (typeof meta === 'string') { child.debug(meta); return; }
        child.debug(formatMsg(meta, message ?? ''), isProduction ? meta : {});
      },
      info: (meta: Meta | string, message?: string) => {
        if (typeof meta === 'string') { child.info(meta); return; }
        child.info(formatMsg(meta, message ?? ''), isProduction ? meta : {});
      },
      warn: (meta: Meta | string, message?: string) => {
        if (typeof meta === 'string') { child.warn(meta); return; }
        child.warn(formatMsg(meta, message ?? ''), isProduction ? meta : {});
      },
      error: (meta: Meta | string, message?: string) => {
        if (typeof meta === 'string') { child.error(meta); return; }
        child.error(formatMsg(meta, message ?? ''), isProduction ? meta : {});
      },
    };
  },
};

export type Logger = typeof logger;
export type ChildLogger = ReturnType<typeof logger.child>;
