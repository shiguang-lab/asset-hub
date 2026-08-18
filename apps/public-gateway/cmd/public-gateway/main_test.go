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
