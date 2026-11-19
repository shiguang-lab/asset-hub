package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/shiguang-lab/asset-hub/apps/render-worker/internal/browser"
	"github.com/shiguang-lab/asset-hub/apps/render-worker/internal/platform"
	"github.com/shiguang-lab/asset-hub/apps/render-worker/internal/presentation"
)

type thumbnailRequest struct {
	Mode    string `json:"mode"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe local /healthz and exit")
	flag.Parse()

	cfg := platform.LoadConfig()
	if *healthcheck {
		resp, err := (&http.Client{Timeout: 3 * time.Second}).Get(fmt.Sprintf("http://127.0.0.1:%s/healthz", cfg.Port))
		if err != nil || resp.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		os.Exit(0)
	}
	mgr := browser.NewManager(cfg)
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"service": "render-worker",
			"status":  "ok",
		})
	})

	mux.HandleFunc("POST /internal/render/thumbnail", func(w http.ResponseWriter, r *http.Request) {
		if !platform.Authorize(w, r, cfg) {
			return
		}
		var req thumbnailRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<20)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
			return
		}
		var (
			jpeg []byte
			err  error
		)
		switch req.Mode {
		case "markdown":
			jpeg, err = mgr.RenderMarkdownThumbnail(r.Context(), req.Title, req.Content)
		case "html":
			if req.Content == "" {
				writeError(w, http.StatusBadRequest, "INVALID_INPUT", "content required")
				return
			}
			jpeg, err = mgr.RenderHTMLThumbnail(r.Context(), req.Content)
		default:
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "mode must be markdown or html")
			return
		}
		if err != nil {
			slog.Warn("thumbnail render failed", "mode", req.Mode, "err", err)
			writeError(w, http.StatusBadGateway, "RENDER_FAILED", err.Error())
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(jpeg)
	})

	mux.HandleFunc("POST /internal/render/presentation", func(w http.ResponseWriter, r *http.Request) {
		if !platform.Authorize(w, r, cfg) {
			return
		}
		var req presentation.Request
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<20)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
			return
		}
		if req.HTML == "" {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "html required")
			return
		}
		res, err := mgr.RunPresentationStage(r.Context(), req)
		if err != nil {
			slog.Warn("presentation stage failed", "err", err)
			writeError(w, http.StatusBadGateway, "RENDER_FAILED", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, res)
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		mgr.Close()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutCtx)
	}()

	slog.Info("render-worker listening", "addr", srv.Addr, "chrome", cfg.ChromePath, "webBase", cfg.WebBase)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code, detail string) {
	writeJSON(w, status, map[string]string{"code": code, "detail": detail})
}
