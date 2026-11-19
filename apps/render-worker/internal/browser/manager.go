package browser

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/fetch"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/security"
	"github.com/chromedp/chromedp"

	"github.com/shiguang-lab/asset-hub/apps/render-worker/internal/platform"
	"github.com/shiguang-lab/asset-hub/apps/render-worker/internal/presentation"
)

const (
	idleCloseDuration = 3 * time.Minute
	thumbWidth        = 1280
	thumbHeight       = 720
)

var reAssetDownloadPath = regexp.MustCompile(`/api/v1/assets/([^/?#]+)/download`)

type Manager struct {
	cfg platform.Config

	mu          sync.Mutex
	allocCancel context.CancelFunc
	rootCtx     context.Context
	rootCancel  context.CancelFunc
	activeOps   int
	idleTimer   *time.Timer
	closed      bool

	mdMu     sync.Mutex
	mdCtx    context.Context
	mdCancel context.CancelFunc
	mdSeq    int64
}

func NewManager(cfg platform.Config) *Manager {
	return &Manager{cfg: cfg}
}

func (m *Manager) Close() {
	m.mu.Lock()
	m.closed = true
	if m.idleTimer != nil {
		m.idleTimer.Stop()
		m.idleTimer = nil
	}
	m.mu.Unlock()

	m.resetMarkdownTab()
	m.closeBrowser()
}

func (m *Manager) closeBrowser() {
	m.mu.Lock()
	rootCancel := m.rootCancel
	allocCancel := m.allocCancel
	m.rootCtx = nil
	m.rootCancel = nil
	m.allocCancel = nil
	m.mu.Unlock()

	if rootCancel != nil {
		rootCancel()
	}
	if allocCancel != nil {
		allocCancel()
	}
}

func (m *Manager) beginOp() (context.Context, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return nil, fmt.Errorf("render browser manager closed")
	}
	if m.idleTimer != nil {
		m.idleTimer.Stop()
		m.idleTimer = nil
	}
	if m.rootCtx != nil && m.rootCtx.Err() == nil {
		m.activeOps++
		return m.rootCtx, nil
	}
	if m.rootCancel != nil {
		m.rootCancel()
	}
	if m.allocCancel != nil {
		m.allocCancel()
	}

	opts := append([]chromedp.ExecAllocatorOption{},
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Headless,
		chromedp.NoSandbox,
		chromedp.DisableGPU,
		chromedp.Flag("disable-setuid-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-extensions", true),
		chromedp.Flag("disable-background-networking", true),
		chromedp.Flag("disable-renderer-backgrounding", true),
		chromedp.Flag("font-render-hinting", "none"),
	)
	if m.cfg.ChromePath != "" {
		opts = append(opts, chromedp.ExecPath(m.cfg.ChromePath))
	}

	allocCtx, allocCancel := chromedp.NewExecAllocator(context.Background(), opts...)
	rootCtx, rootCancel := chromedp.NewContext(allocCtx)
	if err := chromedp.Do(rootCtx); err != nil {
		rootCancel()
		allocCancel()
		return nil, fmt.Errorf("launch browser (%s): %w", m.cfg.ChromePath, err)
	}

	slog.Info("render browser launched", "executable", m.cfg.ChromePath)
	m.allocCancel = allocCancel
	m.rootCtx = rootCtx
	m.rootCancel = rootCancel
	m.activeOps++
	return rootCtx, nil
}

func (m *Manager) endOp() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.activeOps > 0 {
		m.activeOps--
	}
	if m.activeOps == 0 && !m.closed {
		if m.idleTimer != nil {
			m.idleTimer.Stop()
		}
		m.idleTimer = time.AfterFunc(idleCloseDuration, func() {
			m.mu.Lock()
			idle := m.activeOps == 0 && !m.closed
			m.mu.Unlock()
			if idle {
				m.resetMarkdownTab()
				m.closeBrowser()
				slog.Info("render browser closed after idle timeout")
			}
		})
	}
}

