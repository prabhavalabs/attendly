// Command server is the attendly API: the same HTTP contract as the previous
// Cloudflare Worker, backed by local SQLite (microsecond reads) and built to
// run as a single static binary on a VPS.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"attendly/api/internal/auth"
	"attendly/api/internal/config"
	"attendly/api/internal/dashboard"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/settings"
	"attendly/api/internal/store"
	"attendly/api/migrations"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()

	for _, dir := range []string{filepath.Dir(cfg.DBPath), cfg.AssetsDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}

	db, err := store.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := store.Migrate(db, migrations.FS); err != nil {
		return err
	}

	authSvc := auth.New(db, cfg.JWTSecret, cfg.SetupToken)
	authH := auth.NewHandlers(authSvc)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(httpapi.RequestLogger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "x-d1-bookmark"},
		ExposedHeaders:   []string{"x-d1-bookmark"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true, "service": "tuition-api"})
	})

	r.Method(http.MethodPost, "/api/setup", httpapi.Handler(authH.SetupHandler))
	r.Route("/api/auth", func(r chi.Router) {
		authH.MountPublic(r)
		r.Group(func(r chi.Router) {
			r.Use(authSvc.Authenticate)
			authH.MountAuthed(r)
		})
	})

	// Authenticated domain endpoints.
	r.Group(func(r chi.Router) {
		r.Use(authSvc.Authenticate)
		settings.New(db).Mount(r)
		dashboard.New(db).Mount(r)
	})

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("listening", "addr", cfg.Addr, "db", cfg.DBPath)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("listen", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutCtx)
}
