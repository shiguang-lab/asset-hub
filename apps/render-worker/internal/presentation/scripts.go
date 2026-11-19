package presentation

import "fmt"

type FitMeasureResult struct {
	PageID          string   `json:"pageId"`
	RequiredWidth   float64  `json:"requiredWidth"`
	RequiredHeight  float64  `json:"requiredHeight"`
	RepairedTextIDs []string `json:"repairedTextIds"`
}

type FontCandidate struct {
	ElementID        string  `json:"elementId,omitempty"`
	Kind             string  `json:"kind"`
	Role             string  `json:"role"`
	TagName          string  `json:"tagName"`
	ClassName        string  `json:"className"`
	DesignFontSize   float64 `json:"designFontSize"`
	DirectTextLength int     `json:"directTextLength"`
}

type AuditRawIssue struct {
	Code      string           `json:"code"`
	Severity  string           `json:"severity"`
	ElementID string           `json:"elementId,omitempty"`
	Message   string           `json:"message"`
	Geometry  *ElementGeometry `json:"geometry,omitempty"`
}

type AuditPageResult struct {
	PageID         string          `json:"pageId"`
	Title          string          `json:"title"`
	Found          []AuditRawIssue `json:"found"`
	FontCandidates []FontCandidate `json:"fontCandidates"`
	PageFitScale   float64         `json:"pageFitScale"`
	PageOverflowed bool            `json:"pageOverflowed"`
	Degraded       bool            `json:"degraded"`
}

func FitMeasurePageJS(pageIndex int) string {
	return fmt.Sprintf(`(() => {
  const pageIndex = %d;
  const stageWidth = %d;
  const stageHeight = %d;
  const pages = Array.from(document.querySelectorAll("[data-sg-page]"));
  pages.forEach((item, itemIndex) => {
    const active = itemIndex === pageIndex;
    item.classList.toggle("sg-active", active);
    item.setAttribute("aria-hidden", active ? "false" : "true");
    item.style.setProperty(
      "display",
      active ? item.getAttribute("data-sg-render-display") || "block" : "none",
      "important"
    );
    item.style.setProperty("transform", "none", "important");
  });
  const slide = pages[pageIndex];
  if (!slide) return null;
  document.documentElement.setAttribute("data-sg-mode", "slide");
  Object.assign(document.documentElement.style, { width: stageWidth + "px", height: stageHeight + "px" });
  Object.assign(document.body.style, { width: stageWidth + "px", height: stageHeight + "px" });

  const repairedTextIds = [];
  for (const element of slide.querySelectorAll("[data-sg-id]")) {
    const text = (element.innerText || "").trim();
    if (!text) continue;
    if (element.scrollWidth <= element.clientWidth + 2 && element.scrollHeight <= element.clientHeight + 2) {
      continue;
    }
    const id = element.getAttribute("data-sg-id");
    if (!id) continue;
    repairedTextIds.push(id);
    element.style.setProperty("min-width", "0", "important");
    element.style.setProperty("height", "auto", "important");
    element.style.setProperty("min-height", "0", "important");
    element.style.setProperty("max-height", "none", "important");
    element.style.setProperty("flex-shrink", "0", "important");
    element.style.setProperty("overflow", "visible", "important");
    element.style.setProperty("text-overflow", "clip", "important");
    element.style.setProperty("white-space", "normal", "important");
    element.style.setProperty("overflow-wrap", "anywhere", "important");
    element.style.setProperty("-webkit-line-clamp", "unset", "important");
  }

  const restore = window.__sgStripRotations ? window.__sgStripRotations(slide) : null;
  const requiredWidth = Math.max(stageWidth, slide.scrollWidth);
  const requiredHeight = Math.max(stageHeight, slide.scrollHeight);
  if (restore) restore();

  return {
    pageId: slide.getAttribute("data-sg-id") || "page-" + (pageIndex + 1),
    requiredWidth,
    requiredHeight,
    repairedTextIds: Array.from(new Set(repairedTextIds)),
  };
})()`, pageIndex, StageWidth, StageHeight)
}

