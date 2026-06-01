package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
)

// Decode reads a JSON request body into dst, rejecting unknown fields (mirrors
// the Zod .strict() contracts) and bodies larger than 1 MiB.
func Decode(r *http.Request, dst any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return BadRequest("invalid_body")
	}
	return nil
}
