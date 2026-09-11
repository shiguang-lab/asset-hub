import type { AuthState } from "./auth/token-store.js";

export interface PluginSettings {
  /** Public origin of the authorization server, e.g. https://shiguanglab.com */
  serverUrl: string;
  /** Base URL of the asset hub API. */
  apiUrl: string;
  /** Web application embedded in the Obsidian workspace. */
  webUrl: string;

  syncRoot: string;
  syncEnabled: boolean;
  /** Minutes between automatic rounds; 0 disables the timer. */
  autoSyncInterval: number;
  syncOnStartup: boolean;
  /** Subscribe to server events so remote edits arrive without polling. */
  realtimeEnabled: boolean;

  /**
   * Off by default: deleting a server document from a local delete is the one
   * irreversible action in the plugin, and an orphaned copy is harmless.
   */
  deleteRemoteOnLocalDelete: boolean;
  /** On by default: the server is the shared source of truth. */
  deleteLocalOnRemoteDelete: boolean;

  showStatusBar: boolean;
  /** Prints sync decisions to the developer console. */
  debugLogging: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  serverUrl: "https://shiguanglab.com",
  apiUrl: "https://doc.shiguanglab.com/api/v1",
  webUrl: "https://doc.shiguanglab.com",
  syncRoot: "拾光资产中心",
  syncEnabled: false,
  autoSyncInterval: 5,
  syncOnStartup: true,
  realtimeEnabled: true,
  deleteRemoteOnLocalDelete: false,
  deleteLocalOnRemoteDelete: false,
  showStatusBar: true,
  debugLogging: false,
};

/** `data.json` in the plugin directory. */
export interface PersistedData {
  settings?: Partial<PluginSettings>;
  auth?: AuthState | EncryptedAuthState | null;
}

export interface EncryptedAuthState {
  format: "electron-safe-storage-v1";
  ciphertext: string;
}

/**
 * Overlays stored settings on the defaults.
 *
 * String fields are re-validated rather than trusted: `data.json` is a plain
 * file the user can edit, and a `null` there would otherwise throw during
 * `onload` and leave the plugin unable to start.
 */
export function mergeSettings(stored: Partial<PluginSettings> | undefined): PluginSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  merged.syncRoot = asText(merged.syncRoot).trim() || DEFAULT_SETTINGS.syncRoot;
  merged.serverUrl = asEndpoint(merged.serverUrl, DEFAULT_SETTINGS.serverUrl);
  merged.apiUrl = asEndpoint(merged.apiUrl, DEFAULT_SETTINGS.apiUrl);
  merged.webUrl = asEndpoint(merged.webUrl, DEFAULT_SETTINGS.webUrl);
  return merged;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asEndpoint(value: unknown, fallback: string): string {
  return asText(value).trim().replace(/\/+$/, "") || fallback;
}
