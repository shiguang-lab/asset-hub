/**
 * Minimal mirrors of the server contract for the fields this plugin uses. The
 * `@shiguang/contracts` package is deliberately not reused: it pulls in zod and
 * a large unrelated surface, and the plugin ships to users as a downloaded
 * bundle. Field names are kept aligned by fixture tests.
 */

export interface RemoteAsset {
  id: string;
  type: string;
  title: string;
  path: string;
  status: string;
  lockVersion: number;
  currentVersionId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteAssetContent {
  kind: string;
  text: string | null;
  manifest: unknown;
  refs: unknown[];
}

export interface RemoteAssetDetail extends RemoteAsset {
  content: RemoteAssetContent | null;
  version?: { id: string; contentHash: string; size: number } | null;
}

export interface AssetPage {
  items: RemoteAsset[];
  nextCursor: string | null;
  total: number;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface OAuthErrorResponse {
  error: string;
  error_description?: string;
}
