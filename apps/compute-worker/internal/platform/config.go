package platform

import (
	"net/http"
	"os"
)

type Config struct {
	Port        string
	ObjectRoot  string
	InternalTok string
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
	return Config{Port: port, ObjectRoot: root, InternalTok: tok}
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
