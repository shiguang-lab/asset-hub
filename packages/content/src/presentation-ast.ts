/**
 * Web Presentation —— HTML AST 编辑层。
 *
 * 依据《AI_Web_Presentation 技术设计文档》第 16/17 节：
 *   - 编辑器通过 DOM/AST 维护页面（不是 Regex / 字符串替换）；
 *   - `data-sg-id` 是定位元素的稳定锚点；
 *   - 所有人工编辑都应走 Editor Command（配合上层 Command History / Undo-Redo）。
 *
 * 注意：hast-util-from-html 产出的 properties 使用 camelCase（`dataSgId`），
 * 而 hast-util-to-html 序列化时还原为 kebab-case（`data-sg-id`）。
 */

import type { Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import { themeCssVariables } from "./presentation.js";

export type PresentationAst = Root;

interface LooseNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: LooseNode[];
  value?: string;
}

// data-sg-* 在 hast properties 中的 camelCase 形式
const SG_ID = "dataSgId";
const SG_PAGE = "dataSgPage";
const SG_KIND = "dataSgKind";
const SG_ENTER = "dataSgEnter";
const ARIA_LABEL = "ariaLabel";

function kebabToCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function parsePresentationHtml(html: string): PresentationAst {
  return fromHtml(html, { fragment: false }) as PresentationAst;
}

export function serializePresentationHtml(tree: PresentationAst): string {
  return toHtml(tree);
}

function toLoose(node: unknown): LooseNode {
  return node as LooseNode;
}

function walk(node: unknown, fn: (el: LooseNode) => void): void {
  const n = toLoose(node);
  if (n.type === "element" && n.properties) fn(n);
  if (n.children) for (const child of n.children) walk(child, fn);
}

function findElement(tree: PresentationAst, id: string): LooseNode | null {
  let found: LooseNode | null = null;
  for (const child of tree.children as unknown[]) {
    walk(child, (el) => {
      if (found) return;
      if (el.properties?.[SG_ID] === id) found = el;
    });
  }
  return found;
}

function findBody(tree: PresentationAst): LooseNode | null {
  let body: LooseNode | null = null;
  for (const child of tree.children as unknown[]) {
    walk(child, (el) => {
      if (!body && el.tagName === "body") body = el;
    });
  }
  return body;
}

function isPage(node: LooseNode): boolean {
  return (
    node.type === "element" && node.tagName === "section" && SG_PAGE in (node.properties ?? {})
  );
}

function bodyPages(body: LooseNode): LooseNode[] {
  return (body.children ?? []).filter(isPage);
}

/** 设置元素的纯文本内容（替换 children 为单个 text 节点）。 */
export function updateTextContent(tree: PresentationAst, id: string, value: string): boolean {
  const el = findElement(tree, id);
  if (!el) return false;
  el.children = [{ type: "text", value }];
  return true;
}

/** 更新图片 src（<img data-sg-kind="image">）。 */
export function updateImageSrc(tree: PresentationAst, id: string, src: string): boolean {
  const el = findElement(tree, id);
  if (el?.tagName !== "img") return false;
  el.properties = { ...(el.properties ?? {}), src };
  return true;
}

/** 更新链接 href（<a data-sg-kind="link">）。 */
export function updateLinkHref(tree: PresentationAst, id: string, href: string): boolean {
  const el = findElement(tree, id);
  if (el?.tagName !== "a") return false;
  el.properties = { ...(el.properties ?? {}), href };
  return true;
}

/** 通用 data-sg-* 属性写入（入参用 kebab-case，内部转 camelCase）。 */
export function setDataAttribute(
  tree: PresentationAst,
  id: string,
  name: string,
  value: string | null,
): boolean {
  const el = findElement(tree, id);
  if (!el) return false;
  const key = kebabToCamel(name);
  const props = { ...(el.properties ?? {}) };
  if (value === null) delete props[key];
  else props[key] = value;
  el.properties = props;
  return true;
}

export interface PresentationPageMeta {
  id: string;
  layout: string;
  title: string;
}

/** 列出所有页面的元信息（供编辑器左侧页面列表）。 */
export function listPages(tree: PresentationAst): PresentationPageMeta[] {
  const body = findBody(tree);
  if (!body) return [];
  return bodyPages(body).map((p) => ({
    id: String(p.properties?.[SG_ID] ?? ""),
    layout: String(p.properties?.[SG_PAGE] ?? ""),
    title: String(p.properties?.[ARIA_LABEL] ?? ""),
  }));
}

