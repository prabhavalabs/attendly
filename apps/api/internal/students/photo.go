package students

import (
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/storage"
	"attendly/api/internal/store"
)

const maxPhotoBytes = 5 << 20 // 5 MiB

var photoTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}

func photoKey(id string) string { return "students/" + id + "/photo" }

func (h *Handlers) uploadPhoto(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireStudent(r.Context(), id); err != nil {
		return err
	}
	ct := strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0])
	if !photoTypes[ct] {
		return httpapi.Err(http.StatusUnsupportedMediaType, "unsupported_media_type")
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxPhotoBytes+1))
	if err != nil {
		return err
	}
	if len(body) == 0 {
		return httpapi.BadRequest("empty_body")
	}
	if len(body) > maxPhotoBytes {
		return httpapi.Err(http.StatusRequestEntityTooLarge, "file_too_large")
	}
	if err := h.store.Put(r.Context(), photoKey(id), body, ct); err != nil {
		return err
	}
	photoURL := "/api/students/" + id + "/photo"
	if _, err := h.db.ExecContext(r.Context(), `UPDATE students SET photo_url = ?, updated_at = ? WHERE id = ?`, photoURL, cryptox.NowISO(), id); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "student.photo.upload", EntityType: sp("student"), EntityID: &id})
	row, err := h.detail(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) getPhoto(w http.ResponseWriter, r *http.Request) error {
	obj, err := h.store.Get(r.Context(), photoKey(chi.URLParam(r, "id")))
	if errors.Is(err, storage.ErrNotFound) {
		return httpapi.NotFound("not_found")
	}
	if err != nil {
		return err
	}
	ct := obj.ContentType
	if ct == "" {
		ct = "image/jpeg"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(obj.Body)
	return nil
}

func (h *Handlers) deletePhoto(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.store.Delete(r.Context(), photoKey(id)); err != nil {
		return err
	}
	if _, err := h.db.ExecContext(r.Context(), `UPDATE students SET photo_url = NULL, updated_at = ? WHERE id = ?`, cryptox.NowISO(), id); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "student.photo.remove", EntityType: sp("student"), EntityID: &id})
	row, err := h.detail(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}
