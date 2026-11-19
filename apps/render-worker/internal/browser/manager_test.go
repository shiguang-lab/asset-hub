package browser

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/shiguang-lab/asset-hub/apps/render-worker/internal/platform"
	"github.com/shiguang-lab/asset-hub/apps/render-worker/internal/presentation"
)

func TestBrowserRenderHTMLAndPresentation(t *testing.T) {
	cfg := platform.LoadConfig()
	if cfg.ChromePath == "" {
		t.Skip("no local Chrome / headless-shell binary found")
	}

	mgr := NewManager(cfg)
	defer mgr.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	jpeg, err := mgr.RenderHTMLThumbnail(ctx, `<!doctype html><html><body style="background:#111827;color:#fff;padding:40px"><h1>Render Worker</h1></body></html>`)
	if err != nil {
		t.Fatalf("RenderHTMLThumbnail failed: %v", err)
	}
	if len(jpeg) < 100 || !bytes.HasPrefix(jpeg, []byte{0xff, 0xd8}) {
		t.Fatalf("expected valid JPEG bytes, got len=%d", len(jpeg))
	}

	deck := `<html><head><style>*{box-sizing:border-box}html,body{margin:0;padding:0}[data-sg-page]{width:1920px;height:1080px;display:flex;flex-direction:column;position:relative;overflow:hidden}</style></head><body>` +
		`<section data-sg-page data-sg-id="p1"><div data-sg-id="body" data-sg-kind="text" style="height:1400px;flex-shrink:0;font-size:24px">超大溢出正文</div></section>` +
		`</body></html>`

	res, err := mgr.RunPresentationStage(ctx, presentation.Request{
		HTML:            deck,
		Fit:             true,
		Audit:           true,
		Screenshots:     true,
		ScreenshotPages: []int{1},
	})
	if err != nil {
		t.Fatalf("RunPresentationStage failed: %v", err)
	}
	if res.Audit == nil || !res.Audit.Available || res.Audit.PageCount != 1 {
		t.Fatalf("unexpected audit result: %+v", res.Audit)
	}
	if len(res.Applied) == 0 || !res.Applied[0].Overfilled {
		t.Fatalf("expected page 1 overfilled, got %+v", res.Applied)
	}
	if len(res.Audit.Issues) == 0 {
		t.Fatalf("expected audit issues for overflow, got none")
	}
	if res.Audit.Slides[0].ScreenshotDataURL == "" {
		t.Fatal("expected slide 1 screenshot data URL")
	}
}
