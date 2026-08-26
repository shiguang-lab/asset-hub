const DEFAULT_LOGIN_ORIGIN = "https://shiguanglab.com";

type BrowserLocation = Pick<
  Location,
  "hash" | "href" | "hostname" | "origin" | "pathname" | "search"
>;

interface UnifiedSessionResponse {
  localBroker?: boolean;
  authenticated?: boolean;
  subject?: string;
  displayName?: string;
  email?: string;
  preferredUsername?: string;
  organization?: { id: string; name: string } | null;
  roles?: string[];
  platformRoles?: string[];
  user?: {
    id: string;
    username: string;
    tenantType?: "user" | "org";
    tenantId?: string;
    orgId?: string;
    orgRoles?: string[];
  };
}

export interface AuthSession {
  id: string;
  displayName: string;
  email: string | null;
  tenantType: "user" | "org";
  tenantId: string;
  organizationName: string | null;
  roles: string[];
  localBroker?: true;
}

export type OrganizationRole = "org:admin" | "org:member" | "org:viewer";

export interface AccountOrganization {
  id: string;
  name: string;
  roles: OrganizationRole[];
}

export interface OrganizationMember {
  userId: string;
  displayName: string;
  loginName: string;
  roles: OrganizationRole[];
}

let activeSession: AuthSession | null = null;
let redirecting = false;

export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function currentReturnTo(location: BrowserLocation): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function unifiedLoginUrl(location: BrowserLocation = window.location): string {
  const local = isLoopbackHost(location.hostname);
  const loginOrigin = local
    ? location.origin
    : (import.meta.env.VITE_UNIFIED_LOGIN_ORIGIN ?? DEFAULT_LOGIN_ORIGIN).replace(/\/$/, "");
  const returnTo = local ? currentReturnTo(location) : location.href;
  return `${loginOrigin}/login?return_to=${encodeURIComponent(returnTo)}`;
}

export function redirectToUnifiedLogin(location: BrowserLocation = window.location): void {
  if (redirecting) return;
  redirecting = true;
  window.location.replace(unifiedLoginUrl(location));
}

export async function fetchAuthSession(): Promise<AuthSession | null> {
  try {
    const response = await fetch("/api/auth/session", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as UnifiedSessionResponse;
    activeSession = normalizeSession(body);
    return activeSession;
  } catch {
    return null;
  }
}

export function getAuthSession(): AuthSession | null {
  return activeSession;
}

export function canWriteWorkspace(session: AuthSession | null = activeSession): boolean {
  if (!session) return false;
  return (
    session.tenantType === "user" ||
    session.roles.includes("org:admin") ||
    session.roles.includes("org:member")
  );
}

export function isWorkspaceAdmin(session: AuthSession | null = activeSession): boolean {
  if (!session) return false;
  return session.tenantType === "user" || session.roles.includes("org:admin");
}

/**
 * 本地 Broker 不可用时抛出的专属错误：表示“身份服务在线但本地自动登录链路断开”，
 * 此时不应跳转到统一登录页（会触发 /login ⇄ / 重定向死循环），而应展示明确的错误页。
 */
export class BrokerUnavailableError extends Error {
  constructor(message = "本地身份 Broker 不可用") {
    super(message);
    this.name = "BrokerUnavailableError";
  }
}

export async function requireAuthSession(): Promise<AuthSession | null> {
  const response = await fetch("/api/auth/session", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  // 本地 broker 模式下，session 接口由 vite 中间件代理。若 broker 向后端换取身份失败，
  // 中间件返回 503 + {error:"local_broker_unavailable"}。这种情况不要跳登录页死循环。
  if (response.status === 503) {
    let code = "";
    try {
      const body = (await response.json()) as { error?: string };
      code = body.error ?? "";
    } catch {
      code = "";
    }
    if (code === "local_broker_unavailable") throw new BrokerUnavailableError();
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json()) as UnifiedSessionResponse;
  activeSession = normalizeSession(body);
  if (!activeSession) redirectToUnifiedLogin();
  return activeSession;
}

export async function performLogout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    // The local session is discarded even if the remote logout request fails.
  }
  activeSession = null;
  redirecting = false;
  redirectToUnifiedLogin();
}

export async function fetchMyOrganizations(): Promise<AccountOrganization[]> {
  const body = await authRequest<{ organizations: AccountOrganization[] }>("/api/account/orgs");
  return body.organizations;
}

export async function switchContext(organizationId: string): Promise<void> {
  await authRequest("/api/auth/context", {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });
}

export async function fetchOrganizationMembers(
  organizationId: string,
): Promise<OrganizationMember[]> {
  const body = await authRequest<{ members: OrganizationMember[] }>(
    `/api/account/orgs/${encodeURIComponent(organizationId)}/members`,
  );
  return body.members;
}

export async function addOrganizationMember(
  organizationId: string,
  loginName: string,
  role: OrganizationRole,
): Promise<OrganizationMember> {
  return authRequest(`/api/account/orgs/${encodeURIComponent(organizationId)}/members`, {
    method: "POST",
    body: JSON.stringify({ loginName, role }),
  });
}

export async function updateOrganizationMember(
  organizationId: string,
  userId: string,
  role: OrganizationRole,
): Promise<void> {
  await authRequest(
    `/api/account/orgs/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export async function removeOrganizationMember(
  organizationId: string,
  userId: string,
): Promise<void> {
  await authRequest(
    `/api/account/orgs/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

async function authRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401 && !activeSession?.localBroker) redirectToUnifiedLogin();
    let problem: { error?: string; detail?: string } = {};
    try {
      problem = (await response.json()) as typeof problem;
    } catch {
      problem = {};
    }
    throw new Error(problem.detail ?? authErrorMessage(problem.error, response.status));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function authErrorMessage(code: string | undefined, status: number): string {
  const messages: Record<string, string> = {
    invalid_request: "提交的信息不完整",
    user_not_found: "未找到该登录账号",
    member_exists: "该用户已经在当前 Group 中",
    last_admin: "Group 至少需要保留一名管理员",
  };
  return (code && messages[code]) || `请求失败 (${status})`;
}

function normalizeSession(body: UnifiedSessionResponse): AuthSession | null {
  if (body.user?.id) {
    const orgId = body.user.orgId;
    return {
      id: body.user.id,
      displayName: body.user.username || body.user.id,
      email: null,
      tenantType: body.user.tenantType ?? (orgId ? "org" : "user"),
      tenantId: body.user.tenantId ?? orgId ?? body.user.id,
      organizationName: null,
      roles: body.user.orgRoles ?? [],
      ...(body.localBroker === true ? { localBroker: true as const } : {}),
    };
  }
  if (body.authenticated !== true || !body.subject) return null;
  const organization = body.organization ?? null;
  return {
    id: body.subject,
    displayName: body.displayName?.trim() || body.preferredUsername?.trim() || body.subject,
    email: body.email?.trim() || null,
    tenantType: organization ? "org" : "user",
    tenantId: organization?.id ?? body.subject,
    organizationName: organization?.name ?? null,
    roles: [...(body.roles ?? []), ...(body.platformRoles ?? [])],
    ...(body.localBroker === true ? { localBroker: true as const } : {}),
  };
}
