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
	AssetsDir     string   // directory for generated PDFs / uploads (R2 replacement)
	JWTSecret     string   // HS256 signing secret (must match existing tokens)
	EncryptionKey string   // AES-GCM key material for OAuth tokens at rest
	GoogleID      string   // Google OAuth client id (optional)
	GoogleSecret  string   // Google OAuth client secret (optional)
	SetupToken    string   // optional: allows re-running /api/setup
	CORSOrigins   []string // allowed browser origins
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
	}
}
