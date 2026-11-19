package presentation

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

const (
	StageWidth               = 1920
	StageHeight              = 1080
	MinAutoFitScale          = 0.89
	DegradeMinAutoFitScale   = 0.90
	FitSafetyMargin          = 0.985
	TextFontFloor            = 22
	DenseTextFontFloor       = 16
	UnderfillErrorRatio      = 0.62
	DefaultScreenshotQuality = 68
)

var (
	reStyleFitTag   = regexp.MustCompile(`(?is)<style\b[^>]*data-sg-stage-fit[^>]*>[\s\S]*?</style>`)
	reAutoFitAttr   = regexp.MustCompile(`(?i)\sdata-sg-auto-fit=(?:"[^"]*"|'[^']*')`)
	reDegradeAttr   = regexp.MustCompile(`(?i)\sdata-sg-degrade-fit=(?:"[^"]*"|'[^']*')`)
	reSectionPage   = regexp.MustCompile(`(?i)<section\b[^>]*data-sg-page[^>]*>`)
	reHTMLOpen      = regexp.MustCompile(`(?i)<html\b`)
	reStaticAttr    = regexp.MustCompile(`(?i)data-sg-static\s*=`)
	reExemptRole    = regexp.MustCompile(`^(?:source|footer|caption|decoration)$`)
	reDenseTarget   = regexp.MustCompile(`^(?:table|chart|metric)$`)
	reDenseClass    = regexp.MustCompile(`[^a-z0-9]+`)
)

const FixedStageCSS = `
html[data-sg-mode="slide"], html[data-sg-mode="slide"] body {
  width: 1920px !important;
  height: 1080px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
html[data-sg-mode="slide"] [data-sg-page] {
  width: 1920px !important;
  height: 1080px !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}
`

const StaticizeCSS = `
html[data-sg-static="1"] *, html[data-sg-static="1"] *::before, html[data-sg-static="1"] *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  animation-fill-mode: forwards !important;
  transition: none !important;
}
html[data-sg-static="1"] [data-sg-page] [data-sg-enter] {
  opacity: 1 !important;
  visibility: visible !important;
  transform: none !important;
}
`

type Request struct {
	HTML            string `json:"html"`
	Fit             bool   `json:"fit"`
	Audit           bool   `json:"audit"`
	Screenshots     bool   `json:"screenshots"`
	MaxScreenshots  int    `json:"maxScreenshots"`
	ScreenshotPages []int  `json:"screenshotPages"`
	DegradePages    []int  `json:"degradePages"`
}

type AppliedFit struct {
	Page            int      `json:"page"`
	PageID          string   `json:"pageId"`
	Scale           float64  `json:"scale"`
	RepairedTextIDs []string `json:"repairedTextIds"`
	Overfilled      bool     `json:"overfilled,omitempty"`
	Degraded        bool     `json:"degraded,omitempty"`
}

type ElementBox struct {
	ID      string `json:"id,omitempty"`
	Kind    string `json:"kind"`
	TagName string `json:"tagName"`
	X       int    `json:"x"`
	Y       int    `json:"y"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
}

type ParentBox struct {
	ID      string `json:"id,omitempty"`
	TagName string `json:"tagName"`
	X       int    `json:"x"`
	Y       int    `json:"y"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
}

type ElementGeometry struct {
	Element  ElementBox        `json:"element"`
	Stage    map[string]int    `json:"stage"`
	Overflow map[string]int    `json:"overflow"`
	Parent   *ParentBox        `json:"parent,omitempty"`
	Style    map[string]string `json:"style"`
}

type RenderIssue struct {
	Code      string           `json:"code"`
	Severity  string           `json:"severity"`
	Page      int              `json:"page"`
	PageID    string           `json:"pageId"`
	ElementID string           `json:"elementId,omitempty"`
	Message   string           `json:"message"`
	Geometry  *ElementGeometry `json:"geometry,omitempty"`
}

type SlideAudit struct {
	Page              int    `json:"page"`
	PageID            string `json:"pageId"`
	Title             string `json:"title"`
	ScreenshotDataURL string `json:"screenshotDataUrl,omitempty"`
	IssueCount        int    `json:"issueCount"`
}

type RenderAudit struct {
	Available     bool          `json:"available"`
	PageCount     int           `json:"pageCount"`
	Issues        []RenderIssue `json:"issues"`
	Slides        []SlideAudit  `json:"slides"`
	ConsoleErrors []string      `json:"consoleErrors"`
	Summary       string        `json:"summary"`
}

type Response struct {
	HTML    string       `json:"html"`
	Applied []AppliedFit `json:"applied"`
	Audit   *RenderAudit `json:"audit,omitempty"`
}

func StripStageFit(html string) string {
	s := reStyleFitTag.ReplaceAllString(html, "")
	s = reAutoFitAttr.ReplaceAllString(s, "")
	s = reDegradeAttr.ReplaceAllString(s, "")
	return s
}

