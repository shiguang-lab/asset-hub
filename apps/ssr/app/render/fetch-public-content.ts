import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PublicReaderContent } from "../components/public-reader";

export async function fetchPublicContent(
  slug: string,
  referenceAssetId?: string,
): Promise<PublicReaderContent | null> {
  const gateway = process.env.PUBLIC_GATEWAY_INTERNAL_URL ?? "http://public-gateway:3004";
  const cookieHeader = (await cookies()).toString();
  const query = referenceAssetId ? `?ref=${encodeURIComponent(referenceAssetId)}` : "";
  const response = await fetch(`${gateway}/p/${encodeURIComponent(slug)}/content${query}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });
  if (response.status === 401) {
    redirect(`/p/${encodeURIComponent(slug)}`);
  }
  if (!response.ok) return null;
  return (await response.json()) as PublicReaderContent;
}
