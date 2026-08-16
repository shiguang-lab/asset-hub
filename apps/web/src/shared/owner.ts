import type { AuthSession } from "../auth/session.js";
import type { Asset } from "../entities/api.js";

type OwnedResource = Pick<Asset, "ownerSubject" | "ownerDisplayName">;

export function isOwnedBySession(
  resource: Pick<OwnedResource, "ownerSubject">,
  session: AuthSession | null,
): boolean {
  if (!session) return false;
  return (
    resource.ownerSubject === session.id ||
    (import.meta.env.DEV && resource.ownerSubject === "dev-user")
  );
}

export function ownerDisplayName(resource: OwnedResource, session: AuthSession | null): string {
  if (isOwnedBySession(resource, session)) return session?.displayName || "我";
  const displayName = resource.ownerDisplayName?.trim();
  if (displayName) return displayName;
  if (resource.ownerSubject.startsWith("api-token:")) return "API Token";
  const subject = resource.ownerSubject.replace(/^user:/, "").trim();
  return subject || "未知用户";
}
