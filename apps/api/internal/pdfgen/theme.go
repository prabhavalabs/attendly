package pdfgen

import (
	"bytes"
	_ "embed"

	"github.com/go-pdf/fpdf"
)

// Embedded brand mark (the Attendly app icon) used as the logo on every PDF.
//
//go:embed assets/logo.png
var logoPNG []byte

// Brand palette (RGB), mirroring the admin design tokens.
var (
	colTeal   = rgb{14, 118, 106}  // --brand-600
	colTealDk = rgb{10, 79, 71}    // deep teal
	colAmber  = rgb{245, 158, 11}  // roster band
	colInk    = rgb{15, 23, 42}    // primary text
	colMuted  = rgb{100, 116, 139} // secondary text
	colOk     = rgb{22, 163, 74}
	colBad    = rgb{220, 38, 38}
	colWarn   = rgb{180, 121, 10}
	colBorder = rgb{226, 232, 240}
	colWash   = rgb{244, 247, 246} // faint panel fill
	colWhite  = rgb{255, 255, 255}
)

type rgb struct{ r, g, b int }

func fill(pdf *fpdf.Fpdf, c rgb) { pdf.SetFillColor(c.r, c.g, c.b) }
func text(pdf *fpdf.Fpdf, c rgb) { pdf.SetTextColor(c.r, c.g, c.b) }
func draw(pdf *fpdf.Fpdf, c rgb) { pdf.SetDrawColor(c.r, c.g, c.b) }

// logoName registers the embedded logo (idempotent per document) and returns
// the image name to pass to ImageOptions.
func logoName(pdf *fpdf.Fpdf) string {
	const name = "attendly-logo"
	if pdf.GetImageInfo(name) == nil {
		pdf.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(logoPNG))
	}
	return name
}

// tr transliterates UTF-8 to the core font encoding (cp1252) to avoid mojibake.
func tr(pdf *fpdf.Fpdf, s string) string {
	return pdf.UnicodeTranslatorFromDescriptor("")(s)
}

// statusColor maps an invoice/card status to its accent colour.
func statusColor(status string) rgb {
	switch status {
	case "paid", "active":
		return colOk
	case "overdue", "inactive", "revoked", "failed":
		return colBad
	case "partial", "pending", "queued":
		return colWarn
	default:
		return colMuted
	}
}

// pill draws a small rounded status chip with a leading dot and uppercase label.
func pill(pdf *fpdf.Fpdf, x, y float64, label string, c rgb) {
	pdf.SetFont("Helvetica", "B", 7)
	w := pdf.GetStringWidth(label) + 8
	fill(pdf, tint(c, 0.85))
	pdf.RoundedRect(x, y, w, 5, 2.5, "1234", "F")
	fill(pdf, c)
	pdf.Circle(x+3, y+2.5, 1, "F")
	text(pdf, c)
	pdf.SetXY(x+5, y)
	pdf.CellFormat(w-5, 5, label, "", 0, "L", false, 0, "")
}

// tint mixes a colour toward white by the given amount (0..1).
func tint(c rgb, amt float64) rgb {
	mix := func(v int) int { return int(float64(v) + (255-float64(v))*amt) }
	return rgb{mix(c.r), mix(c.g), mix(c.b)}
}
