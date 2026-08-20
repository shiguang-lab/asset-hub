/** True only while rendering in a browser environment. */
export function isClient(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
