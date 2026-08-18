/**
 * 内容级资产引用：解析正文里的 `asset:<assetId>` 链接，并在渲染后的 HTML 中重写。
 *
 * 语法约定（见 docs/architecture/content-reference-protocol.md）：
 *   - 链接：[显示文本](asset:<assetId>)
 *   - 图片：![alt](asset:<assetId>)
 */

export interface AssetReference {
  assetId: string;
  kind: "link" | "image";
  label: string;
}

export type AssetLinkResolver = (ref: { assetId: string; kind: "link" | "image" }) => string | null;

/** 与 contracts 的 idSchema 对齐：`<prefix>_<8..40 位字母数字>`。 */
const ASSET_ID_PATTERN = "[A-Za-z0-9]+_[A-Za-z0-9]{8,40}";

const REFERENCE_RE = new RegExp(`(!)?\\[([^\\]]*)\\]\\(asset:(${ASSET_ID_PATTERN})\\)`, "g");
const HTML_LINK_RE = new RegExp(`href=["']asset:(${ASSET_ID_PATTERN})["']`, "g");
const HTML_IMAGE_RE = new RegExp(`src=["']asset:(${ASSET_ID_PATTERN})["']`, "g");

export function parseAssetReferences(markdown: string): AssetReference[] {
  const references: AssetReference[] = [];
  let match: RegExpExecArray | null = REFERENCE_RE.exec(markdown);
  while (match !== null) {
    references.push({
      assetId: match[3] ?? "",
      kind: match[1] ? "image" : "link",
      label: match[2] ?? "",
    });
    match = REFERENCE_RE.exec(markdown);
  }
  return references;
}

/**
 * 解析原始 HTML 里的 `href="asset:<id>"` / `src="asset:<id>"`（单双引号均可），
 * 用于 HTML 资产或正文里内嵌的原生 HTML 引用。
 */
export function parseHtmlAssetReferences(html: string): AssetReference[] {
  const references: AssetReference[] = [];
  let match: RegExpExecArray | null = HTML_LINK_RE.exec(html);
  while (match !== null) {
    references.push({ assetId: match[1] ?? "", kind: "link", label: "" });
    match = HTML_LINK_RE.exec(html);
  }
  let imageMatch: RegExpExecArray | null = HTML_IMAGE_RE.exec(html);
  while (imageMatch !== null) {
    references.push({ assetId: imageMatch[1] ?? "", kind: "image", label: "" });
    imageMatch = HTML_IMAGE_RE.exec(html);
  }
  return references;
}

/**
 * 把已渲染 HTML 里的 `href="asset:<id>"` / `src="asset:<id>"`（单双引号均可）交给 resolver 重写。
 * resolver 返回 null 时保留原样（不做替换）。
 */
export function rewriteAssetLinks(html: string, resolver: AssetLinkResolver): string {
  return html
    .replace(
      new RegExp(`href=(["'])asset:(${ASSET_ID_PATTERN})\\1`, "g"),
      (full, quote: string, id: string) => {
        const resolved = resolver({ assetId: id, kind: "link" });
        return resolved === null ? full : `href=${quote}${escapeAttr(resolved)}${quote}`;
      },
    )
    .replace(
      new RegExp(`src=(["'])asset:(${ASSET_ID_PATTERN})\\1`, "g"),
      (full, quote: string, id: string) => {
        const resolved = resolver({ assetId: id, kind: "image" });
        return resolved === null ? full : `src=${quote}${escapeAttr(resolved)}${quote}`;
      },
    );
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

/**
 * 正文里任意来源的引用（不只 `asset:`），供「导入增强」在 Markdown 里提取
 * 相对图片/资源路径，上传后重写为 `asset:<id>`。
 */
export interface MarkdownReference {
  kind: "link" | "image";
  /** 引用目标，去掉了 `<...>` 包裹与前后空白。 */
  src: string;
  label: string;
}

const MARKDOWN_REFERENCE_RE = /(!?)\[([^\]]*)\]\((<[^>\n]+>|[^()\s]+)(\s+[^)\n]*)?\)/g;

/** 提取 Markdown 里的所有链接与图片引用（不含 `<img src>` 原始 HTML）。 */
export function extractMarkdownReferences(markdown: string): MarkdownReference[] {
  const references: MarkdownReference[] = [];
  let match: RegExpExecArray | null = MARKDOWN_REFERENCE_RE.exec(markdown);
  while (match !== null) {
    const rawSrc = match[3] ?? "";
    const src = rawSrc.startsWith("<") && rawSrc.endsWith(">") ? rawSrc.slice(1, -1) : rawSrc;
    references.push({
      kind: match[1] ? "image" : "link",
      src,
      label: match[2] ?? "",
    });
    match = MARKDOWN_REFERENCE_RE.exec(markdown);
  }
  return references;
}

/**
 * 用 resolver 重写 Markdown 里的链接/图片 src；返回 null 时保留原样。
 * 只替换 src，标签文本、title 等一律不动；src 为 `<...>` 包裹时重写为裸 src。
 */
export function rewriteMarkdownReferences(
  markdown: string,
  resolve: (ref: MarkdownReference) => string | null,
): string {
  return markdown.replace(
    MARKDOWN_REFERENCE_RE,
    (full, bang: string, label: string, rawSrc: string, rest?: string) => {
      const src = rawSrc.startsWith("<") && rawSrc.endsWith(">") ? rawSrc.slice(1, -1) : rawSrc;
      const next = resolve({ kind: bang ? "image" : "link", src, label });
      if (next === null) return full;
      return `${bang}[${label}](${next}${rest ?? ""})`;
    },
  );
}

/** 判定 src 是否为「本地相对资源」：非空、非锚点、非协议/协议相对 URL。 */
export function isLocalReference(src: string): boolean {
  const value = src.trim();
  if (!value) return false;
  if (value.startsWith("#")) return false;
  if (value.startsWith("//")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  return true;
}