func StaticRenderHTML(html string) string {
	marked := html
	if !reStaticAttr.MatchString(marked) {
		if loc := reHTMLOpen.FindStringIndex(marked); loc != nil {
			marked = marked[:loc[1]] + ` data-sg-static="1"` + marked[loc[1]:]
		} else {
			marked = `<html data-sg-static="1"><head></head><body>` + marked + `</body></html>`
		}
	}
	style := fmt.Sprintf("<style data-sg-static-style>%s\n%s</style>", FixedStageCSS, StaticizeCSS)
	if strings.Contains(marked, "</body>") {
		return strings.Replace(marked, "</body>", style+"</body>", 1)
	}
	if strings.Contains(marked, "</head>") {
		return strings.Replace(marked, "</head>", style+"</head>", 1)
	}
	return style + marked
}

func cssString(value string) string {
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\r", " ", "\n", " ")
	return r.Replace(value)
}

func InjectStageFit(html string, applied []AppliedFit) string {
	if len(applied) == 0 {
		return html
	}
	byPage := make(map[int]AppliedFit, len(applied))
	for _, f := range applied {
		byPage[f.Page] = f
	}
	page := 0
	result := reSectionPage.ReplaceAllStringFunc(html, func(open string) string {
		page++
		fit, ok := byPage[page]
		if !ok || fit.Overfilled || fit.Scale >= 0.999 {
			return open
		}
		degradeAttr := ""
		if fit.Degraded {
			degradeAttr = ` data-sg-degrade-fit="1"`
		}
		if strings.HasSuffix(open, ">") {
			return fmt.Sprintf(`%s data-sg-auto-fit="%.4f"%s>`, open[:len(open)-1], fit.Scale, degradeAttr)
		}
		return open
	})
	var rules []string
	for _, fit := range applied {
		selector := fmt.Sprintf(`section[data-sg-page][data-sg-id="%s"]`, cssString(fit.PageID))
		if fit.Scale < 0.999 {
			w := float64(StageWidth) / fit.Scale
			h := float64(StageHeight) / fit.Scale
			rules = append(rules, fmt.Sprintf(
				`%s{zoom:%.5f!important;width:%.2fpx!important;min-width:%.2fpx!important;max-width:%.2fpx!important;height:%.2fpx!important;min-height:%.2fpx!important;max-height:%.2fpx!important;}`,
				selector, fit.Scale, w, w, w, h, h, h,
			))
		}
		for _, id := range fit.RepairedTextIDs {
			rules = append(rules, fmt.Sprintf(
				`%s [data-sg-id="%s"]{min-width:0!important;height:auto!important;min-height:0!important;max-height:none!important;flex-shrink:0!important;overflow:visible!important;text-overflow:clip!important;white-space:normal!important;overflow-wrap:anywhere!important;-webkit-line-clamp:unset!important;line-clamp:unset!important;}`,
				selector, cssString(id),
			))
		}
	}
	style := fmt.Sprintf("<style data-sg-stage-fit>\n%s\n</style>", strings.Join(rules, "\n"))
	if strings.Contains(result, "</head>") {
		return strings.Replace(result, "</head>", style+"</head>", 1)
	}
	return style + result
}

func ResolveStageFitScale(requiredWidth, requiredHeight float64, force bool, minimumScale float64) (float64, bool) {
	if minimumScale <= 0 {
		minimumScale = MinAutoFitScale
	}
	overflowRatio := math.Min(
		float64(StageWidth)/math.Max(float64(StageWidth), requiredWidth),
		float64(StageHeight)/math.Max(float64(StageHeight), requiredHeight),
	)
	if overflowRatio >= 0.998 {
		return 1, false
	}
	if !force && overflowRatio < minimumScale {
		return 1, true
	}
	scale := math.Max(minimumScale, overflowRatio*FitSafetyMargin)
	return scale, false
}

func ResolveFontFloor(kind, role, tagName, className string) (int, bool) {
	if strings.EqualFold(tagName, "FIGCAPTION") || strings.EqualFold(tagName, "SMALL") {
		return 0, false
	}
	if reExemptRole.MatchString(strings.ToLower(role)) {
		return 0, false
	}
	tokens := reDenseClass.Split(strings.ToLower(className), -1)
	for _, t := range tokens {
		if reExemptRole.MatchString(t) {
			return 0, false
		}
	}
	if reDenseTarget.MatchString(strings.ToLower(kind)) || strings.EqualFold(tagName, "TABLE") {
		return DenseTextFontFloor, true
	}
	for _, t := range tokens {
		if reDenseTarget.MatchString(t) {
			return DenseTextFontFloor, true
		}
	}
	return TextFontFloor, true
}

