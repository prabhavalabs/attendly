// Package config loads runtime configuration from the environment (and an
// optional .env file), mirroring the secrets/vars the Worker used.
package config

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Addr          string   // listen address, e.g. ":8787"
	DBPath        string   // path to the SQLite database file
	AssetsDir     string   // local fallback dir for objects when R2 is unset
	JWTSecret     string   // HS256 signing secret (must match existing tokens)
	EncryptionKey string   // AES-GCM key material for OAuth tokens at rest
	GoogleID      string   // Google OAuth client id (optional)
	GoogleSecret  string   // Google OAuth client secret (optional)
	SetupToken    string   // optional: allows re-running /api/setup
	CORSOrigins   []string // allowed browser origins
	R2            R2Config // object storage (uploads, PDFs)
}

// R2Config configures Cloudflare R2 via its S3-compatible API. When AccountID
// or the keys are empty, the server falls back to local-disk storage.
type R2Config struct {
	AccountID string
	AccessKey string
	SecretKey string
	Bucket    string
}

// Enabled reports whether R2 is fully configured.
func (r R2Config) Enabled() bool {
	return r.AccountID != "" && r.AccessKey != "" && r.SecretKey != "" && r.Bucket != ""
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

// Load reads .env (if present) then the environment.
func Load() Config {
	_ = godotenv.Load() // best-effort; real env always wins

	origins := []string{"http://localhost:5173", "http://127.0.0.1:5173"}
	if raw := os.Getenv("CORS_ORIGINS"); raw != "" {
		origins = origins[:0]
		for _, o := range strings.Split(raw, ",") {
			if t := strings.TrimSpace(o); t != "" {
				origins = append(origins, t)
			}
		}
	}

	return Config{
		Addr:          env("ADDR", ":8787"),
		DBPath:        env("DB_PATH", "./data/attendly.db"),
		AssetsDir:     env("ASSETS_DIR", "./data/assets"),
		JWTSecret:     os.Getenv("JWT_SECRET"),
		EncryptionKey: os.Getenv("ENCRYPTION_KEY"),
		GoogleID:      os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleSecret:  os.Getenv("GOOGLE_CLIENT_SECRET"),
		SetupToken:    os.Getenv("SETUP_TOKEN"),
		CORSOrigins:   origins,
		R2: R2Config{
			AccountID: os.Getenv("R2_ACCOUNT_ID"),
			AccessKey: os.Getenv("R2_ACCESS_KEY_ID"),
			SecretKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
			Bucket:    env("R2_BUCKET", "attendly-assets"),
		},
	}
}
