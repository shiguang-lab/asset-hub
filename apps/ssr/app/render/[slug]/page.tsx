import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PublicReader, type PublicReaderContent } from "../../components/public-reader";
import { renderServerMarkdown } from "../../server-markdown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await fetchPublicContent(slug);
  return content ? { title: content.title, robots: { index: false, follow: false } } : {};
}

export default async function RenderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await fetchPublicContent(slug);
  if (!content) notFound();
  return (
    <PublicReader
      slug={slug}
      content={content}
      serverMarkdownHtml={renderServerMarkdown(content.markdown, content.assetLinks)}
    />
  );
}

async function fetchPublicContent(slug: string): Promise<PublicReaderContent | null> {
  const gateway = process.env.PUBLIC_GATEWAY_INTERNAL_URL ?? "http://public-gateway:3004";
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${gateway}/p/${encodeURIComponent(slug)}/content`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });
  if (response.status === 401) {
    redirect(`/p/${encodeURIComponent(slug)}`);
  }
  if (!response.ok) return null;
  return (await response.json()) as PublicReaderContent;
}
