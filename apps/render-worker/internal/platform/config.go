package platform

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Config struct {
	Port          string
	ValidTokens   map[string]struct{}
	OutboundToken string
	APIBase       string
	WebBase       string
	ChromePath    string
	HTTPClient    *http.Client
}

var chromeCandidates = []string{
	"/headless-shell/headless-shell",
	"/usr/bin/chrome-headless-shell",
	"/usr/bin/chromium-browser",
	"/usr/bin/chromium",
	"/usr/bin/google-chrome",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
}

func LoadConfig() Config {
	port := strings.TrimSpace(os.Getenv("RENDER_PORT"))
	if port == "" {
		port = "3006"
	}

	validTokens := make(map[string]struct{})
	var outboundToken string
	for _, envKey := range []string{"RENDER_TOKEN", "WORKER_TOKEN", "INTERNAL_TOKEN"} {
		if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
			validTokens[v] = struct{}{}
			if outboundToken == "" {
				outboundToken = v
			}
		}
	}
	if os.Getenv("NODE_ENV") != "production" {
		for _, devTok := range []string{"dev-render-token", "dev-worker-token", "dev-internal-token"} {
			validTokens[devTok] = struct{}{}
			if outboundToken == "" {
				outboundToken = devTok
			}
		}
	}

	apiBase := strings.TrimRight(strings.TrimSpace(os.Getenv("API_INTERNAL_BASE")), "/")
	if apiBase == "" {
		apiBase = "http://localhost:3001"
	}
	webBase := strings.TrimRight(strings.TrimSpace(os.Getenv("WEB_INTERNAL_BASE")), "/")
	if webBase == "" {
		if strings.Contains(apiBase, "://api:") {
			webBase = "http://web:8080"
		} else {
			webBase = "http://localhost:5173"
		}
	}

	chromePath := resolveChromePath()

	return Config{
		Port:          port,
		ValidTokens:   validTokens,
		OutboundToken: outboundToken,
		APIBase:       apiBase,
		WebBase:       webBase,
		ChromePath:    chromePath,
		HTTPClient:    &http.Client{Timeout: 15 * time.Second},
	}
}

func resolveChromePath() string {
	for _, envKey := range []string{"CHROME_HEADLESS_SHELL_PATH", "CHROMIUM_EXECUTABLE_PATH", "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"} {
		if p := strings.TrimSpace(os.Getenv(envKey)); p != "" {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	for _, candidate := range chromeCandidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return ""
}

func (c Config) FetchInternalBlob(ctx context.Context, assetID string) ([]byte, string, error) {
	endpoint := fmt.Sprintf("%s/internal/v1/assets/%s/blob", c.APIBase, url.PathEscape(assetID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, "", err
	}
	if c.OutboundToken != "" {
		req.Header.Set("X-Internal-Token", c.OutboundToken)
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("blob API returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, "", err
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	return body, ct, nil
}

func Authorize(w http.ResponseWriter, r *http.Request, cfg Config) bool {
	token := strings.TrimSpace(r.Header.Get("X-Internal-Token"))
	if token == "" {
		writeUnauthorized(w)
		return false
	}
	if _, ok := cfg.ValidTokens[token]; !ok {
		writeUnauthorized(w)
		return false
	}
	return true
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"code":"UNAUTHORIZED"}`))
}
