import { parsePresentationHtml, serializePresentationHtml } from "./presentation-ast.js";

export interface PresentationEditElement {
  id: string;
  kind: string;
  tagName: string;
  text?: string;
  editable: boolean;
  pageId?: string;
  sourceRef?: string;
  chart?: string;
  animation?: { enter?: string; delay?: string; duration?: string };
}

export interface PresentationEditManifest {
  version: 1;
  pages: Array<{ id: string; index: number; title: string }>;
  elements: PresentationEditElement[];
}

export interface InstrumentedPresentation {
  html: string;
  manifest: PresentationEditManifest;
  changed: boolean;
}

export interface PresentationAnnotation {
  id: string;
  role?: string;
  editable?: boolean;
  groupId?: string;
}

interface Node {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
  value?: string;
}

const TEXT_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "p",
  "li",
  "span",
  "strong",
  "em",
  "blockquote",
  "figcaption",
]);
const SKIP_TAGS = new Set(["html", "head", "body", "style", "script", "template"]);

function textOf(node: Node): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("").replace(/\s+/g, " ").trim();
}

function walk(
  node: Node,
  fn: (node: Node, parent: Node | null) => void,
  parent: Node | null = null,
): void {
  if (node.type !== "element") return;
  fn(node, parent);
  for (const child of node.children ?? []) walk(child, fn, node);
}

function attr(node: Node, key: string): string | undefined {
  const value = node.properties?.[key];
  return typeof value === "string" ? value : value == null ? undefined : String(value);
}

function setAttr(node: Node, key: string, value: string): void {
  node.properties = { ...(node.properties ?? {}), [key]: value };
}

/** Ensure page-scoped author CSS can address the stable SG page identity. */
export function ensurePresentationPageIds(html: string): string {
  const tree = parsePresentationHtml(html) as unknown as Node & { children?: Node[] };
  let changed = false;
  for (const root of tree.children ?? []) {
    walk(root, (node) => {
      if (node.tagName !== "section" || !attr(node, "dataSgPage")) return;
      const pageId = attr(node, "dataSgId");
      if (pageId && !attr(node, "id")) {
        setAttr(node, "id", pageId);
        changed = true;
      }
      // Author CSS conventionally scopes page rules as `.page-N`. The native
      // id only serves `#page-N` selectors, so the same identity is mirrored
      // as a class token or those rules silently never match.
      if (pageId && addClassToken(node, pageId)) changed = true;
    });
  }
  return changed ? serializePresentationHtml(tree as never) : html;
}