func (m *Manager) resetMarkdownTab() {
	m.mdMu.Lock()
	cancel := m.mdCancel
	m.mdCtx = nil
	m.mdCancel = nil
	m.mdMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (m *Manager) startFetchProxy(tabCtx context.Context, webOrigin string, blockThirdPartyScripts bool) error {
	events := chromedp.Events(tabCtx, fetch.RequestPaused)
	_, err := chromedp.Call(tabCtx, fetch.Enable, fetch.EnableParams{
		Patterns: []*fetch.RequestPattern{{RequestStage: fetch.RequestStageRequest}},
	})
	if err != nil {
		return err
	}
	go func() {
		for ev, iterErr := range events {
			if iterErr != nil {
				return
			}
			go m.handlePausedRequest(tabCtx, ev, webOrigin, blockThirdPartyScripts)
		}
	}()
	return nil
}

func (m *Manager) handlePausedRequest(
	tabCtx context.Context,
	ev fetch.EventRequestPaused,
	webOrigin string,
	blockThirdPartyScripts bool,
) {
	if tabCtx.Err() != nil {
		return
	}
	reqURL := ev.Request.URL
	if ev.ResourceType == network.ResourceTypeMedia || ev.ResourceType == network.ResourceTypeWebSocket {
		_, _ = chromedp.Call(tabCtx, fetch.FailRequest, fetch.FailRequestParams{
			RequestID:   ev.RequestID,
			ErrorReason: network.ErrorReasonAborted,
		})
		return
	}
	if matches := reAssetDownloadPath.FindStringSubmatch(reqURL); len(matches) == 2 {
		blobCtx, cancel := context.WithTimeout(tabCtx, 6*time.Second)
		data, ct, err := m.cfg.FetchInternalBlob(blobCtx, matches[1])
		cancel()
		if err == nil {
			_, _ = chromedp.Call(tabCtx, fetch.FulfillRequest, fetch.FulfillRequestParams{
				RequestID:    ev.RequestID,
				ResponseCode: 200,
				ResponseHeaders: []*fetch.HeaderEntry{
					{Name: "Content-Type", Value: ct},
					{Name: "Cache-Control", Value: "public, max-age=300"},
				},
				Body: data,
			})
			return
		}
		_, _ = chromedp.Call(tabCtx, fetch.FailRequest, fetch.FailRequestParams{
			RequestID:   ev.RequestID,
			ErrorReason: network.ErrorReasonFailed,
		})
		return
	}
	if blockThirdPartyScripts {
		allowed := (webOrigin != "" && strings.HasPrefix(reqURL, webOrigin)) ||
			strings.HasPrefix(reqURL, "data:") ||
			strings.HasPrefix(reqURL, "blob:") ||
			ev.ResourceType == network.ResourceTypeImage ||
			ev.ResourceType == network.ResourceTypeFont ||
			ev.ResourceType == network.ResourceTypeStylesheet
		if !allowed {
			_, _ = chromedp.Call(tabCtx, fetch.FailRequest, fetch.FailRequestParams{
				RequestID:   ev.RequestID,
				ErrorReason: network.ErrorReasonAborted,
			})
			return
		}
	}
	_, _ = chromedp.Call(tabCtx, fetch.ContinueRequest, fetch.ContinueRequestParams{
		RequestID: ev.RequestID,
	})
}

func (m *Manager) ensureMarkdownTab(rootCtx context.Context) (context.Context, error) {
	if m.mdCtx != nil && m.mdCtx.Err() == nil {
		return m.mdCtx, nil
	}
	if m.mdCancel != nil {
		m.mdCancel()
		m.mdCtx = nil
		m.mdCancel = nil
	}

	tabCtx, cancel := chromedp.NewContext(rootCtx, chromedp.WithNewBrowserContext())
	if err := chromedp.Do(tabCtx); err != nil {
		cancel()
		return nil, err
	}

	opCtx, opCancel := context.WithTimeout(tabCtx, 15*time.Second)
	defer opCancel()

	webOrigin := ""
	if parsed, err := url.Parse(m.cfg.WebBase); err == nil {
		webOrigin = parsed.Scheme + "://" + parsed.Host
	}
	if err := chromedp.Do(opCtx,
		chromedp.EmulateViewport(thumbWidth, thumbHeight, chromedp.EmulateScale(1)),
	); err != nil {
		cancel()
		return nil, err
	}
	_, _ = chromedp.Call(opCtx, emulation.SetEmulatedMedia, emulation.SetEmulatedMediaParams{
		Features: []*emulation.MediaFeature{{Name: "prefers-color-scheme", Value: "dark"}},
	})
	if err := m.startFetchProxy(tabCtx, webOrigin, true); err != nil {
		cancel()
		return nil, err
	}

	renderURL := strings.TrimRight(m.cfg.WebBase, "/") + "/render/thumbnail"
	if err := chromedp.Do(opCtx, chromedp.Navigate(renderURL)); err != nil {
		cancel()
		return nil, err
	}
	if err := waitUntilTrue(opCtx, `window.__thumbnailRendererReady === true`, 12*time.Second); err != nil {
		cancel()
		return nil, err
	}

	m.mdCtx = tabCtx
	m.mdCancel = cancel
	return tabCtx, nil
}

func (m *Manager) RenderMarkdownThumbnail(ctx context.Context, title, markdown string) ([]byte, error) {
	rootCtx, err := m.beginOp()
	if err != nil {
		return nil, err
	}
	defer m.endOp()

	m.mdMu.Lock()
	defer m.mdMu.Unlock()

	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		tabCtx, tabErr := m.ensureMarkdownTab(rootCtx)
		if tabErr != nil {
			lastErr = tabErr
			if m.mdCancel != nil {
				m.mdCancel()
				m.mdCtx = nil
				m.mdCancel = nil
			}
			continue
		}

		m.mdSeq++
		seq := m.mdSeq
		opCtx, opCancel := context.WithTimeout(tabCtx, 12*time.Second)
		payloadExpr := fmt.Sprintf(
			`window.__renderThumbnail && window.__renderThumbnail({ title: %q, markdown: %q, seq: %d })`,
			title, markdown, seq,
		)
		_, evalErr := chromedp.Run(opCtx, chromedp.Evaluate[any](payloadExpr))
		if evalErr == nil {
			evalErr = waitUntilTrue(opCtx, fmt.Sprintf(`(window.__thumbnailRenderedSeq || 0) >= %d`, seq), 6*time.Second)
		}
		if evalErr == nil {
			_, _ = chromedp.Run(opCtx, chromedp.Evaluate[any](settleImagesAndFontsJS(1500), chromedp.EvalAwaitPromise))
			hasDiagram, _ := chromedp.Run(opCtx, chromedp.Evaluate[bool](`Boolean(document.querySelector(".mermaid, svg.flowchart, canvas"))`))
			if hasDiagram {
				time.Sleep(350 * time.Millisecond)
			}
			var q int64 = 82
			ss, ssErr := chromedp.Call(opCtx, page.CaptureScreenshot, page.CaptureScreenshotParams{
				Format:  page.CaptureScreenshotFormatJpeg,
				Quality: &q,
			})
			opCancel()
			if ssErr == nil {
				return ss.Data, nil
			}
			evalErr = ssErr
		} else {
			opCancel()
		}
		lastErr = evalErr
		if m.mdCancel != nil {
			m.mdCancel()
			m.mdCtx = nil
			m.mdCancel = nil
		}
	}
	return nil, fmt.Errorf("render markdown thumbnail: %w", lastErr)
}

