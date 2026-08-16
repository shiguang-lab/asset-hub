package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/shiguang-lab/asset-hub/apps/public-gateway/internal/platform"
)

type PublishMeta struct {
	Publish struct {
		ID            string  `json:"id"`
		Slug          string  `json:"slug"`
		ShortSlug     string  `json:"shortSlug"`
		Visibility    string  `json:"visibility"`
		ExpiresAt     *string `json:"expiresAt"`
		AllowDownload bool    `json:"allowDownload"`
		AllowCopy     bool    `json:"allowCopy"`
		Status        string  `json:"status"`
	} `json:"publish"`
	Release *struct {
		ID       string         `json:"id"`
		Etag     string         `json:"etag"`
		Manifest map[string]any `json:"manifest"`
		Created  string         `json:"createdAt"`
	} `json:"release"`
	Asset *struct {
		ID    string `json:"id"`
		Type  string `json:"type"`
		Title string `json:"title"`
	} `json:"asset"`
}

type metaCacheEntry struct {
	meta      PublishMeta
	fetchedAt time.Time
}

func main() {
	cfg := platform.LoadConfig()
	cache := newMetaCache(cfg)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /health/ready", func(w http.ResponseWriter, _ *http.Request) {
		if err := cfg.CheckAPI(); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "degraded", "detail": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /p/{slug}", func(w http.ResponseWriter, r *http.Request) {
		slug := r.PathValue("slug")
		meta, status := cache.resolve(slug)
		if status == 404 {
			serveErrorPage(w, http.StatusNotFound, "内容不存在或已被删除", "该发布内容不存在或链接已失效。")
			return
		}
		if status == 410 {
			serveErrorPage(w, http.StatusGone, "链接已过期", "该发布链接已过期或已撤销，请联系内容所有者。")
			return
		}
		pub := meta.Publish
		if pub.Status == "revoked" || pub.Status == "deleted" {
			serveErrorPage(w, http.StatusGone, "内容已撤销", "该发布内容已由所有者撤销。")
			return
		}
		if pub.Visibility == "password" && !unlocked(r, pub.ID, cfg) {
			serveUnlockPage(w, slug)
			return
		}
		if meta.Release == nil {
			serveErrorPage(w, http.StatusServiceUnavailable, "发布物尚未就绪", "该内容还在准备中，请稍后刷新。")
			return
		}
		serveReleaseFile(w, r, cfg, meta, "index.html", false)
		go recordAccess(cfg, meta, "index.html", r)
	})

	mux.HandleFunc("GET /p/{slug}/assets/{path...}", func(w http.ResponseWriter, r *http.Request) {
		slug := r.PathValue("slug")
		assetPath := r.PathValue("path")
		meta, status := cache.resolve(slug)
		if status != 200 || meta.Release == nil {
			serveErrorPage(w, http.StatusNotFound, "资源不存在", "该静态资源不存在。")
			return
		}
		if !manifestAllows(meta, assetPath) {
			serveErrorPage(w, http.StatusForbidden, "禁止访问", "该资源不在发布清单中。")
			return
		}
		serveReleaseFile(w, r, cfg, meta, assetPath, true)
	})

	mux.HandleFunc("GET /s/{shortSlug}", func(w http.ResponseWriter, r *http.Request) {
		short := r.PathValue("shortSlug")
		meta, status := cache.resolve(short)
		if status != 200 {
			serveErrorPage(w, http.StatusNotFound, "短链无效", "该短链不存在或已撤销。")
			return
		}
		http.Redirect(w, r, "/p/"+meta.Publish.Slug, http.StatusFound)
	})

	mux.HandleFunc("GET /{path...}", func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if idx := strings.Index(host, ":"); idx >= 0 {
			host = host[:idx]
		}
		if host == "" || host == "localhost" || host == "127.0.0.1" || strings.HasSuffix(host, ".local") {
			serveErrorPage(w, http.StatusNotFound, "内容不存在", "该路径没有对应的发布内容。")
			return
		}
		resolved, err := cfg.ResolveDomain(host)
		if err != nil {
			serveErrorPage(w, http.StatusNotFound, "域名未绑定", "该域名未绑定任何已发布的资产。")
			return
		}
		meta, status := cache.resolve(resolved.Slug)
		if status != 200 || meta.Release == nil {
			serveErrorPage(w, http.StatusNotFound, "内容不存在", "该域名绑定的内容不存在。")
			return
		}
		serveReleaseFile(w, r, cfg, meta, "index.html", false)
		go recordAccess(cfg, meta, "index.html", r)
	})

	mux.HandleFunc("POST /p/{slug}/unlock", func(w http.ResponseWriter, r *http.Request) {
		slug := r.PathValue("slug")
		if err := r.ParseForm(); err != nil {
			serveErrorPage(w, http.StatusBadRequest, "参数错误", "请重新输入密码。")
			return
		}
		password := r.FormValue("password")
		token, err := cfg.Unlock(slug, password)
		if err != nil {
			serveErrorPage(w, http.StatusUnauthorized, "密码错误", "密码不正确，请重试。")
			return
		}
		publishID := token.PublishID
		http.SetCookie(w, &http.Cookie{
			Name:     "sg_pub_" + publishID,
			Value:    token.Token,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   12 * 3600,
		})
		http.Redirect(w, r, "/p/"+slug, http.StatusFound)
	})

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("public-gateway ready", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("public-gateway failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
	slog.Info("public-gateway stopped")
}

func newMetaCache(cfg platform.Config) *metaCache {
	return &metaCache{cfg: cfg, entries: map[string]metaCacheEntry{}}
}

type metaCache struct {
	cfg     platform.Config
	mu      sync.Mutex
	entries map[string]metaCacheEntry
}

func (c *metaCache) resolve(slug string) (PublishMeta, int) {
	c.mu.Lock()
	if entry, ok := c.entries[slug]; ok && time.Since(entry.fetchedAt) < 30*time.Second {
		meta := entry.meta
		c.mu.Unlock()
		return meta, 200
	}
	c.mu.Unlock()

	raw, status, err := c.cfg.FetchMeta(slug)
	if err != nil {
		slog.Error("fetch meta failed", "slug", slug, "err", err)
		return PublishMeta{}, http.StatusServiceUnavailable
	}
	if status == 200 {
		var parsed PublishMeta
		if err := json.Unmarshal(raw, &parsed); err != nil {
			slog.Error("parse meta failed", "slug", slug, "err", err)
			return PublishMeta{}, http.StatusServiceUnavailable
		}
		c.mu.Lock()
		c.entries[slug] = metaCacheEntry{meta: parsed, fetchedAt: time.Now()}
		c.mu.Unlock()
		return parsed, 200
	} else {
		c.mu.Lock()
		delete(c.entries, slug)
		c.mu.Unlock()
	}
	return PublishMeta{}, status
}

func unlocked(r *http.Request, publishID string, cfg platform.Config) bool {
	cookie, err := r.Cookie("sg_pub_" + publishID)
	if err != nil || cookie.Value == "" {
		return false
	}
	return cfg.VerifyToken(cookie.Value)
}

func serveReleaseFile(w http.ResponseWriter, r *http.Request, cfg platform.Config, meta PublishMeta, relPath string, immutable bool) {
	if meta.Release == nil || meta.Publish.ID == "" {
		serveErrorPage(w, http.StatusNotFound, "内容不存在", "该发布物不存在。")
		return
	}
	data, status, err := cfg.FetchReleaseFile(meta.Publish.ID, meta.Release.ID, relPath)
	if err != nil {
		serveErrorPage(w, http.StatusServiceUnavailable, "读取失败", "发布文件服务暂时不可用。")
		return
	}
	if status == http.StatusNotFound {
		serveErrorPage(w, http.StatusNotFound, "文件不存在", "该资源文件缺失。")
		return
	}
	if status != http.StatusOK {
		serveErrorPage(w, http.StatusInternalServerError, "读取失败", "读取资源失败。")
		return
	}
	contentType := contentTypeFor(relPath)
	h := w.Header()
	h.Set("Content-Type", contentType)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
	h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
	h.Set("Cross-Origin-Resource-Policy", "same-origin")
	h.Set("Cross-Origin-Opener-Policy", "same-origin")
	if relPath == "index.html" {
		h.Set("Cache-Control", "private, no-store")
		if csp, ok := meta.Release.Manifest["csp"].(string); ok && csp != "" {
			h.Add("Content-Security-Policy", csp)
		}
		// Published HTML shares the product origin by deployment decision. This
		// mandatory policy prevents it from reading authenticated API responses,
		// embedding product pages, submitting forms, or exfiltrating through
		// third-party subresources. A manifest CSP may only make it stricter.
		h.Add("Content-Security-Policy", strings.Join([]string{
			"default-src 'self' data: blob:",
			"connect-src 'none'",
			"frame-src 'none'",
			"frame-ancestors 'none'",
			"form-action 'none'",
			"base-uri 'none'",
			"object-src 'none'",
		}, "; "))
		if meta.Release.Etag != "" {
			h.Set("ETag", meta.Release.Etag)
		}
	} else if immutable {
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		h.Set("Cache-Control", "public, max-age=60, stale-while-revalidate=600")
	}
	modified := time.Now().UTC()
	if parsed, err := time.Parse(time.RFC3339, meta.Release.Created); err == nil {
		modified = parsed
	}
	http.ServeContent(w, r, relPath, modified, bytes.NewReader(data))
}

func manifestAllows(meta PublishMeta, assetPath string) bool {
	files, ok := meta.Release.Manifest["files"].([]any)
	if !ok {
		return assetPath == "index.html"
	}
	for _, f := range files {
		if m, ok := f.(map[string]any); ok {
			if p, ok := m["path"].(string); ok && p == assetPath {
				return true
			}
		}
	}
	return false
}

func contentTypeFor(path string) string {
	switch {
	case strings.HasSuffix(path, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(path, ".md"):
		return "text/markdown; charset=utf-8"
	case strings.HasSuffix(path, ".json"):
		return "application/json"
	case strings.HasSuffix(path, ".css"):
		return "text/css"
	case strings.HasSuffix(path, ".js"):
		return "application/javascript"
	case strings.HasSuffix(path, ".png"):
		return "image/png"
	case strings.HasSuffix(path, ".jpg"), strings.HasSuffix(path, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(path, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(path, ".pdf"):
		return "application/pdf"
	default:
		return "application/octet-stream"
	}
}

func serveUnlockPage(w http.ResponseWriter, slug string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, strings.ReplaceAll(unlockTemplate, "{{slug}}", slug))
}

func serveErrorPage(w http.ResponseWriter, status int, title, detail string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	page := strings.ReplaceAll(errorTemplate, "{{title}}", title)
	page = strings.ReplaceAll(page, "{{detail}}", detail)
	_, _ = io.WriteString(w, page)
}

const unlockTemplate = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>密码访问</title><style>body{font-family:-apple-system,"PingFang SC",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f8fb;color:#172033}form{background:#fff;padding:40px;border-radius:16px;box-shadow:0 8px 30px rgba(23,32,51,.08);width:340px}input{width:100%;padding:12px;border:1px solid #e5e7ef;border-radius:8px;font-size:16px;box-sizing:border-box}button{margin-top:16px;width:100%;padding:12px;background:#6d5dfc;color:#fff;border:0;border-radius:8px;font-size:16px;cursor:pointer}</style></head><body><form method="post" action="/p/{{slug}}/unlock"><h2>该内容受密码保护</h2><p style="color:#667085">请输入访问密码后查看。</p><input type="password" name="password" placeholder="访问密码" autofocus required><button type="submit">解锁</button></form></body></html>`

const errorTemplate = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{title}}</title><style>body{font-family:-apple-system,"PingFang SC",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f7f8fb;color:#172033}.box{text-align:center;padding:32px}h1{font-size:32px;margin:0 0 8px}p{color:#667085}</style></head><body><div class="box"><h1>{{title}}</h1><p>{{detail}}</p></div></body></html>`

func recordAccess(cfg platform.Config, meta PublishMeta, path string, r *http.Request) {
	ts := time.Now().UTC().Format("2006-01-02T15:04")
	payload := map[string]any{
		"publishId":      meta.Publish.ID,
		"releaseId":      releaseID(meta),
		"tsBucket":       ts,
		"referrerDomain": referrerDomain(r),
		"deviceClass":    "unknown",
		"hashedVisitor":  shortHash(r.RemoteAddr + r.UserAgent()),
		"statusCode":     200,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, cfg.APIBase+"/internal/v1/access", strings.NewReader(string(body)))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", cfg.GatewayToken)
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err == nil {
		_ = resp.Body.Close()
	}
}

func releaseID(meta PublishMeta) string {
	if meta.Release != nil {
		return meta.Release.ID
	}
	return ""
}

func referrerDomain(r *http.Request) string {
	ref := r.Header.Get("Referer")
	if ref == "" {
		return ""
	}
	parts := strings.SplitN(strings.TrimPrefix(strings.TrimPrefix(ref, "https://"), "http://"), "/", 2)
	return parts[0]
}

func shortHash(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:8])
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
