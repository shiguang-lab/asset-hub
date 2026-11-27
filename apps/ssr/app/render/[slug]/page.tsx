import { notFound } from "next/navigation";

import { PublicReader } from "../../components/public-reader";
import { renderServerMarkdown } from "../../server-markdown";
import { fetchPublicContent } from "../fetch-public-content";

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
      snapshotHtml={renderServerMarkdown(content.markdown, content.assetLinks)}
    />
  );
}