func (m *Manager) RenderHTMLThumbnail(ctx context.Context, html string) ([]byte, error) {
	rootCtx, err := m.beginOp()
	if err != nil {
		return nil, err
	}
	defer m.endOp()

	tabCtx, cancel := chromedp.NewContext(rootCtx, chromedp.WithNewBrowserContext())
	defer cancel()

	if err := chromedp.Do(tabCtx); err != nil {
		return nil, err
	}
	opCtx, opCancel := context.WithTimeout(tabCtx, 12*time.Second)
	defer opCancel()

	if err := chromedp.Do(opCtx,
		chromedp.EmulateViewport(thumbWidth, thumbHeight, chromedp.EmulateScale(1)),
		chromedp.Navigate("about:blank"),
	); err != nil {
		return nil, err
	}
	_, _ = chromedp.Call(opCtx, security.SetIgnoreCertificateErrors, security.SetIgnoreCertificateErrorsParams{Ignore: true})
	_ = m.startFetchProxy(tabCtx, "", false)

	frameTree, err := chromedp.Call(opCtx, page.GetFrameTree, cdp.Empty{})
	if err != nil {
		return nil, err
	}
	contentCtx, contentCancel := context.WithTimeout(tabCtx, 5*time.Second)
	_, err = chromedp.Call(contentCtx, page.SetDocumentContent, page.SetDocumentContentParams{
		FrameID: frameTree.FrameTree.Frame.ID,
		HTML:    html,
	})
	contentCancel()
	if err != nil {
		slog.Warn("html setDocumentContent timed out or failed; capturing best-effort frame", "err", err)
	}

	_, _ = chromedp.Run(opCtx, chromedp.Evaluate[any](settleImagesAndFontsJS(1200), chromedp.EvalAwaitPromise))
	time.Sleep(250 * time.Millisecond)

	var q int64 = 80
	ss, err := chromedp.Call(opCtx, page.CaptureScreenshot, page.CaptureScreenshotParams{
		Format:  page.CaptureScreenshotFormatJpeg,
		Quality: &q,
	})
	if err != nil {
		return nil, fmt.Errorf("capture html screenshot: %w", err)
	}
	return ss.Data, nil
}

