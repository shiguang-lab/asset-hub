package platform

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Config struct {
	Port        string
	ObjectRoot  string
	InternalTok string
	APIBase     string
	HTTPClient  *http.Client
}

func LoadConfig() Config {
	port := os.Getenv("COMPUTE_PORT")
	if port == "" {
		port = "3002"
	}
	root := os.Getenv("OBJECT_STORE_DIR")
	if root == "" {
		root = ".data/objects"
	}
	tok := os.Getenv("COMPUTE_TOKEN")
	if tok == "" {
		tok = "dev-compute-token"
	}
	apiBase := strings.TrimRight(os.Getenv("API_INTERNAL_BASE"), "/")
	if apiBase == "" {
		apiBase = "http://localhost:3001"
	}
	return Config{
		Port:        port,
		ObjectRoot:  root,
		InternalTok: tok,
		APIBase:     apiBase,
		HTTPClient:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (c Config) FetchObject(key string) ([]byte, error) {
	query := url.Values{}
	query.Set("key", key)
	req, err := http.NewRequest(http.MethodGet, c.APIBase+"/internal/v1/objects?"+query.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Internal-Token", c.InternalTok)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("object API returned status %d", resp.StatusCode)
	}
	contents, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, err
	}
	return contents, nil
}

func Authorize(w http.ResponseWriter, r *http.Request, cfg Config) bool {
	token := r.Header.Get("X-Internal-Token")
	if token == "" || token != cfg.InternalTok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":"UNAUTHORIZED"}`))
		return false
	}
	return true
}
