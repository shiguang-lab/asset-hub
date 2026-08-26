import { cookies } from "next/headers";
import { rewriteAssetLinks, renderPresentationAccessHtml } from "@shiguang/content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const gateway = process.env.PUBLIC_GATEWAY_INTERNAL_URL ?? "http://public-gateway:3004";
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(
    `${gateway}/p/${encodeURIComponent(slug)}/presentation-content`,
    { headers: cookieHeader ? { cookie: cookieHeader } : undefined, cache: "no-store" },
  );
  if (response.status === 401) {
    return new Response("需要访问密码", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (!response.ok) return new Response("演示不存在", { status: response.status });
  const content = (await response.json()) as {
    title: string;
    html: string;
    visibility: string;
    allowDownload: boolean;
    allowCopy: boolean;
    assetLinks?: Record<string, string>;
  };
  const rewritten = rewriteAssetLinks(
    content.html,
    ({ assetId }) => content.assetLinks?.[assetId] ?? null,
  );
  const html = renderPresentationAccessHtml(rewritten, {
    visibility: content.visibility,
    allowCopy: content.allowCopy,
    downloadHref: content.allowDownload ? `/p/${encodeURIComponent(slug)}/download` : undefined,
    downloadLabel: "下载演示",
  });
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "content-security-policy": [
        "default-src 'self' data: blob:",
        "script-src 'self' 'unsafe-inline' https:",
        "style-src 'self' 'unsafe-inline' https:",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https:",
        "connect-src 'none'",
        "frame-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'none'",
        "base-uri 'none'",
        "object-src 'none'",
      ].join("; "),
    },
  });
}
