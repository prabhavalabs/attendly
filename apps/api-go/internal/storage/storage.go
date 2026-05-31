// Package storage abstracts object storage for uploads and generated PDFs.
// Production uses Cloudflare R2 (S3-compatible); when R2 is unconfigured the
// server falls back to local disk so development stays self-contained.
package storage

import (
	"context"
	"errors"

	"attendly/api/internal/config"
)

// ErrNotFound is returned by Get/Delete when the key does not exist.
var ErrNotFound = errors.New("object_not_found")

// Object is a stored blob with its content type.
type Object struct {
	Body        []byte
	ContentType string
}

// Store is the minimal object-storage contract used by the app.
type Store interface {
	Put(ctx context.Context, key string, body []byte, contentType string) error
	Get(ctx context.Context, key string) (*Object, error)
	Delete(ctx context.Context, key string) error
}

// New returns an R2-backed store when configured, else a disk-backed one.
func New(cfg config.Config) (Store, error) {
	if cfg.R2.Enabled() {
		return newR2(cfg.R2)
	}
	return newDisk(cfg.AssetsDir)
}