func FitZoomPageJS(pageIndex int, initialScale, minimumScale float64) string {
	return fmt.Sprintf(`(() => {
  const pageIndex = %d;
  let scale = %v;
  const minimumScale = %v;
  const stageWidth = %d;
  const stageHeight = %d;
  const slide = Array.from(document.querySelectorAll("[data-sg-page]"))[pageIndex];
  if (!slide) return { scale };
  const applyScale = () => {
    slide.style.setProperty("zoom", String(scale), "important");
    const lw = stageWidth / scale;
    const lh = stageHeight / scale;
    for (const prop of ["width", "min-width", "max-width"]) slide.style.setProperty(prop, lw + "px", "important");
    for (const prop of ["height", "min-height", "max-height"]) slide.style.setProperty(prop, lh + "px", "important");
  };
  applyScale();
  for (let pass = 0; pass < 3; pass += 1) {
    const stageRect = slide.getBoundingClientRect();
    const visible = Array.from(slide.querySelectorAll("[data-sg-id]")).filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    });
    let maxRight = stageRect.left + stageWidth;
    let maxBottom = stageRect.top + stageHeight;
    for (const el of visible) {
      const rect = window.__sgMeasureRect ? window.__sgMeasureRect(el) : el.getBoundingClientRect();
      maxRight = Math.max(maxRight, rect.right);
      maxBottom = Math.max(maxBottom, rect.bottom);
    }
    const correction = Math.min(
      1,
      stageWidth / Math.max(stageWidth, maxRight - stageRect.left),
      stageHeight / Math.max(stageHeight, maxBottom - stageRect.top)
    );
    if (correction >= 0.997 || scale <= minimumScale) break;
    scale = Math.max(minimumScale, scale * correction * 0.985);
    applyScale();
  }
  return { scale };
})()`, pageIndex, initialScale, minimumScale, StageWidth, StageHeight)
}

func FitMarkSlideJS(pageIndex int, scale float64, degrade bool) string {
	return fmt.Sprintf(`(() => {
  const slide = Array.from(document.querySelectorAll("[data-sg-page]"))[%d];
  if (!slide) return;
  slide.setAttribute("data-sg-auto-fit", %q);
  if (%v) slide.setAttribute("data-sg-degrade-fit", "1");
})()`, pageIndex, fmt.Sprintf("%.4f", scale), degrade)
}

