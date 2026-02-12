/* eslint-disable no-console */
const shouldLog = __DEV__;

export const logger = {
  log: (...args: unknown[]) => {
    if (shouldLog) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (shouldLog) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (shouldLog) {
      console.error(...args);
    }
  },
};
