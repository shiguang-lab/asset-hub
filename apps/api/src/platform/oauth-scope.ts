/**
 * OAuth scopes granted to first-party native clients, mapped onto the internal
 * `read` / `write` vocabulary that `IdentityService.requireWrite` and the
 * request authorization hook already enforce.
 */
export const OAUTH_SCOPE_DOCUMENTS_READ = "documents:read";
export const OAUTH_SCOPE_DOCUMENTS_WRITE = "documents:write";
export const OAUTH_SCOPE_OFFLINE_ACCESS = "offline_access";

export type TokenScope = "read" | "write";

/**
 * `documents:write` implies read, matching the authorization server's consent
 * copy and RFC 6749 §3.3 (a granted scope authorises at least what it names).
 */
export function mapOAuthScopes(scope: string | undefined): TokenScope[] {
  const granted = new Set(
    (scope ?? "")
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  const result: TokenScope[] = [];
  if (granted.has(OAUTH_SCOPE_DOCUMENTS_READ) || granted.has(OAUTH_SCOPE_DOCUMENTS_WRITE)) {
    result.push("read");
  }
  if (granted.has(OAUTH_SCOPE_DOCUMENTS_WRITE)) {
    result.push("write");
  }
  return result;
}
