import type { EncryptedAuthState } from "../settings.js";
import type { AuthState } from "./token-store.js";

interface SafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

function safeStorage(): SafeStorage | null {
  const load = (window as unknown as { require?: (name: string) => { safeStorage?: SafeStorage } }).require;
  try {
    const storage = load?.("electron").safeStorage;
    return storage?.isEncryptionAvailable() ? storage : null;
  } catch { return null; }
}

export function encodeAuth(state: AuthState): EncryptedAuthState | null {
  const storage = safeStorage();
  if (!storage) return null;
  return { format: "electron-safe-storage-v1", ciphertext: storage.encryptString(JSON.stringify(state)).toString("base64") };
}

export function decodeAuth(value: AuthState | EncryptedAuthState | null | undefined): AuthState | null {
  if (!value) return null;
  if (!("format" in value)) return value;
  const storage = safeStorage();
  if (!storage) return null;
  try { return JSON.parse(storage.decryptString(Buffer.from(value.ciphertext, "base64"))) as AuthState; } catch { return null; }
}
