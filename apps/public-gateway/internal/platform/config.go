package platform

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Config struct {
	Port         string
	APIBase      string
	SSRBaseURL   string
	AuthBaseURL  string
	GatewayToken string
	ObjectRoot   string
	HMACSecret   string
	HTTPClient   *http.Client
}

type DomainResolution struct {
	PublishID string `json:"publishId"`
	Slug      string `json:"slug"`
}

func LoadConfig() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3004"
	}
	apiBase := os.Getenv("API_INTERNAL_BASE")
	if apiBase == "" {
		apiBase = "http://localhost:3001"
	}
	ssrBaseURL := os.Getenv("SSR_BASE_URL")
	if ssrBaseURL == "" {
		ssrBaseURL = "http://localhost:3005"
	}
	// Unified auth origin. The published page proxies /api/auth/session here in
	// local development; in production the access-gateway routes that path to
	// auth-service directly, so this is effectively dev-only.
	authBaseURL := os.Getenv("AUTH_BASE_URL")
	if authBaseURL == "" {
		authBaseURL = "https://shiguanglab.com"
	}
	token := os.Getenv("PUBLIC_GATEWAY_TOKEN")
	if token == "" {
		token = "dev-gateway-token"
	}
	root := os.Getenv("OBJECT_STORE_DIR")
	if root == "" {
		root = ".data/objects"
	}
	secret := os.Getenv("PUBLISH_HMAC_SECRET")
	if secret == "" {
		secret = "dev-publish-secret"
	}
	return Config{
		Port:         port,
		APIBase:      apiBase,
		SSRBaseURL:   ssrBaseURL,
		AuthBaseURL:  authBaseURL,
		GatewayToken: token,
		ObjectRoot:   root,
		HMACSecret:   secret,
		HTTPClient:   &http.Client{Timeout: 5 * time.Second},
	}
}

func (c Config) CheckAPI() error {
	req, err := http.NewRequest(http.MethodGet, c.APIBase+"/healthz", nil)
	if err != nil {
		return err
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("api status %d", resp.StatusCode)
	}
	return nil
}

func (c Config) FetchMeta(slug string) (body []byte, status int, err error) {
	req, err := http.NewRequest(http.MethodGet, c.APIBase+"/internal/v1/publishes/"+slug, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("X-Internal-Token", c.GatewayToken)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err = io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, 0, err
	}
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return nil, resp.StatusCode, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("meta status %d", resp.StatusCode)
	}
	return body, http.StatusOK, nil
}

func (c Config) FetchReleaseFile(publishID, releaseID, path string) (body []byte, status int, err error) {
	query := url.Values{}
	query.Set("publishId", publishID)
	query.Set("releaseId", releaseID)
	query.Set("path", path)
	req, err := http.NewRequest(http.MethodGet, c.APIBase+"/internal/v1/release-files?"+query.Encode(), nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("X-Internal-Token", c.GatewayToken)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, nil
	}
	body, err = io.ReadAll(io.LimitReader(resp.Body, 256<<20))
	return body, resp.StatusCode, err
}

func (c Config) FetchPresentationContent(publishID, releaseID string) (body []byte, status int, err error) {
	query := url.Values{}
	query.Set("publishId", publishID)
	query.Set("releaseId", releaseID)
	req, err := http.NewRequest(http.MethodGet, c.APIBase+"/internal/v1/presentation-content?"+query.Encode(), nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("X-Internal-Token", c.GatewayToken)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err = io.ReadAll(io.LimitReader(resp.Body, 256<<20))
	if err != nil {
		return nil, 0, err
	}
	if resp.StatusCode != http.StatusOK {
		return body, resp.StatusCode, nil
	}
	return body, http.StatusOK, nil
}

type UnlockResult struct {
	Token     string `json:"token"`
	PublishID string
}

type PresenceResult struct {
	VisitorCount int              `json:"visitorCount"`
	Viewers      []map[string]any `json:"viewers"`
}

func (c Config) RecordPresence(payload any) (PresenceResult, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return PresenceResult{}, err
	}
	req, err := http.NewRequest(http.MethodPost, c.APIBase+"/internal/v1/presence", bytes.NewReader(body))
	if err != nil {
		return PresenceResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.GatewayToken)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return PresenceResult{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return PresenceResult{}, fmt.Errorf("presence status %d", resp.StatusCode)
	}
	var result PresenceResult
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result); err != nil {
		return PresenceResult{}, err
	}
	return result, nil
}

func (c Config) FetchComments(publishID, releaseID string) ([]map[string]any, error) {
	query := url.Values{}
	query.Set("publishId", publishID)
	if releaseID != "" {
		query.Set("releaseId", releaseID)
	}
	req, err := http.NewRequest(http.MethodGet, c.APIBase+"/internal/v1/comments?"+query.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Internal-Token", c.GatewayToken)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("comments status %d", resp.StatusCode)
	}
	var result struct {
		Comments []map[string]any `json:"comments"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result); err != nil {
		return nil, err
	}
	return result.Comments, nil
}

func (c Config) Unlock(slug, password string) (UnlockResult, error) {
	body := fmt.Sprintf(`{"password":%q}`, password)
	req, err := http.NewRequest(http.MethodPost, c.APIBase+"/internal/v1/publishes/"+slug+"/unlock", strings.NewReader(body))
	if err != nil {
		return UnlockResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.GatewayToken)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return UnlockResult{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return UnlockResult{}, err
	}
	if resp.StatusCode != http.StatusOK {
		return UnlockResult{}, fmt.Errorf("unlock failed: %s", string(data))
	}
	var parsed struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return UnlockResult{}, err
	}
	payload := strings.Split(parsed.Token, ".")[0]
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return UnlockResult{}, err
	}
	var claims struct {
		PublishID string `json:"publishId"`
	}
	_ = json.Unmarshal(raw, &claims)
	return UnlockResult{Token: parsed.Token, PublishID: claims.PublishID}, nil
}

func (c Config) VerifyToken(token string) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return false
	}
	payload := parts[0]
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return false
	}
	var claims struct {
		PublishID string `json:"publishId"`
		Exp       int64  `json:"exp"`
	}
	if err := json.Unmarshal(raw, &claims); err != nil {
		return false
	}
	if time.Now().UnixMilli() > claims.Exp {
		return false
	}
	mac := hmacSHA256(payload, c.HMACSecret)
	return mac == parts[1]
}

func (c Config) ResolveDomain(host string) (DomainResolution, error) {
	req, err := http.NewRequest(http.MethodGet, c.APIBase+"/internal/v1/domains/resolve?host="+host, nil)
	if err != nil {
		return DomainResolution{}, err
	}
	req.Header.Set("X-Internal-Token", c.GatewayToken)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return DomainResolution{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return DomainResolution{}, fmt.Errorf("domain resolve status %d", resp.StatusCode)
	}
	var resolution DomainResolution
	if err := json.NewDecoder(resp.Body).Decode(&resolution); err != nil {
		return DomainResolution{}, err
	}
	return resolution, nil
}

func hmacSHA256(payload, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
