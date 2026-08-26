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
import { type ThemePalette, themeCssVariables } from "./presentation.js";

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
// Read legacy animation metadata for backwards-compatible editing; new pages
// author animation CSS directly and never write this property.
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

function findPageHost(tree: PresentationAst): LooseNode | null {
  const body = findBody(tree);
  if (!body) return null;
  if (bodyPages(body).length > 0) return body;

  const stack = [...(body.children ?? [])];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node || node.type !== "element") continue;
    if (bodyPages(node).length > 0) return node;
    if (node.children) stack.unshift(...node.children);
  }
  return null;
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

/** 删除指定元素（从 DOM 树中移除该 data-sg-id 节点）。 */
export function removeElement(tree: PresentationAst, id: string): boolean {
  let removed = false;
  for (const child of tree.children as unknown[]) {
    walk(child, (el) => {
      if (removed) return;
      const parent = findParent(tree, id);
      if (parent && parent.children) {
        const idx = parent.children.findIndex((c) => (c as LooseNode).properties?.[SG_ID] === id);
        if (idx >= 0) {
          parent.children.splice(idx, 1);
          removed = true;
        }
      }
    });
  }
  return removed;
}

/** 定位元素的父节点（用于删除 / 移动子节点）。 */
function findParent(tree: PresentationAst, id: string): LooseNode | null {
  let parent: LooseNode | null = null;
  for (const child of tree.children as unknown[]) {
    walk(child, (el) => {
      if (parent) return;
      const kids = el.children ?? [];
      if (kids.some((c) => (c as LooseNode).properties?.[SG_ID] === id)) parent = el;
    });
  }
  return parent;
}

/**
 * 复制一组元素（跳过锁定的），每个副本 id 唯一、位置相对原位置偏移（dx%/dy%）防止重叠。
 * 返回新生成的元素 id 列表（供编辑器选中副本）。
 */
