package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/shiguang-lab/asset-hub/apps/compute-worker/internal/data"
	"github.com/shiguang-lab/asset-hub/apps/compute-worker/internal/platform"
)

type processRequest struct {
	Format    string `json:"format"`
	Content   string `json:"content"`
	FileName  string `json:"fileName"`
	ChunkSize int    `json:"chunkSize,omitempty"`
}

type processResponse struct {
	Normalized string         `json:"normalized"`
	PlainText  string         `json:"plainText"`
	Chunks     []data.Chunk   `json:"chunks"`
	Warnings   []string       `json:"warnings"`
	Usage      map[string]any `json:"usage"`
}

type queryRequest struct {
	DatasetVersionID string        `json:"datasetVersionId"`
	DataKey          string        `json:"dataKey"`
	Select           []string      `json:"select"`
	Filters          []data.Filter `json:"filters"`
	Sort             []data.Sort   `json:"sort"`
	GroupBy          []string      `json:"groupBy"`
	Aggregations     []data.Agg    `json:"aggregations"`
	Limit            int           `json:"limit"`
	Offset           int           `json:"offset"`
}

func main() {
	cfg := platform.LoadConfig()
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"service": "compute-worker", "status": "ok"})
	})

	mux.HandleFunc("POST /internal/process", func(w http.ResponseWriter, r *http.Request) {
		if !platform.Authorize(w, r, cfg) {
			return
		}
		var req processRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
			return
		}
		format := req.Format
		if format == "" {
			format = detectFormat(req.FileName, req.Content)
		}
		normalized, plain, warnings := data.Normalize(req.Content, format)
		chunks := data.ChunkText(plain, req.ChunkSize)
		writeJSON(w, http.StatusOK, processResponse{
			Normalized: normalized,
			PlainText:  plain,
			Chunks:     chunks,
			Warnings:   warnings,
			Usage:      map[string]any{"bytes": len(req.Content), "chunks": len(chunks)},
		})
	})

	mux.HandleFunc("POST /internal/query", func(w http.ResponseWriter, r *http.Request) {
		if !platform.Authorize(w, r, cfg) {
			return
		}
		var req queryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_QUERY", err.Error())
			return
		}
		if req.DataKey == "" {
			writeError(w, http.StatusBadRequest, "INVALID_QUERY", "dataKey required")
			return
		}
		started := time.Now()
		contents, err := cfg.FetchObject(req.DataKey)
		if err != nil {
			writeError(w, http.StatusBadGateway, "OBJECT_STORE", err.Error())
			return
		}
		rows, err := data.ParseRows(contents)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
			return
		}
		result, err := data.ExecuteQuery(rows, req.Select, req.Filters, req.Sort, req.GroupBy, req.Aggregations, req.Limit, req.Offset)
		if err != nil {
			writeError(w, http.StatusBadRequest, "QUERY_PLAN", err.Error())
			return
		}
		result.ElapsedMs = time.Since(started).Milliseconds()
		writeJSON(w, http.StatusOK, result)
	})

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("compute-worker ready", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("compute-worker failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
	slog.Info("compute-worker stopped")
}

func detectFormat(fileName, content string) string {
	switch {
	case fileName != "" && hasSuffix(fileName, ".html"):
		return "html"
	case fileName != "" && hasSuffix(fileName, ".json"):
		return "json"
	case content != "" && len(content) > 4 && (content[0] == '{' || content[0] == '['):
		return "json"
	case fileName != "" && hasSuffix(fileName, ".tsv"):
		return "tsv"
	default:
		return "markdown"
	}
}

func hasSuffix(s, suffix string) bool {
	return len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, detail string) {
	writeJSON(w, status, map[string]string{"code": code, "detail": detail})
}