func AuditPageJS(pageIndex int) string {
	return fmt.Sprintf(`(() => {
  const pageIndex = %d;
  const underfillErrorRatio = 0.62;
  const underfillWarningRatio = 0.72;
  const pages = Array.from(document.querySelectorAll("[data-sg-page]"));
  pages.forEach((item, itemIndex) => {
    const active = itemIndex === pageIndex;
    item.classList.toggle("sg-active", active);
    item.setAttribute("aria-hidden", active ? "false" : "true");
    item.style.setProperty(
      "display",
      active ? item.getAttribute("data-sg-render-display") || "block" : "none",
      "important"
    );
    item.style.setProperty("transform", "none", "important");
  });
  const slide = pages[pageIndex];
  if (!slide) return null;
  document.documentElement.setAttribute("data-sg-mode", "slide");
  document.documentElement.style.width = "1920px";
  document.documentElement.style.height = "1080px";
  document.body.style.width = "1920px";
  document.body.style.height = "1080px";
  window.scrollTo(0, 0);

  const measureRect = window.__sgMeasureRect;
  const slideRect = slide.getBoundingClientRect();
  const pageId = slide.getAttribute("data-sg-id") || ("page-" + (pageIndex + 1));
  const heading = slide.querySelector("h1,h2");
  const title = ((heading && heading.innerText) || slide.getAttribute("aria-label") || ("第 " + (pageIndex + 1) + " 页"))
    .replace(/\s+/g, " ")
    .trim();

  const found = [];
  const fontCandidates = [];
  const declaredScale = Number.parseFloat(slide.getAttribute("data-sg-auto-fit") || "1");
  const layoutWidth = slide.offsetWidth;
  const measuredScale = layoutWidth > 0 ? slideRect.width / layoutWidth : 1;
  const pageFitScale = Number.isFinite(measuredScale) && measuredScale > 0.5 && measuredScale <= 1.05 ? measuredScale : declaredScale;

  const restoreRotations = window.__sgStripRotations ? window.__sgStripRotations(slide) : null;
  const contentWidth = slide.scrollWidth;
  const contentHeight = slide.scrollHeight;

  const overflowOffenders = [];
  if (contentWidth > 1921 || contentHeight > 1081) {
    const offenders = [];
    for (const el of slide.querySelectorAll("*")) {
      if (el === slide || /^(STYLE|SCRIPT)$/.test(el.tagName)) continue;
      const rect = el.getBoundingClientRect();
      const over = Math.max(Math.round(rect.bottom - slideRect.top - 1080), Math.round(rect.right - slideRect.left - 1920));
      if (over <= 2) continue;
      const classToken = (el.getAttribute("class") || "").trim().split(/\s+/)[0] || "";
      const id = el.getAttribute("data-sg-id");
      const ownText = (el.textContent || "").trim().slice(0, 14);
      offenders.push({
        over,
        label: el.tagName.toLowerCase() + (id ? "#" + id : "") + (classToken ? "." + classToken : "") + (ownText ? "「" + ownText + "」" : ""),
      });
    }
    offenders.sort((a, b) => b.over - a.over);
    const seen = new Set();
    for (const offender of offenders) {
      if (overflowOffenders.length >= 3) break;
      const token = offender.label.replace(/「[\s\S]*$/, "");
      if (seen.has(token)) continue;
      seen.add(token);
      overflowOffenders.push(offender.label + " +" + offender.over + "px");
    }
  }
  if (restoreRotations) restoreRotations();

  const degraded = slide.hasAttribute("data-sg-degrade-fit");
  if ((!slide.hasAttribute("data-sg-auto-fit") || degraded) && (contentWidth > 1921 || contentHeight > 1081)) {
    const extraWidth = Math.max(0, contentWidth - 1920);
    const extraHeight = Math.max(0, contentHeight - 1080);
    const directions = [
      extraWidth > 0 ? "横向超出 " + extraWidth + "px" : "",
      extraHeight > 0 ? "纵向超出 " + extraHeight + "px" : "",
    ].filter(Boolean);
    const shrink = Math.round((Math.max(extraWidth / 1920, extraHeight / 1080) || 0) * 100);
    found.push({
      code: "RENDER_SLIDE_OVERFLOW",
      severity: degraded ? "warning" : "error",
      message: (degraded ? "已降级缩放仍超出：" : "") + "页面内容尺寸 " + contentWidth + "×" + contentHeight + " 超过 1920×1080（" + directions.join("、") + "，需压缩约 " + shrink + "%%）：平台不会缩放掩盖超载，请删减条目、压缩间距，或把卡片网格改为多列紧凑矩阵/表格" + (overflowOffenders.length > 0 ? "；越界最深的元素：" + overflowOffenders.join("、") + "（相对画布底/右边）" : ""),
    });
  }

  const visible = [];
  for (const element of slide.querySelectorAll("*")) {
    if (element === slide) continue;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= 0.01 || rect.width <= 1 || rect.height <= 1) {
      continue;
    }
    const elementId = element.getAttribute("data-sg-id");
    const kind = element.getAttribute("data-sg-kind") || "";
    const className = element.getAttribute("class") || "";
    const hasVisualTag = /^(IMG|SVG|CANVAS|TABLE|FIGURE)$/.test(element.tagName);
    const hasVisualAttr = Boolean(element.getAttribute("data-sg-chart"));
    const text = (element.innerText || element.textContent || "").trim();
    const hasIdentifiedDescendant = Boolean(element.querySelector("[data-sg-id]"));
    const isIdlessSemantic = !elementId && !hasIdentifiedDescendant && (hasVisualTag || hasVisualAttr || Boolean(kind) || /(?:^|[-_ ](?:source|data-source|footer|caption))(?:$|[-_ ])/i.test(className) || text.length >= 2);
    if (!elementId && !isIdlessSemantic) continue;
    visible.push({ element, style, rect: measureRect ? measureRect(element) : rect });
  }

  const pageCount = pages.length;
  const meaningful = visible.filter(({ element, style }) => {
    const role = element.getAttribute("data-sg-role") || "";
    const className = element.getAttribute("class") || "";
    const kind = element.getAttribute("data-sg-kind") || "";
    const text = (element.innerText || element.textContent || "").trim();
    const rect = element.getBoundingClientRect();
    const decorative = /^(decoration|background|atmosphere|source|footer|caption)$/i.test(role) || /(?:^|[-_ ])(?:bg|background|atmosphere|source|footer|caption)(?:$|[-_ ])/i.test(className);
    const structural = /(?:^|[-_ ])(?:sidebar|page-container|content-area|sg-grid|page-content)(?:$|[-_ ])/i.test(className) && rect.height >= slideRect.height * 0.72;
    const fullStageSurface = rect.width >= slideRect.width * 0.9 && rect.height >= slideRect.height * 0.72;
    const directText = Array.from(element.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent || "").join("").trim();
    const hasVisibleColor = (val) => {
      const normalized = val.trim().toLowerCase();
      if (!normalized || normalized === "transparent") return false;
      const rgba = normalized.match(/^rgba?\(([^)]+)\)$/);
      if (!rgba) return true;
      const parts = (rgba[1] || "").split(/[\s,/]+/).filter(Boolean);
      return parts.length < 4 || Number.parseFloat(parts[3] || "1") > 0.01;
    };
    const hasBorder = ["Top", "Right", "Bottom", "Left"].some((side) =>
      Number.parseFloat(style["border" + side + "Width"]) > 0.5 &&
      style["border" + side + "Style"] !== "none" &&
      hasVisibleColor(style["border" + side + "Color"])
    );
    const hasVisualSurface = hasVisibleColor(style.backgroundColor) || style.backgroundImage !== "none" || hasBorder || style.boxShadow !== "none" || (Number.parseFloat(style.outlineWidth) > 0.5 && style.outlineStyle !== "none");
    const transparentLayoutContainer = /^(?:grid|inline-grid|flex|inline-flex)$/.test(style.display) && element.childElementCount > 0 && directText.length === 0 && !hasVisualSurface;
    return !decorative && !structural && !fullStageSurface && !transparentLayoutContainer && (Boolean(kind) || text.length >= 2);
  });
  if (pageIndex > 0 && pageIndex < pageCount - 1 && meaningful.length >= 3) {
    const maxBottom = Math.max(...meaningful.map(({ rect }) => rect.bottom));
    const contentBottomRatio = (maxBottom - slideRect.top) / Math.max(slideRect.height, 1);
    const underfillSeverity = contentBottomRatio < underfillErrorRatio ? "error" : contentBottomRatio < underfillWarningRatio ? "warning" : null;
    if (underfillSeverity) {
      found.push({
        code: "RENDER_CONTENT_UNDERFILL",
        severity: underfillSeverity,
        message: "页面内容仅占画布纵向 " + Math.round(contentBottomRatio * 100) + "%%，建议重排到 70%%–90%% 的安全占位区，避免上半屏堆叠、下半屏空置",
      });
    }
  }

  for (const { element, style, rect } of visible) {
    if (element.closest('[aria-hidden="true"]')) continue;
    const elementId = element.getAttribute("data-sg-id") || undefined;
    const kind = element.getAttribute("data-sg-kind") || "";
    const text = (element.innerText || element.textContent || "").trim();
    const semantic = /^(text|image|chart|metric|table|link)$/.test(kind) || text.length >= 2;
    const overflow = {
      left: Math.max(0, Math.round(slideRect.left - rect.left)),
      top: Math.max(0, Math.round(slideRect.top - rect.top)),
      right: Math.max(0, Math.round(rect.right - slideRect.right)),
      bottom: Math.max(0, Math.round(rect.bottom - slideRect.bottom)),
    };
    const parent = element.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : null;
    const geometry = {
      element: Object.assign(elementId ? { id: elementId } : {}, {
        kind,
        tagName: element.tagName,
        x: Math.round(rect.left - slideRect.left),
        y: Math.round(rect.top - slideRect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }),
      stage: { width: Math.round(slideRect.width), height: Math.round(slideRect.height) },
      overflow,
      style: { display: style.display, position: style.position, overflowX: style.overflowX, overflowY: style.overflowY, fontSize: style.fontSize },
    };
    if (parent && parentRect) {
      const pid = parent.getAttribute("data-sg-id");
      geometry.parent = Object.assign(pid ? { id: pid } : {}, {
        tagName: parent.tagName,
        x: Math.round(parentRect.left - slideRect.left),
        y: Math.round(parentRect.top - slideRect.top),
        width: Math.round(parentRect.width),
        height: Math.round(parentRect.height),
      });
    }
    const overflowDirections = Object.entries(overflow)
      .filter(([, px]) => px > 2)
      .map(([dir, px]) => (dir === "left" ? "左侧" : dir === "right" ? "右侧" : dir === "top" ? "上方" : "下方") + " " + px + "px");
    if (overflowDirections.length > 0 && semantic) {
      found.push({
        code: "RENDER_ELEMENT_OUTSIDE_STAGE",
        severity: "error",
        elementId,
        message: (elementId || element.tagName) + " 越出固定画布（" + overflowDirections.join("、") + "）",
        geometry,
      });
    }
    const horizontalTextClipped = element.scrollWidth > element.clientWidth + 2 && style.overflowX !== "visible";
    const verticalTextClipped = element.scrollHeight > element.clientHeight + 2 && style.overflowY !== "visible";
    if (text && (horizontalTextClipped || verticalTextClipped)) {
      found.push({
        code: "RENDER_TEXT_CLIPPED",
        severity: "error",
        elementId,
        message: (elementId || element.tagName) + " 的文本被裁切",
        geometry,
      });
    }
    let directTextLength = 0;
    let smallestOwnFontSize = Number.POSITIVE_INFINITY;
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const value = node.nodeValue || "";
      if (!value.trim()) continue;
      directTextLength += value.trim().length;
      const nodeParent = node.parentElement || element;
      const parentStyle = getComputedStyle(nodeParent);
      if (parentStyle.display === "none" || parentStyle.visibility === "hidden") continue;
      const size = Number.parseFloat(parentStyle.fontSize || "0");
      if (size > 0) smallestOwnFontSize = Math.min(smallestOwnFontSize, size);
    }
    const fontSemantic = Boolean(elementId || kind || element.getAttribute("data-sg-role"));
    if (fontSemantic && directTextLength >= 4 && Number.isFinite(smallestOwnFontSize)) {
      fontCandidates.push({
        elementId,
        kind,
        role: element.getAttribute("data-sg-role") || "",
        tagName: element.tagName,
        className: element.getAttribute("class") || "",
        designFontSize: smallestOwnFontSize,
        directTextLength,
      });
    }
  }

  if (heading) {
    const range = document.createRange();
    range.selectNodeContents(heading);
    const lines = Array.from(range.getClientRects()).filter((rect) => rect.width > 2);
    if (lines.length >= 2) {
      const maxWidth = Math.max(...lines.map((line) => line.width));
      const lastWidth = lines[lines.length - 1] ? lines[lines.length - 1].width : maxWidth;
      if (lastWidth < maxWidth * 0.22) {
        found.push({
          code: "RENDER_TITLE_ORPHAN_LINE",
          severity: "warning",
          elementId: heading.getAttribute("data-sg-id") || undefined,
          message: "标题最后一行过短，出现孤字/孤词换行",
        });
      }
    }
    const headingRect = heading.getBoundingClientRect();
    if (headingRect.width < 280 && title.length > 8) {
      found.push({
        code: "RENDER_TITLE_COLUMN_TOO_NARROW",
        severity: "error",
        elementId: heading.getAttribute("data-sg-id") || undefined,
        message: "标题列宽仅 " + Math.round(headingRect.width) + "px，容易形成竖排",
      });
    }
  }

  const siblings = visible
    .filter((entry) => {
      const kind = entry.element.getAttribute("data-sg-kind") || "";
      const role = entry.element.getAttribute("data-sg-role") || "";
      const className = entry.element.getAttribute("class") || "";
      const text = (entry.element.innerText || entry.element.textContent || "").trim();
      const visual = /^(IMG|SVG|CANVAS|TABLE|FIGURE)$/.test(entry.element.tagName);
      const decorative = /^(decoration|background|atmosphere)$/i.test(role) || /(?:^|[-_ ])(?:bg|background|atmosphere)(?:$|[-_ ])/i.test(className);
      return !decorative && (/^(text|image|chart|metric|table|code-island)$/.test(kind) || visual || text.length >= 2);
    })
    .map((entry) => entry.element);
  let overlapReports = 0;
  for (let a = 0; a < siblings.length; a += 1) {
    for (let b = a + 1; b < siblings.length; b += 1) {
      const first = siblings[a];
      const second = siblings[b];
      if (!first || !second || first.contains(second) || second.contains(first)) continue;
      const ra = measureRect ? measureRect(first) : first.getBoundingClientRect();
      const rb = measureRect ? measureRect(second) : second.getBoundingClientRect();
      const width = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
      const height = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
      const overlap = width * height;
      const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (smaller > 0 && overlap / smaller > 0.28) {
        const firstRole = first.getAttribute("data-sg-role") || "";
        const secondRole = second.getAttribute("data-sg-role") || "";
        if (/^(decoration|background|atmosphere)$/i.test(firstRole) || /^(decoration|background|atmosphere)$/i.test(secondRole)) continue;
        found.push({
          code: "RENDER_UNEXPECTED_OVERLAP",
          severity: "warning",
          elementId: first.getAttribute("data-sg-id") || undefined,
          message: (first.getAttribute("data-sg-id") || first.tagName) + " 与 " + (second.getAttribute("data-sg-id") || second.tagName) + " 大面积重叠",
        });
        overlapReports += 1;
        if (overlapReports >= 24) break;
      }
    }
    if (overlapReports >= 24) break;
  }

  return {
    pageId,
    title,
    found,
    fontCandidates,
    pageFitScale,
    pageOverflowed: found.some((item) => item.code === "RENDER_SLIDE_OVERFLOW"),
    degraded,
  };
})()`, pageIndex)
}
