package presentation

import (
	"strings"
	"testing"
)

func TestResolveStageFitScale(t *testing.T) {
	scale, overfilled := ResolveStageFitScale(1920, 1080, false, 0)
	if scale != 1 || overfilled {
		t.Fatalf("expected (1, false), got (%v, %v)", scale, overfilled)
	}

	// Sub-percent drift gets zoomed nicely above 0.89 floor
	scale, overfilled = ResolveStageFitScale(1920, 1140, false, 0)
	if overfilled || scale >= 1 || scale < MinAutoFitScale {
		t.Fatalf("expected zoom in [0.89, 1), got (%v, %v)", scale, overfilled)
	}

	// Huge overflow is refused without force
	scale, overfilled = ResolveStageFitScale(1920, 1600, false, 0)
	if !overfilled || scale != 1 {
		t.Fatalf("expected (1, true) for huge overflow, got (%v, %v)", scale, overfilled)
	}

	// Degrade mode forces minimumScale even when overfilled
	scale, overfilled = ResolveStageFitScale(1920, 1600, true, DegradeMinAutoFitScale)
	if overfilled || scale != DegradeMinAutoFitScale {
		t.Fatalf("expected (%v, false), got (%v, %v)", DegradeMinAutoFitScale, scale, overfilled)
	}
}

func TestResolveFontFloor(t *testing.T) {
	if _, ok := ResolveFontFloor("", "source", "div", ""); ok {
		t.Fatal("expected source role to be exempt")
	}
	if _, ok := ResolveFontFloor("", "", "figcaption", ""); ok {
		t.Fatal("expected figcaption to be exempt")
	}
	if floor, ok := ResolveFontFloor("table", "", "div", ""); !ok || floor != DenseTextFontFloor {
		t.Fatalf("expected dense floor %d, got (%d, %v)", DenseTextFontFloor, floor, ok)
	}
	if floor, ok := ResolveFontFloor("text", "", "p", ""); !ok || floor != TextFontFloor {
		t.Fatalf("expected body floor %d, got (%d, %v)", TextFontFloor, floor, ok)
	}
}

func TestStaticRenderAndInjectStageFit(t *testing.T) {
	raw := `<html><head></head><body><section data-sg-page data-sg-id="p1"></section></body></html>`
	static := StaticRenderHTML(raw)
	if !strings.Contains(static, `data-sg-static="1"`) || !strings.Contains(static, `data-sg-static-style`) {
		t.Fatalf("unexpected StaticRenderHTML output: %s", static)
	}
	injected := InjectStageFit(raw, []AppliedFit{
		{Page: 1, PageID: "p1", Scale: 0.94, RepairedTextIDs: []string{"t1"}},
	})
	if !strings.Contains(injected, `data-sg-auto-fit="0.9400"`) || !strings.Contains(injected, `zoom:0.94000`) {
		t.Fatalf("unexpected InjectStageFit output: %s", injected)
	}
	if stripped := StripStageFit(injected); strings.Contains(stripped, "data-sg-stage-fit") || strings.Contains(stripped, "data-sg-auto-fit") {
		t.Fatalf("StripStageFit left attributes behind: %s", stripped)
	}
}
