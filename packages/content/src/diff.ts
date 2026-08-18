/**
 * 结构化 Diff：把两个版本的内容（Markdown 正文 / 演示 HTML）按「块 / 元素」粒度
 * 对比，产出 add / remove / modify / unchanged 四类操作，而非原始逐行 diff。
 *
 * - Markdown：按标题 / 段落 / 代码块 / 列表组切块，LCS 对齐。
 * - 演示：复用 presentation-ast 的页面（data-sg-page）与可编辑元素（data-sg-id）。
 */

import { listEditableElements, listPages, parsePresentationHtml } from "./presentation-ast.js";

export type DiffBlockKind = "add" | "remove" | "modify" | "unchanged";

export interface DiffBlock {
  kind: DiffBlockKind;
  /** 稳定锚点：Markdown 用块序号，演示用页面/元素 id。 */
  id: string;
  /** 供 UI 展示的短标签。 */
  label: string;
  /** 该块的新文本（unchanged / add / modify 时为新文本）。 */
  text: string;
  /** modify 时的旧文本。 */
  oldText?: string;
}

export interface StructuredDiff {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  blocks: DiffBlock[];
}

const LABEL_MAX = 60;

function shortLabel(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  const flat = line.replace(/\s+/g, " ").trim();
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX)}…` : flat;
}

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

/** 把 Markdown 切成逻辑块：标题独立成块，围栏代码块整体成块，其余连续文本聚合。 */
export function splitMarkdownBlocks(markdown: string): string[] {
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = (): void => {
    if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  };

  for (const line of lines) {
    const fence = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      if (!inFence) {
        flush();
        inFence = true;
        current = [line];
      } else {
        current.push(line);
        flush();
        inFence = false;
      }
      continue;
    }
    if (inFence) {
      current.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      flush();
      blocks.push(line);
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

type AlignmentOp =
  | { type: "match"; a: number; b: number }
  | { type: "remove"; a: number }
  | { type: "add"; b: number };

/** LCS 对齐，块数过大时退化为「先全删再全增」，避免内存爆炸。 */
function lcsAlignment(a: string[], b: string[]): AlignmentOp[] {
  const maxCells = 4_000_000;
  if (a.length * b.length > maxCells) {
    const ops: AlignmentOp[] = a.map((_, i) => ({ type: "remove", a: i }));
    for (let j = 0; j < b.length; j += 1) ops.push({ type: "add", b: j });
    return ops;
  }

  const n = a.length;
  const m = b.length;
  const stride = m + 1;
  const dp = new Int32Array((n + 1) * stride);
  const at = (i: number, j: number): number => dp[i * stride + j] ?? 0;

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const value = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
      dp[i * stride + j] = value;
    }
  }

  const ops: AlignmentOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "match", a: i, b: j });
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      ops.push({ type: "remove", a: i });
      i += 1;
    } else {
      ops.push({ type: "add", b: j });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "remove", a: i });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "add", b: j });
    j += 1;
  }
  return ops;
}

function mergeIntoBlocks(ops: AlignmentOp[], a: string[], b: string[]): DiffBlock[] {
  // 先把相邻的 remove-run + add-run 配成 modify，再产出块。
  const blocks: DiffBlock[] = [];
  let idx = 0;
  const pushRemove = (ai: number): void => {
    blocks.push({
      kind: "remove",
      id: `b${ai}`,
      label: shortLabel(a[ai] ?? ""),
      text: a[ai] ?? "",
    });
  };
  const pushAdd = (bi: number): void => {
    blocks.push({ kind: "add", id: `b${bi}`, label: shortLabel(b[bi] ?? ""), text: b[bi] ?? "" });
  };

  while (idx < ops.length) {
    const op = ops[idx];
    if (!op) break;
    if (op.type === "match") {
      blocks.push({
        kind: "unchanged",
        id: `b${op.a}`,
        label: shortLabel(a[op.a] ?? ""),
        text: a[op.a] ?? "",
      });
      idx += 1;
      continue;
    }
    if (op.type === "add") {
      pushAdd(op.b);
      idx += 1;
      continue;
    }
    // 收集一段连续的 remove
    const removes: number[] = [];
    while (idx < ops.length) {
      const current = ops[idx];
      if (current?.type !== "remove") break;
      removes.push(current.a);
      idx += 1;
    }
    const adds: number[] = [];
    while (idx < ops.length) {
      const current = ops[idx];
      if (current?.type !== "add") break;
      adds.push(current.b);
      idx += 1;
    }
    // 就地替换的常见情形：remove 与 add 成对出现
    if (removes.length > 0 && adds.length > 0) {
      const pairs = Math.min(removes.length, adds.length);
      for (let k = 0; k < pairs; k += 1) {
        const oldText = a[removes[k] ?? 0] ?? "";
        const text = b[adds[k] ?? 0] ?? "";
        const removeIndex = removes[k] ?? 0;
        blocks.push({
          kind: "modify",
          id: `b${removeIndex}`,
          label: shortLabel(text || oldText),
          text,
          oldText,
        });
      }
      for (let k = pairs; k < removes.length; k += 1) pushRemove(removes[k] ?? 0);
      for (let k = pairs; k < adds.length; k += 1) pushAdd(adds[k] ?? 0);
      continue;
    }
    for (const ai of removes) pushRemove(ai);
    for (const bi of adds) pushAdd(bi);
  }
  return blocks;
}

export function diffMarkdown(base: string, next: string): StructuredDiff {
  const a = splitMarkdownBlocks(base);
  const b = splitMarkdownBlocks(next);
  const ops = lcsAlignment(a, b);
  const blocks = mergeIntoBlocks(ops, a, b);
  return summarize(blocks);
}

/* ------------------------------------------------------------------ */
/* Presentation（HTML Artifact）                                        */
/* ------------------------------------------------------------------ */

function looksLikePresentation(html: string): boolean {
  return /<section[^>]+data-sg-page=/.test(html);
}

function elementSummary(el: {
  kind: string;
  tagName: string;
  text: string;
  src?: string;
  href?: string;
  enter?: string;
  hover?: string;
}): string {
  if (el.kind === "image") return `图片 src=${el.src ?? ""}`;
  if (el.kind === "link") return `链接 href=${el.href ?? ""}（${el.text}）`;
  if (el.kind === "chart") return `图表 ${el.text}`;
  const attrs = [el.enter && `enter=${el.enter}`, el.hover && `hover=${el.hover}`].filter(Boolean);
  const suffix = attrs.length ? ` [${attrs.join(", ")}]` : "";
  return `${el.text}${suffix}`;
}

function elementChanged(
  a: { text: string; src?: string; href?: string; enter?: string; hover?: string },
  b: { text: string; src?: string; href?: string; enter?: string; hover?: string },
): boolean {
  return (
    a.text !== b.text ||
    (a.src ?? "") !== (b.src ?? "") ||
    (a.href ?? "") !== (b.href ?? "") ||
    (a.enter ?? "") !== (b.enter ?? "") ||
    (a.hover ?? "") !== (b.hover ?? "")
  );
}

export function diffPresentationHtml(base: string, next: string): StructuredDiff {
  const baseTree = parsePresentationHtml(base);
  const nextTree = parsePresentationHtml(next);
  const basePages = listPages(baseTree);
  const nextPages = listPages(nextTree);
  const baseById = new Map(basePages.map((p) => [p.id, p]));
  const nextById = new Map(nextPages.map((p) => [p.id, p]));

  const blocks: DiffBlock[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;

  for (const p of basePages) {
    if (nextById.has(p.id)) continue;
    removed += 1;
    blocks.push({
      kind: "remove",
      id: `page:${p.id}`,
      label: `页面 · ${p.title || p.id}`,
      text: "",
    });
  }
  for (const p of nextPages) {
    if (!baseById.has(p.id)) {
      added += 1;
      blocks.push({
        kind: "add",
        id: `page:${p.id}`,
        label: `页面 · ${p.title || p.id}`,
        text: "",
      });
    }
  }

  for (const p of nextPages) {
    if (!baseById.has(p.id)) continue;
    const baseEls = listEditableElements(baseTree, p.id);
    const nextEls = listEditableElements(nextTree, p.id);
    const baseElById = new Map(baseEls.map((e) => [e.id, e]));
    const nextElById = new Map(nextEls.map((e) => [e.id, e]));
    const pageLabel = p.title || p.id;

    for (const e of baseEls) {
      if (nextElById.has(e.id)) continue;
      removed += 1;
      blocks.push({ kind: "remove", id: e.id, label: `${pageLabel} · ${e.kind}`, text: "" });
    }
    for (const e of nextEls) {
      if (!baseElById.has(e.id)) {
        added += 1;
        blocks.push({
          kind: "add",
          id: e.id,
          label: `${pageLabel} · ${e.kind}`,
          text: elementSummary(e),
        });
      }
    }
    for (const e of nextEls) {
      const old = baseElById.get(e.id);
      if (!old) continue;
      if (elementChanged(old, e)) {
        modified += 1;
        blocks.push({
          kind: "modify",
          id: e.id,
          label: `${pageLabel} · ${e.kind}`,
          text: elementSummary(e),
          oldText: elementSummary(old),
        });
      } else {
        unchanged += 1;
      }
    }
  }

  return { added, removed, modified, unchanged, blocks };
}

/* ------------------------------------------------------------------ */
/* 通用入口                                                             */
/* ------------------------------------------------------------------ */

function summarize(blocks: DiffBlock[]): StructuredDiff {
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;
  for (const block of blocks) {
    if (block.kind === "add") added += 1;
    else if (block.kind === "remove") removed += 1;
    else if (block.kind === "modify") modified += 1;
    else unchanged += 1;
  }
  return { added, removed, modified, unchanged, blocks };
}

/** 依据内容形态分发到 Markdown 或演示 HTML 的结构化 diff。 */
export function structuredDiff(
  kind: "markdown" | "html" | "manifest",
  baseText: string,
  nextText: string,
): StructuredDiff {
  if (kind === "html" || (kind === "markdown" && looksLikePresentation(nextText))) {
    if (looksLikePresentation(baseText) && looksLikePresentation(nextText)) {
      return diffPresentationHtml(baseText, nextText);
    }
  }
  return diffMarkdown(baseText, nextText);
}

/** 供 API 层判断演示内容是否可用（data-sg-page 锚点）。 */
export function isPresentationHtml(html: string): boolean {
  return looksLikePresentation(html);
}