/** hast stores `class` as a camelCase `className` array; legacy `class` strings may also appear. */
function classTokens(node: Node): string[] {
  const value = node.properties?.className ?? node.properties?.["class"];
  if (Array.isArray(value)) return value.map((token) => String(token));
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

function className(node: Node): string {
  return classTokens(node).join(" ");
}

function addClassToken(node: Node, token: string): boolean {
  const tokens = classTokens(node);
  if (tokens.includes(token)) return false;
  node.properties = { ...(node.properties ?? {}), className: [...tokens, token] };
  return true;
}

function inferKind(node: Node): string | null {
  const tag = node.tagName ?? "";
  if (attr(node, "dataSgKind")) return attr(node, "dataSgKind") ?? null;
  if (attr(node, "dataSgChart")) return "chart";
  if (attr(node, "dataSgCounter")) return "counter";
  if (tag === "img" || tag === "video" || tag === "audio") return "image";
  if (tag === "a") return "link";
  if (tag === "table") return "table";
  const classes = className(node).toLowerCase();
  if (/(^|[-_ ])(chart|graph|plot)([-_ ]|$)/.test(classes)) return "chart";
  if (/(^|[-_ ])(table|data-table)([-_ ]|$)/.test(classes)) return "table";
  if (/(^|[-_ ])(metric|kpi|stat)([-_ ]|$)/.test(classes)) return "metric";
  if (/(^|[-_ ])(quote|timeline|process|quadrant|diagram|flow)([-_ ]|$)/.test(classes))
    return "code-island";
  if (TEXT_TAGS.has(tag)) return "text";
  if (tag === "svg" || tag === "canvas") return "code-island";
  return null;
}

/**
 * 将 AI 自由生成的 HTML 编译成可局部编辑的 SG Artifact。
 * 这一阶段只补充锚点和 manifest，不改变布局、文案或视觉样式。
 */
export function instrumentPresentationHtml(html: string): InstrumentedPresentation {
  const tree = parsePresentationHtml(html) as unknown as Node & { children?: Node[] };
  const manifest: PresentationEditManifest = { version: 1, pages: [], elements: [] };
  // Repair outputs frequently echo `data-sg-id` values copied from the section
  // they were asked to fix. Re-assigning ids around those echoes must skip them
  // (and duplicate echoes must be renumbered) or two elements end up sharing
  // one identity and the annotation stage can no longer tell them apart.
  const usedElementIds = new Set<string>();
  for (const root of tree.children ?? []) {
    walk(root, (node) => {
      const id = attr(node, "dataSgId");
      if (id) usedElementIds.add(id);
    });
  }
  const seenElementIds = new Set<string>();
  let changed = false;
  let pageIndex = 0;
  for (const root of tree.children ?? []) {
    walk(root, (node) => {
      if (node.tagName !== "section" || !attr(node, "dataSgPage")) return;
      const pageId = attr(node, "dataSgId") || `page-ai-${pageIndex + 1}`;
      if (!attr(node, "dataSgId")) {
        setAttr(node, "dataSgId", pageId);
        usedElementIds.add(pageId);
        changed = true;
      }
      // Generated page-scoped CSS commonly targets `#page-N`.  The SG
      // protocol uses data-sg-id as the stable identity, but leaving out the
      // native id attribute makes those rules silently miss the page and can
      // collapse the generated layout to unstyled text.  Keep both forms in
      // the final artifact so editor, iframe playback and public snapshots
      // resolve the same page selector.
      if (!attr(node, "id")) {
        setAttr(node, "id", pageId);
        changed = true;
      }
      // `.page-N` class selectors are just as common in author CSS; mirroring
      // the identity as a class token keeps those rules live too.
      if (addClassToken(node, pageId)) changed = true;
      manifest.pages.push({
        id: pageId,
        index: pageIndex,
        title: attr(node, "ariaLabel") || textOf(node).slice(0, 80),
      });
      const currentPage = pageIndex;
      walk(node, (child) => {
        if (child === node || SKIP_TAGS.has(child.tagName ?? "")) return;
        const kind = inferKind(child);
        if (!kind) return;
        let id = attr(child, "dataSgId") || "";
        if (id && seenElementIds.has(id)) {
          // A later element already claimed this id (an echoed duplicate);
          // hand out a fresh one so identities stay unique.
          id = "";
        } else if (id) {
          seenElementIds.add(id);
        }
        if (!id) {
          let number = manifest.elements.length + 1;
          id = `el-ai-${currentPage + 1}-${number}`;
          while (usedElementIds.has(id)) {
            number += 1;
            id = `el-ai-${currentPage + 1}-${number}`;
          }
          usedElementIds.add(id);
        }
        seenElementIds.add(id);
        if (attr(child, "dataSgId") !== id) {
          setAttr(child, "dataSgId", id);
          changed = true;
        }
        if (!attr(child, "dataSgKind")) {
          setAttr(child, "dataSgKind", kind);
          changed = true;
        }
        if (!attr(child, "dataSgEditable")) {
          setAttr(child, "dataSgEditable", kind === "code-island" ? "region" : "true");
          changed = true;
        }
        const animation = {
          enter: attr(child, "dataSgEnter"),
          delay: attr(child, "dataSgDelay"),
          duration: attr(child, "dataSgDuration"),
        };
        manifest.elements.push({
          id,
          kind,
          tagName: child.tagName ?? "div",
          text: textOf(child).slice(0, 1000),
          editable: kind !== "code-island",
          pageId,
          sourceRef: attr(child, "dataSgSource"),
          chart: attr(child, "dataSgChart"),
          animation,
        });
      });
      pageIndex += 1;
    });
  }
  return { html: serializePresentationHtml(tree as never), manifest, changed };
}

/** 第二阶段 AI 只写语义元数据，不触碰原始 HTML 的布局和内容。 */
export function applyPresentationAnnotations(
  html: string,
  annotations: PresentationAnnotation[],
): string {
  if (annotations.length === 0) return html;
  const tree = parsePresentationHtml(html) as unknown as Node & { children?: Node[] };
  const byId = new Map(annotations.map((annotation) => [annotation.id, annotation]));
  for (const root of tree.children ?? []) {
    walk(root, (node) => {
      const id = attr(node, "dataSgId");
      const annotation = id ? byId.get(id) : undefined;
      if (!annotation) return;
      if (annotation.role) setAttr(node, "dataSgRole", annotation.role);
      if (annotation.groupId) setAttr(node, "dataSgGroup", annotation.groupId);
      if (annotation.editable !== undefined)
        setAttr(node, "dataSgEditable", String(annotation.editable));
    });
  }
  return serializePresentationHtml(tree as never);
}
