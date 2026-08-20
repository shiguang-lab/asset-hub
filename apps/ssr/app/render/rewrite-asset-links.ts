import { rewriteMarkdownReferences } from "@shiguang/content";
import type { PublicReaderContent } from "../components/public-reader";

/** Resolve asset: references before either renderer receives the source. */
export function rewriteAssetLinks(content: PublicReaderContent): string {
  return rewriteMarkdownReferences(content.markdown, ({ src }) => {
    if (!src.startsWith("asset:")) return null;
    return content.assetLinks[src.slice("asset:".length)] ?? null;
  });
}
