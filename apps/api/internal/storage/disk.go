package storage

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// diskStore persists objects under a base directory, with the content type kept
// in a small sidecar file next to each object.
type diskStore struct{ base string }

func newDisk(base string) (Store, error) {
	if err := os.MkdirAll(base, 0o755); err != nil {
		return nil, err
	}
	return &diskStore{base: base}, nil
}

// path maps an object key to a safe on-disk path (no traversal).
func (d *diskStore) path(key string) string {
	clean := filepath.Clean("/" + strings.ReplaceAll(key, "..", ""))
	return filepath.Join(d.base, filepath.FromSlash(clean))
}

func (d *diskStore) Put(_ context.Context, key string, body []byte, contentType string) error {
	p := d.path(key)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(p, body, 0o644); err != nil {
		return err
	}
	return os.WriteFile(p+".ct", []byte(contentType), 0o644)
}

func (d *diskStore) Get(_ context.Context, key string) (*Object, error) {
	p := d.path(key)
	body, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	ct, _ := os.ReadFile(p + ".ct")
	contentType := string(ct)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return &Object{Body: body, ContentType: contentType}, nil
}

func (d *diskStore) Delete(_ context.Context, key string) error {
	p := d.path(key)
	err := os.Remove(p)
	_ = os.Remove(p + ".ct")
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
