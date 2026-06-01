package classes

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

func (h *Handlers) listTimetable(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireClass(r.Context(), id); err != nil {
		return err
	}
	tt, err := h.timetable(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"timetable": tt})
	return nil
}

func (h *Handlers) addTimetable(w http.ResponseWriter, r *http.Request) error {
	classID := chi.URLParam(r, "id")
	if err := h.requireClass(r.Context(), classID); err != nil {
		return err
	}
	var in struct {
		Weekday   int     `json:"weekday"`
		StartTime string  `json:"start_time"`
		EndTime   string  `json:"end_time"`
		Room      *string `json:"room"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if in.Weekday < 0 || in.Weekday > 6 || in.StartTime == "" || in.EndTime == "" {
		return httpapi.BadRequest("invalid_body")
	}
	if _, err := h.db.ExecContext(r.Context(),
		`INSERT INTO timetable_slots (id, class_id, weekday, start_time, end_time, room, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		cryptox.NewID("tts"), classID, in.Weekday, in.StartTime, in.EndTime, in.Room, cryptox.NowISO()); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "timetable.add", EntityType: sp("class"), EntityID: &classID})
	tt, err := h.timetable(r.Context(), classID)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusCreated, map[string]any{"timetable": tt})
	return nil
}

func (h *Handlers) removeTimetable(w http.ResponseWriter, r *http.Request) error {
	classID, slotID := chi.URLParam(r, "id"), chi.URLParam(r, "slotId")
	if _, err := h.db.ExecContext(r.Context(), `DELETE FROM timetable_slots WHERE id = ? AND class_id = ?`, slotID, classID); err != nil {
		return err
	}
	tt, err := h.timetable(r.Context(), classID)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"timetable": tt})
	return nil
}
