/**
 * Stand-in for the `obsidian` module under vitest. Only the value imports that
 * the pure-logic modules reach transitively need to exist; anything that needs
 * a live Obsidian instance (views, settings) is not unit-tested.
 */

export function requestUrl(): never {
  throw new Error("obsidian.requestUrl() is unavailable in unit tests");
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export class TFile {}

export class TAbstractFile {}

export class Notice {
  constructor(
    readonly message: string,
    readonly timeout?: number,
  ) {}
}