export function addPage(
  tree: PresentationAst,
  page: { id: string; layout: string; title: string },
): boolean {
  const body = findBody(tree);
  if (!body) return false;
  const section: LooseNode = {
    type: "element",
    tagName: "section",
    properties: {
      [SG_PAGE]: page.layout,
      [SG_ID]: `page-${page.id}`,
      [ARIA_LABEL]: page.title,
    },
    children: [
      {
        type: "element",
        tagName: "h2",
        properties: { [SG_ID]: `b-${page.id}`, [SG_KIND]: "text", [SG_ENTER]: "fade-up" },
        children: [{ type: "text", value: page.title }],
      },
    ],
  };
  const children = body.children ?? [];
  const pages = children.filter(isPage);
  const lastPage = pages[pages.length - 1];
  const lastIndex = lastPage ? children.lastIndexOf(lastPage) : -1;
  const insertAt = lastIndex >= 0 ? lastIndex + 1 : 0;
  children.splice(insertAt, 0, section);
  body.children = children;
  return true;
}

export function removePage(tree: PresentationAst, id: string): boolean {
  const body = findBody(tree);
  if (!body) return false;
  const children = body.children ?? [];
  const index = children.findIndex((c) => isPage(c) && c.properties?.[SG_ID] === id);
  if (index < 0) return false;
  children.splice(index, 1);
  body.children = children;
  return true;
}

export function movePage(tree: PresentationAst, id: string, direction: -1 | 1): boolean {
  const body = findBody(tree);
  if (!body) return false;
  const children = body.children ?? [];
  const index = children.findIndex((c) => isPage(c) && c.properties?.[SG_ID] === id);
  if (index < 0) return false;
  const target = index + direction;
  const targetNode = children[target];
  if (target < 0 || target >= children.length || !targetNode || !isPage(targetNode)) return false;
  const moved = children[index];
  if (!moved) return false;
  children.splice(index, 1);
  children.splice(target, 0, moved);
  body.children = children;
  return true;
}

export function duplicatePage(tree: PresentationAst, id: string, newId: string): boolean {
  const body = findBody(tree);
  if (!body) return false;
  const children = body.children ?? [];
  const index = children.findIndex((c) => isPage(c) && c.properties?.[SG_ID] === id);
  if (index < 0) return false;
  const source = children[index];
  if (!source) return false;
  const clone = JSON.parse(JSON.stringify(source)) as LooseNode;
  clone.properties = { ...(clone.properties ?? {}), [SG_ID]: newId };
  children.splice(index + 1, 0, clone);
  body.children = children;
  return true;
}

/* ---------------- Visual Editor 用：元素枚举 + Theme ---------------- */

export interface EditableElement {
  id: string;
  kind: string;
  tagName: string;
  text: string;
  src?: string;
  href?: string;
  enter?: string;
  hover?: string;
}

function textContent(node: LooseNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textContent).join("");
}

/** 列出指定页面内可编辑的元素（含 data-sg-id 的元素）。 */
export function listEditableElements(tree: PresentationAst, pageId: string): EditableElement[] {
  const body = findBody(tree);
  if (!body) return [];
  const page = bodyPages(body).find((p) => p.properties?.[SG_ID] === pageId);
  if (!page) return [];
  const result: EditableElement[] = [];
  walk(page, (el) => {
    if (el.tagName === "section") return; // 跳过页面本身
    const props = el.properties ?? {};
    const id = props[SG_ID];
    if (typeof id !== "string") return;
    const kind = typeof props[SG_KIND] === "string" ? String(props[SG_KIND]) : "text";
    result.push({
      id,
      kind,
      tagName: el.tagName ?? "div",
      text: textContent(el),
      src: typeof props.src === "string" ? props.src : undefined,
      href: typeof props.href === "string" ? props.href : undefined,
      enter: typeof props[SG_ENTER] === "string" ? String(props[SG_ENTER]) : undefined,
      hover: typeof props["dataSgHover"] === "string" ? String(props["dataSgHover"]) : undefined,
    });
  });
  return result;
}

function findStyle(tree: PresentationAst): LooseNode | null {
  let style: LooseNode | null = null;
  for (const child of tree.children as unknown[]) {
    walk(child, (el) => {
      if (!style && el.tagName === "style") style = el;
    });
  }
  return style;
}

/** 切换 Theme：替换 <style> 内首个 :root CSS Variables 块。 */
export function setTheme(tree: PresentationAst, theme: string): boolean {
  const style = findStyle(tree);
  if (!style) return false;
  const textNode = (style.children ?? []).find((c: LooseNode) => c.type === "text");
  if (!textNode) return false;
  const css = String(textNode.value ?? "");
  const next = css.replace(/^\s*:root\s*\{[^}]*\}/m, themeCssVariables(theme));
  if (next === css) return false;
  textNode.value = next;
  return true;
}
