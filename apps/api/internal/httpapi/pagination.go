package httpapi

import (
	"net/http"
	"strconv"
)

// Page holds parsed pagination parameters (1-based page + computed limit/offset).
type Page struct {
	Page     int
	PageSize int
	Limit    int
	Offset   int
}

// ParsePage reads ?page and ?page_size (defaults 1 / 20, page_size capped at 100).
func ParsePage(r *http.Request) Page {
	page := clampAtoi(r.URL.Query().Get("page"), 1, 1, 1<<30)
	size := clampAtoi(r.URL.Query().Get("page_size"), 20, 1, 100)
	return Page{Page: page, PageSize: size, Limit: size, Offset: (page - 1) * size}
}

func clampAtoi(s string, def, min, max int) int {
	n, err := strconv.Atoi(s)
	if err != nil || n < min {
		return def
	}
	if n > max {
		return max
	}
	return n
}