func (m *Manager) RunPresentationStage(ctx context.Context, req presentation.Request) (presentation.Response, error) {
	cleanHTML := presentation.StripStageFit(req.HTML)
	rootCtx, err := m.beginOp()
	if err != nil {
		return presentation.Response{HTML: cleanHTML, Applied: []presentation.AppliedFit{}}, err
	}
	defer m.endOp()

	tabCtx, cancel := chromedp.NewContext(rootCtx, chromedp.WithNewBrowserContext())
	defer cancel()

	if err := chromedp.Do(tabCtx); err != nil {
		return presentation.Response{HTML: cleanHTML, Applied: []presentation.AppliedFit{}}, err
	}

	consoleErrors := make([]string, 0, 8)
	var consoleMu sync.Mutex
	consoleMsgs := chromedp.Console(tabCtx)
	go func() {
		for msg, iterErr := range consoleMsgs {
			if iterErr != nil {
				return
			}
			if msg.Type == "error" || msg.Type == "exception" {
				consoleMu.Lock()
				if len(consoleErrors) < 20 {
					consoleErrors = append(consoleErrors, msg.Text)
				}
				consoleMu.Unlock()
			}
		}
	}()

	opCtx, opCancel := context.WithTimeout(tabCtx, 45*time.Second)
	defer opCancel()

	if err := chromedp.Do(opCtx,
		chromedp.EmulateViewport(presentation.StageWidth, presentation.StageHeight, chromedp.EmulateScale(1)),
		chromedp.Navigate("about:blank"),
	); err != nil {
		return presentation.Response{HTML: cleanHTML, Applied: []presentation.AppliedFit{}}, err
	}
	_, _ = chromedp.Call(opCtx, emulation.SetEmulatedMedia, emulation.SetEmulatedMediaParams{
		Features: []*emulation.MediaFeature{{Name: "prefers-reduced-motion", Value: "reduce"}},
	})
	_, _ = chromedp.Call(opCtx, security.SetIgnoreCertificateErrors, security.SetIgnoreCertificateErrorsParams{Ignore: true})
	_ = m.startFetchProxy(tabCtx, "", false)

	frameTree, err := chromedp.Call(opCtx, page.GetFrameTree, cdp.Empty{})
	if err != nil {
		return presentation.Response{HTML: cleanHTML, Applied: []presentation.AppliedFit{}}, err
	}

	staticHTML := presentation.StaticRenderHTML(cleanHTML)
	if !req.Fit {
		staticHTML = presentation.StaticRenderHTML(req.HTML)
	}
	if _, err := chromedp.Call(opCtx, page.SetDocumentContent, page.SetDocumentContentParams{
		FrameID: frameTree.FrameTree.Frame.ID,
		HTML:    staticHTML,
	}); err != nil {
		return presentation.Response{HTML: cleanHTML, Applied: []presentation.AppliedFit{}}, err
	}

	_, _ = chromedp.Run(opCtx, chromedp.Evaluate[any](presentation.SettleStageJS, chromedp.EvalAwaitPromise))
	time.Sleep(300 * time.Millisecond)

	pageCount, err := chromedp.Run(opCtx, chromedp.Evaluate[int](presentation.MeasureRectJS))
	if err != nil {
		return presentation.Response{HTML: cleanHTML, Applied: []presentation.AppliedFit{}}, err
	}

	degradeSet := make(map[int]bool, len(req.DegradePages))
	for _, p := range req.DegradePages {
		degradeSet[p] = true
	}

	outHTML := req.HTML
	applied := make([]presentation.AppliedFit, 0)
	if req.Fit {
		outHTML = cleanHTML
		for index := 0; index < pageCount; index++ {
			measured, mErr := chromedp.Run(opCtx, chromedp.Evaluate[*presentation.FitMeasureResult](presentation.FitMeasurePageJS(index)))
			if mErr != nil || measured == nil {
				continue
			}
			degrade := degradeSet[index+1]
			minScale := presentation.MinAutoFitScale
			if degrade {
				minScale = presentation.DegradeMinAutoFitScale
			}
			scale, overfilled := presentation.ResolveStageFitScale(measured.RequiredWidth, measured.RequiredHeight, degrade, minScale)
			finalScale := scale
			if !overfilled && (scale < 0.999 || degrade) {
				var zoomRes struct {
					Scale float64 `json:"scale"`
				}
				zoomRes, zErr := chromedp.Run(opCtx, chromedp.Evaluate[struct {
					Scale float64 `json:"scale"`
				}](presentation.FitZoomPageJS(index, scale, minScale)))
				if zErr == nil && zoomRes.Scale > 0 {
					finalScale = zoomRes.Scale
				}
			}
			if overfilled || finalScale < 0.999 || len(measured.RepairedTextIDs) > 0 {
				fitScale := finalScale
				if overfilled {
					fitScale = 1
				}
				applied = append(applied, presentation.AppliedFit{
					Page:            index + 1,
					PageID:          measured.PageID,
					Scale:           fitScale,
					RepairedTextIDs: measured.RepairedTextIDs,
					Overfilled:      overfilled,
					Degraded:        degrade && finalScale < 0.999,
				})
			}
			if !overfilled && finalScale < 0.999 {
				_, _ = chromedp.Run(opCtx, chromedp.Evaluate[any](presentation.FitMarkSlideJS(index, finalScale, degrade)))
			}
		}
		outHTML = presentation.InjectStageFit(cleanHTML, applied)
	}

	var auditOut *presentation.RenderAudit
	if req.Audit {
		issues := make([]presentation.RenderIssue, 0)
		slides := make([]presentation.SlideAudit, 0, pageCount)
		maxSS := req.MaxScreenshots
		if maxSS <= 0 {
			maxSS = 12
		}
		if maxSS > pageCount {
			maxSS = pageCount
		}
		var screenshotSet map[int]bool
		if len(req.ScreenshotPages) > 0 {
			screenshotSet = make(map[int]bool, len(req.ScreenshotPages))
			for _, p := range req.ScreenshotPages {
				if p >= 1 && p <= pageCount {
					screenshotSet[p] = true
				}
			}
		}

		for index := 0; index < pageCount; index++ {
			res, aErr := chromedp.Run(opCtx, chromedp.Evaluate[*presentation.AuditPageResult](presentation.AuditPageJS(index)))
			if aErr != nil || res == nil {
				continue
			}
			for _, f := range res.Found {
				issues = append(issues, presentation.RenderIssue{
					Code:      f.Code,
					Severity:  f.Severity,
					Page:      index + 1,
					PageID:    res.PageID,
					ElementID: f.ElementID,
					Message:   f.Message,
					Geometry:  f.Geometry,
				})
			}
			fontIssueCount := 0
			for _, c := range res.FontCandidates {
				floor, ok := presentation.ResolveFontFloor(c.Kind, c.Role, c.TagName, c.ClassName)
				if !ok {
					continue
				}
				fitScale := res.PageFitScale
				if fitScale <= 0 {
					fitScale = 1
				}
				effective := c.DesignFontSize * fitScale
				if effective <= 0 || effective >= float64(floor) {
					continue
				}
				sev := "error"
				if res.Degraded {
					sev = "warning"
				}
				issues = append(issues, presentation.RenderIssue{
					Code:      "RENDER_FONT_TOO_SMALL",
					Severity:  sev,
					Page:      index + 1,
					PageID:    res.PageID,
					ElementID: c.ElementID,
					Message:   presentation.FormatFontTooSmallIssue(c.ElementID, c.DesignFontSize, fitScale, floor, res.PageOverflowed),
				})
				fontIssueCount++
			}

			var ssDataURL string
			wantShot := req.Screenshots && ((screenshotSet != nil && screenshotSet[index+1]) || (screenshotSet == nil && index < maxSS))
			if wantShot {
				var q int64 = presentation.DefaultScreenshotQuality
				ss, ssErr := chromedp.Call(opCtx, page.CaptureScreenshot, page.CaptureScreenshotParams{
					Format:  page.CaptureScreenshotFormatJpeg,
					Quality: &q,
				})
				if ssErr == nil && len(ss.Data) > 0 {
					ssDataURL = "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(ss.Data)
				}
			}

			slides = append(slides, presentation.SlideAudit{
				Page:              index + 1,
				PageID:            res.PageID,
				Title:             res.Title,
				ScreenshotDataURL: ssDataURL,
				IssueCount:        len(res.Found) + fontIssueCount,
			})
		}

		consoleMu.Lock()
		copiedConsole := make([]string, len(consoleErrors))
		copy(copiedConsole, consoleErrors)
		consoleMu.Unlock()

		auditOut = &presentation.RenderAudit{
			Available:     true,
			PageCount:     pageCount,
			Issues:        issues,
			Slides:        slides,
			ConsoleErrors: copiedConsole,
			Summary:       presentation.AuditSummary(pageCount, issues),
		}
	}

	return presentation.Response{
		HTML:    outHTML,
		Applied: applied,
		Audit:   auditOut,
	}, nil
}

func waitUntilTrue(ctx context.Context, jsExpr string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		ok, err := chromedp.Run(ctx, chromedp.Evaluate[bool](jsExpr))
		if err == nil && ok {
			return nil
		}
		if time.Now().After(deadline) {
			if err != nil {
				return err
			}
			return fmt.Errorf("timed out waiting for %s", jsExpr)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(40 * time.Millisecond):
		}
	}
}

func settleImagesAndFontsJS(imgTimeoutMs int) string {
	return fmt.Sprintf(`(async () => {
  await Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 600)),
  ]);
  const pendingImgs = Array.from(document.images).filter((img) => !img.complete);
  if (pendingImgs.length > 0) {
    await Promise.race([
      Promise.all(pendingImgs.map((img) => new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      }))),
      new Promise((resolve) => setTimeout(resolve, %d)),
    ]);
  }
})()`, imgTimeoutMs)
}
