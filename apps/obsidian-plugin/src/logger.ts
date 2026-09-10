export interface Logger {
  debug(message: string, ...rest: unknown[]): void;
  info(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
  error(message: string, ...rest: unknown[]): void;
}

const PREFIX = "[资产中心]";

export function createLogger(verbose: () => boolean): Logger {
  return {
    debug: (message, ...rest) => {
      if (verbose()) console.debug(PREFIX, message, ...rest);
    },
    info: (message, ...rest) => console.info(PREFIX, message, ...rest),
    warn: (message, ...rest) => console.warn(PREFIX, message, ...rest),
    error: (message, ...rest) => console.error(PREFIX, message, ...rest),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
