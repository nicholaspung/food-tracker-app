/**
 * Custom logger that only logs in development mode
 * Usage: import { logger } from '@/lib/logger'
 * Then use: logger.log(), logger.warn(), logger.error(), etc.
 */

const isDev = import.meta.env.DEV;

type LogFunction = (...args: any[]) => void;

interface Logger {
  log: LogFunction;
  warn: LogFunction;
  error: LogFunction;
  info: LogFunction;
  debug: LogFunction;
  table: typeof console.table;
  group: typeof console.group;
  groupEnd: typeof console.groupEnd;
  groupCollapsed: typeof console.groupCollapsed;
  time: typeof console.time;
  timeEnd: typeof console.timeEnd;
}

// No-op function for production
const noop: LogFunction = () => {};
const noopTable = () => {};
const noopGroup = () => {};

export const logger: Logger = {
  log: isDev ? console.log.bind(console) : noop,
  warn: isDev ? console.warn.bind(console) : noop,
  error: isDev ? console.error.bind(console) : noop,
  info: isDev ? console.info.bind(console) : noop,
  debug: isDev ? console.debug.bind(console) : noop,
  table: isDev ? console.table.bind(console) : noopTable,
  group: isDev ? console.group.bind(console) : noopGroup,
  groupEnd: isDev ? console.groupEnd.bind(console) : noopGroup,
  groupCollapsed: isDev ? console.groupCollapsed.bind(console) : noopGroup,
  time: isDev ? console.time.bind(console) : noop,
  timeEnd: isDev ? console.timeEnd.bind(console) : noop,
};

// Export the current environment mode for convenience
export const isDevMode = isDev;
export const isProdMode = !isDev;