export function duplicateElements(tree: PresentationAst, ids: string[], dx = 4, dy = 4): string[] {
  const body = findBody(tree);
  if (!body) return [];
  const newIds: string[] = [];
  for (const id of ids) {
    const src = findElement(tree, id);
    if (!src) continue;
    if (src.properties?.["dataSgLock"] === "on") continue; // 锁定元素不复制
    const clone = JSON.parse(JSON.stringify(src)) as LooseNode;
    const nid = `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    clone.properties = { ...(clone.properties ?? {}), [SG_ID]: nid };
    // 偏移自由定位
    const px = clone.properties["dataSgX"];
    const py = clone.properties["dataSgY"];
    if (typeof px === "string") {
      const n = Number.parseFloat(px);
      if (!Number.isNaN(n)) clone.properties["dataSgX"] = `${n + dx}%`;
    }
    if (typeof py === "string") {
      const n = Number.parseFloat(py);
      if (!Number.isNaN(n)) clone.properties["dataSgY"] = `${n + dy}%`;
    }
    const parent = findParent(tree, id);
    const host = parent ?? body;
    host.children = host.children ?? [];
    host.children.push(clone);
    newIds.push(nid);
  }
  return newIds;
}

export interface PresentationPageMeta {
  id: string;
  layout: string;
  title: string;
}

/** 列出所有页面的元信息（供编辑器左侧页面列表）。 */
export function listPages(tree: PresentationAst): PresentationPageMeta[] {
  const host = findPageHost(tree);
  if (!host) return [];
  return bodyPages(host).map((p) => ({
    id: String(p.properties?.[SG_ID] ?? ""),
    layout: String(p.properties?.[SG_PAGE] ?? ""),
    title: String(p.properties?.[ARIA_LABEL] ?? ""),
  }));
}

export function addPage(
  tree: PresentationAst,
  page: { id: string; layout: string; title: string },
): boolean {
  const host = findPageHost(tree) ?? findBody(tree);
  if (!host) return false;
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
        properties: { [SG_ID]: `b-${page.id}`, [SG_KIND]: "text" },
        children: [{ type: "text", value: page.title }],
      },
    ],
  };
  const children = host.children ?? [];
  const pages = children.filter(isPage);
  const lastPage = pages[pages.length - 1];
  const lastIndex = lastPage ? children.lastIndexOf(lastPage) : -1;
  const insertAt = lastIndex >= 0 ? lastIndex + 1 : 0;
  children.splice(insertAt, 0, section);
  host.children = children;
  return true;
}

/**
 * 在指定页面之后插入新页面；afterId 为 null 或找不到时追加到末尾。
 * 比 addPage 更通用，供编辑器“分割线插入 / 底部新增”复用。
 */
export function insertPage(
  tree: PresentationAst,
  page: { id: string; layout: string; title: string },
  afterId: string | null = null,
): boolean {
  const host = findPageHost(tree) ?? findBody(tree);
  if (!host) return false;
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
        properties: { [SG_ID]: `b-${page.id}`, [SG_KIND]: "text" },
        children: [{ type: "text", value: page.title }],
      },
    ],
  };
  const children = host.children ?? [];
  const afterIndex = afterId
    ? children.findIndex((c) => isPage(c) && c.properties?.[SG_ID] === afterId)
    : -1;
  const insertAt = afterIndex >= 0 ? afterIndex + 1 : children.length;
  children.splice(insertAt, 0, section);
  host.children = children;
  return true;
}

export function removePage(tree: PresentationAst, id: string): boolean {
  const host = findPageHost(tree) ?? findBody(tree);
  if (!host) return false;
  const children = host.children ?? [];
  const index = children.findIndex((c) => isPage(c) && c.properties?.[SG_ID] === id);
  if (index < 0) return false;
  children.splice(index, 1);
  host.children = children;
  return true;
}

export function movePage(tree: PresentationAst, id: string, direction: -1 | 1): boolean {
  const host = findPageHost(tree) ?? findBody(tree);
  if (!host) return false;
  const children = host.children ?? [];
  const index = children.findIndex((c) => isPage(c) && c.properties?.[SG_ID] === id);
  if (index < 0) return false;
  const target = index + direction;
  const targetNode = children[target];
  if (target < 0 || target >= children.length || !targetNode || !isPage(targetNode)) return false;
  const moved = children[index];
  if (!moved) return false;
  children.splice(index, 1);
  children.splice(target, 0, moved);
  host.children = children;
  return true;
}

export function duplicatePage(tree: PresentationAst, id: string, newId: string): boolean {
  const host = findPageHost(tree) ?? findBody(tree);
  if (!host) return false;
  const children = host.children ?? [];
  const index = children.findIndex((c) => isPage(c) && c.properties?.[SG_ID] === id);
  if (index < 0) return false;
  const source = children[index];
  if (!source) return false;
  const clone = JSON.parse(JSON.stringify(source)) as LooseNode;
  clone.properties = { ...(clone.properties ?? {}), [SG_ID]: newId };
  children.splice(index + 1, 0, clone);
  host.children = children;
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
  /** data-sg-chart 原始 JSON 字符串（kind === "chart" 时存在）。 */
  chart?: string;
  /** data-sg-counter 目标数值字符串（kind === "counter" 时存在）。 */
  counter?: string;
  /** data-sg-color 文本颜色（CSS 颜色值，如 #7c5cff）。 */
  color?: string;
  /** data-sg-align 对齐方式：left / center / right。 */
  align?: string;
  /** data-sg-size 字号档位：sm / md / lg / xl。 */
  size?: string;
  /** data-sg-weight 字重：bold / normal（文本）。 */
  weight?: string;
  /** data-sg-style 字形：italic / normal（文本）。 */
  fontStyle?: string;
  /** data-sg-radius 图片圆角：none / sm / md / lg / full。 */
  radius?: string;
  /** data-sg-border 图片边框：on / 空。 */
  border?: string;
  /** data-sg-shadow 图片阴影：on / 空。 */
  shadow?: string;
  /** data-sg-fit 图片填充方式：cover（裁切填满，默认）/ contain（完整显示留白）/ fill（拉伸）。 */
  fit?: string;
  /** data-sg-filter 图片滤镜：none/grayscale/sepia/warm/cool/blur/brightness/contrast。 */
  filter?: string;
  /** data-sg-x 自由定位：相对页面宽度的百分比（如 "30%"）。 */
  x?: string;
  /** data-sg-y 自由定位：相对页面高度的百分比（如 "20%"）。 */
  y?: string;
  /** data-sg-w 元素宽度：相对页面宽度的百分比（如 "40%"）。未设则由内容决定。 */
  w?: string;
  /** data-sg-h 元素高度：相对页面高度的百分比（如 "20%"）。未设则由内容决定。 */
  h?: string;
  /** data-sg-z 层级：整数，越大越靠上（如 "3"）。未设则按 DOM 顺序。 */
  z?: string;
  /** data-sg-rot 旋转角度：度数（如 "15" 表示 15deg）。未设为 0。 */
  rot?: string;
  /** data-sg-lock 锁定：on 时元素在编辑器中不可拖拽/缩放/旋转/删除（防误改）。 */
  lock?: string;
  /** data-sg-hidden 隐藏：on 时元素在编辑预览与播放中均不显示（临时屏蔽）。 */
  hidden?: string;
}

function textContent(node: LooseNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textContent).join("");
}

/** 列出指定页面内可编辑的元素（含 data-sg-id 的元素）。 */
export function listEditableElements(tree: PresentationAst, pageId: string): EditableElement[] {
  const host = findPageHost(tree);
  if (!host) return [];
  const page = bodyPages(host).find((p) => p.properties?.[SG_ID] === pageId);
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
      chart: typeof props["dataSgChart"] === "string" ? String(props["dataSgChart"]) : undefined,
      counter:
        typeof props["dataSgCounter"] === "string" ? String(props["dataSgCounter"]) : undefined,
      color: typeof props["dataSgColor"] === "string" ? String(props["dataSgColor"]) : undefined,
      align: typeof props["dataSgAlign"] === "string" ? String(props["dataSgAlign"]) : undefined,
      size: typeof props["dataSgSize"] === "string" ? String(props["dataSgSize"]) : undefined,
      weight: typeof props["dataSgWeight"] === "string" ? String(props["dataSgWeight"]) : undefined,
      fontStyle:
        typeof props["dataSgStyle"] === "string" ? String(props["dataSgStyle"]) : undefined,
      radius: typeof props["dataSgRadius"] === "string" ? String(props["dataSgRadius"]) : undefined,
      border: typeof props["dataSgBorder"] === "string" ? String(props["dataSgBorder"]) : undefined,
      shadow: typeof props["dataSgShadow"] === "string" ? String(props["dataSgShadow"]) : undefined,
      fit: typeof props["dataSgFit"] === "string" ? String(props["dataSgFit"]) : undefined,
      filter: typeof props["dataSgFilter"] === "string" ? String(props["dataSgFilter"]) : undefined,
      x: typeof props["dataSgX"] === "string" ? String(props["dataSgX"]) : undefined,
      y: typeof props["dataSgY"] === "string" ? String(props["dataSgY"]) : undefined,
      w: typeof props["dataSgW"] === "string" ? String(props["dataSgW"]) : undefined,
      h: typeof props["dataSgH"] === "string" ? String(props["dataSgH"]) : undefined,
      z: typeof props["dataSgZ"] === "string" ? String(props["dataSgZ"]) : undefined,
      rot: typeof props["dataSgRot"] === "string" ? String(props["dataSgRot"]) : undefined,
      lock: typeof props["dataSgLock"] === "string" ? String(props["dataSgLock"]) : undefined,
      hidden: typeof props["dataSgHidden"] === "string" ? String(props["dataSgHidden"]) : undefined,
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
export function setTheme(
  tree: PresentationAst,
  theme: string,
  custom?: {
    background: string;
    textPrimary: string;
    textSecondary: string;
    surface: string;
    primary: string;
  } | null,
): boolean {
  const style = findStyle(tree);
  if (!style) return false;
  const textNode = (style.children ?? []).find((c: LooseNode) => c.type === "text");
  if (!textNode) return false;
  const css = String(textNode.value ?? "");
  const next = css.replace(/^\s*:root\s*\{[^}]*\}/m, themeCssVariables(theme, custom ?? null));
  if (next === css) return false;
  textNode.value = next;
  return true;
}
