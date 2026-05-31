// Package httpapi holds HTTP plumbing shared by all route groups: JSON
// responses, the standard error envelope, and an error-returning handler
// adapter so handlers can `return err` instead of writing responses by hand.
package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

// APIError is a handler error that maps to an HTTP status and the standard
// envelope: {"error": <code>, "details"?: <any>}.
type APIError struct {
	Status  int
	Code    string
	Details any
}

func (e *APIError) Error() string { return e.Code }

// Err builds an APIError with a status and machine-readable code.
func Err(status int, code string) *APIError { return &APIError{Status: status, Code: code} }

// ErrWithDetails attaches structured details (e.g. validation issues).
func ErrWithDetails(status int, code string, details any) *APIError {
	return &APIError{Status: status, Code: code, Details: details}
}

// Common shortcuts.
func BadRequest(code string) *APIError   { return Err(http.StatusBadRequest, code) }
func Unauthorized(code string) *APIError { return Err(http.StatusUnauthorized, code) }
func Forbidden(code string) *APIError    { return Err(http.StatusForbidden, code) }
func NotFound(code string) *APIError     { return Err(http.StatusNotFound, code) }
func Conflict(code string) *APIError     { return Err(http.StatusConflict, code) }

// JSON writes v as a JSON response with the given status.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		if err := json.NewEncoder(w).Encode(v); err != nil {
			slog.Error("encode response", "err", err)
		}
	}
}

// Handler is an http.Handler whose logic returns an error; the adapter maps it
// to the proper status + envelope. Non-APIError values become 500.
type Handler func(w http.ResponseWriter, r *http.Request) error

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := h(w, r); err != nil {
		writeError(w, err)
	}
}

func writeError(w http.ResponseWriter, err error) {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		body := map[string]any{"error": apiErr.Code}
		if apiErr.Details != nil {
			body["details"] = apiErr.Details
		}
		JSON(w, apiErr.Status, body)
		return
	}
	slog.Error("unhandled error", "err", err)
	JSON(w, http.StatusInternalServerError, map[string]any{"error": "internal_error"})
}
