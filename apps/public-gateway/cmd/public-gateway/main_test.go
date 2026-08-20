package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shiguang-lab/asset-hub/apps/public-gateway/internal/platform"
)

func TestReleaseDownloadAndAttachment(t *testing.T) {
	var meta PublishMeta
	err := json.Unmarshal([]byte(`{
		"release": {
			"id": "rel_1",
			"manifest": {
				"download": {"path": "index.md", "name": "文档.md"},
				"attachments": [
					{"id": "ast_file", "path": "attachments/ast_file/demo.apk", "name": "demo.apk"}
				]
			}
		}
	}`), &meta)
	if err != nil {
		t.Fatal(err)
	}
	path, name, ok := releaseDownload(meta)
	if !ok || path != "index.md" || name != "文档.md" {
		t.Fatalf("unexpected download: %q %q %v", path, name, ok)
	}
	path, name, ok = releaseAttachment(meta, "ast_file")
	if !ok || path != "attachments/ast_file/demo.apk" || name != "demo.apk" {
		t.Fatalf("unexpected attachment: %q %q %v", path, name, ok)
	}
	if _, _, ok = releaseAttachment(meta, "missing"); ok {
		t.Fatal("missing attachment should not resolve")
	}
}

func TestSafeReturnTo(t *testing.T) {
	for _, value := range []string{
		"/p/demo",
		"/p/demo/download",
		"/p/demo/attachments/ast_file",
	} {
		if got := safeReturnTo("demo", value); got != value {
			t.Fatalf("expected %q, got %q", value, got)
		}
	}
	if got := safeReturnTo("demo", "https://example.com"); got != "/p/demo" {
		t.Fatalf("unsafe return target was not rejected: %q", got)
	}
	for _, value := range []string{
		"/s/share12",
		"/s/share12/download",
		"/s/share12/attachments/ast_file",
		"/s/share12/r/ref-doc",
	} {
		if got := safeReturnToBase("/s/share12", value); got != value {
			t.Fatalf("expected short-link return target %q, got %q", value, got)
		}
	}
	if got := safeReturnToBase("/s/share12", "/p/another"); got != "/s/share12" {
		t.Fatalf("cross-publish return target was not rejected: %q", got)
	}
}

func TestReleaseAssetLinksUseSSRForMarkdownReferences(t *testing.T) {
	var meta PublishMeta
	err := json.Unmarshal([]byte(`{
		"publish": {"shortSlug": "share12"},
		"release": {
			"id": "rel_1",
			"manifest": {
				"references": [
					{"assetId": "ast_doc", "refKey": "ref-doc", "path": "refs/ast_doc/index.md", "title": "文档"},
					{"assetId": "ast_html", "refKey": "ref-html", "path": "refs/ast_html/index.html", "title": "HTML"},
					{"assetId": "ast_legacy", "path": "refs/ast_legacy/index.md", "title": "旧文档"}
				]
			}
		}
	}`), &meta)
	if err != nil {
		t.Fatal(err)
	}
	links := releaseAssetLinks(meta, "demo")
	if links["ast_doc"] != "/s/share12/r/ref-doc" {
		t.Fatalf("document reference did not use SSR route: %q", links["ast_doc"])
	}
	if links["ast_html"] != "/s/share12/assets/refs/ast_html/index.html" {
		t.Fatalf("HTML reference did not keep asset route: %q", links["ast_html"])
	}
	if links["ast_legacy"] != "/s/share12/r/ast_legacy" {
		t.Fatalf("legacy reference did not fall back to its asset id: %q", links["ast_legacy"])
	}
	if assetID, ok := releaseReferenceAssetID(meta, "ref-doc"); !ok || assetID != "ast_doc" {
		t.Fatalf("reference key resolved to unexpected asset: %q %v", assetID, ok)
	}
	if assetID, ok := releaseReferenceAssetID(meta, "ast_legacy"); !ok || assetID != "ast_legacy" {
		t.Fatalf("legacy reference key resolved to unexpected asset: %q %v", assetID, ok)
	}
	if _, ok := releaseReferenceAssetID(meta, "missing"); ok {
		t.Fatal("missing reference key should not resolve")
	}
}

func TestServeSSRInternallyRewritesShortPath(t *testing.T) {
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/render/canonical" {
			t.Errorf("unexpected SSR path: %q", r.URL.Path)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/html"}},
			Body:       io.NopCloser(strings.NewReader("<main>ok</main>")),
			Request:    r,
		}, nil
	})
	defer func() { http.DefaultTransport = originalTransport }()

	request := httptest.NewRequest(http.MethodGet, "https://doc.shiguanglab.com/s/share12", nil)
	response := httptest.NewRecorder()
	serveSSR(response, request, platform.Config{SSRBaseURL: "http://ssr.test:3005"}, "canonical")

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", response.Code)
	}
	if response.Header().Get("Location") != "" {
		t.Fatalf("short route unexpectedly redirected to %q", response.Header().Get("Location"))
	}
	if request.URL.Path != "/s/share12" {
		t.Fatalf("public request path was not restored: %q", request.URL.Path)
	}
}

func TestProxySSRPreservesStaticAssetPathAndQuery(t *testing.T) {
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/_next/static/css/app.css" {
			t.Errorf("unexpected SSR path: %q", r.URL.Path)
		}
		if r.URL.RawQuery != "v=1" {
			t.Errorf("unexpected SSR query: %q", r.URL.RawQuery)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/css"}},
			Body:       io.NopCloser(strings.NewReader("body{}")),
			Request:    r,
		}, nil
	})
	defer func() { http.DefaultTransport = originalTransport }()

	request := httptest.NewRequest(http.MethodGet, "https://doc.shiguanglab.com/_next/static/css/app.css?v=1", nil)
	request.Host = "doc.shiguanglab.com"
	response := httptest.NewRecorder()
	proxySSR(response, request, platform.Config{SSRBaseURL: "http://ssr.test:3005"})

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", response.Code)
	}
	if got := response.Header().Get("Content-Type"); got != "text/css" {
		t.Fatalf("unexpected content type: %q", got)
	}
	if got := response.Body.String(); !strings.Contains(got, "body") {
		t.Fatalf("unexpected body: %q", got)
	}
	if request.Host != "doc.shiguanglab.com" {
		t.Fatalf("proxy did not restore request host: %q", request.Host)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}