func FormatFontTooSmallIssue(elementID string, designFontSize, pageFitScale float64, floor int, overflowed bool) string {
	target := elementID
	if target == "" {
		target = "元素"
	}
	effective := math.Round(designFontSize*pageFitScale*100) / 100
	design := math.Round(designFontSize*100) / 100
	zoom := ""
	if pageFitScale < 0.999 {
		zoom = fmt.Sprintf(" × 自动缩放 %.2f", pageFitScale)
	}
	minimum := int(math.Ceil(float64(floor) / pageFitScale))
	advice := fmt.Sprintf("先删减本页内容或改为两栏，再把正文提升到 ≥%dpx；只放大字号会加剧越界", minimum)
	if !overflowed {
		advice = fmt.Sprintf("本页内容并未超出演示画布，无需删减或分栏；先确认字号规则真正命中了元素（页面样式选择器用 #page-N 前缀或内联 style），再把正文显式提升到 ≥%dpx", minimum)
	}
	return fmt.Sprintf("%s 舞台有效字号 %gpx（设计 %gpx%s），低于 %dpx 下限：%s",
		target, effective, design, zoom, floor, advice)
}

func AuditSummary(pageCount int, issues []RenderIssue) string {
	errorsCount := 0
	for _, item := range issues {
		if item.Severity == "error" {
			errorsCount++
		}
	}
	warningsCount := len(issues) - errorsCount
	return fmt.Sprintf("%d 页已真实渲染；%d 个阻断问题，%d 个视觉警告", pageCount, errorsCount, warningsCount)
}

const MeasureRectJS = `(() => {
  window.__sgMeasureRect = (element) => {
    const rect = element.getBoundingClientRect();
    const raw = getComputedStyle(element).transform;
    const match = raw && raw !== "none" ? /^matrix\(([^)]+)\)$/.exec(raw) : null;
    if (!match) return rect;
    const values = match[1].split(",").map((value) => Number.parseFloat(value.trim()));
    if (values.length !== 6 || values.some((value) => Number.isNaN(value))) return rect;
    const a = values[0], b = values[1], c = values[2], d = values[3], e = values[4], f = values[5];
    if (Math.abs(b) < 0.001 && Math.abs(c) < 0.001) return rect;
    const previous = element.style.getPropertyValue("transform");
    const priority = element.style.getPropertyPriority("transform");
    element.style.setProperty(
      "transform",
      "translate(" + e + "px, " + f + "px) scale(" + Math.hypot(a, b) + ", " + Math.hypot(c, d) + ")",
      "important"
    );
    const stripped = element.getBoundingClientRect();
    if (priority) element.style.setProperty("transform", previous, priority);
    else if (previous) element.style.setProperty("transform", previous);
    else element.style.removeProperty("transform");
    return stripped;
  };
  window.__sgStripRotations = (root) => {
    const restores = [];
    for (const element of root.querySelectorAll("*")) {
      const raw = getComputedStyle(element).transform;
      const match = raw && raw !== "none" ? /^matrix\(([^)]+)\)$/.exec(raw) : null;
      if (!match) continue;
      const v = match[1].split(",").map((value) => Number.parseFloat(value.trim()));
      if (v.length !== 6 || v.some((value) => Number.isNaN(value))) continue;
      if (Math.abs(v[1]) < 0.001 && Math.abs(v[2]) < 0.001) continue;
      const previous = element.style.getPropertyValue("transform");
      const priority = element.style.getPropertyPriority("transform");
      element.style.setProperty(
        "transform",
        "translate(" + v[4] + "px, " + v[5] + "px) scale(" + Math.hypot(v[0], v[1]) + ", " + Math.hypot(v[2], v[3]) + ")",
        "important"
      );
      restores.push(() => {
        if (priority) element.style.setProperty("transform", previous, priority);
        else if (previous) element.style.setProperty("transform", previous);
        else element.style.removeProperty("transform");
      });
    }
    return () => { for (const restore of restores) restore(); };
  };
  document.querySelectorAll("[data-sg-page]").forEach((item) => {
    if (item.hasAttribute("data-sg-render-display")) return;
    const display = getComputedStyle(item).display;
    item.setAttribute("data-sg-render-display", display === "none" ? "block" : display);
  });
  document.documentElement.setAttribute("data-sg-mode", "slide");
  document.documentElement.setAttribute("data-sg-runtime-ready", "1");
  return document.querySelectorAll("[data-sg-page]").length;
})()`

const SettleStageJS = `(async () => {
  if (document.fonts && document.fonts.ready) {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]);
  }
  const imgs = Array.from(document.images).filter((img) => !img.complete);
  if (imgs.length > 0) {
    await Promise.race([
      Promise.all(imgs.map((img) => new Promise((r) => {
        img.addEventListener("load", r, { once: true });
        img.addEventListener("error", r, { once: true });
      }))),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }
  const anims = document.getAnimations ? document.getAnimations() : [];
  for (const a of anims) {
    try { a.finish(); } catch {}
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
})()`
