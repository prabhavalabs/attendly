// Package pdfgen renders the printable PDFs (ID cards, receipts, invoices) as
// pure Go, so no external service or browser is required.
package pdfgen

import (
	"bytes"
	"fmt"

	"github.com/go-pdf/fpdf"
	"github.com/skip2/go-qrcode"
)

// CardData is the content of a student ID card.
type CardData struct {
	OrgName   string
	FullName  string
	RegNo     string
	Subtitle  string
	CardToken string
	Active    bool
}

// Card renders a credit-card-sized (85.6×54mm) branded ID card with a QR
// encoding the opaque card token.
func Card(d CardData) ([]byte, error) {
	qr, err := qrcode.Encode(d.CardToken, qrcode.Medium, 256)
	if err != nil {
		return nil, fmt.Errorf("encode qr: %w", err)
	}

	const W, H = 85.6, 54.0
	pdf := fpdf.NewCustom(&fpdf.InitType{UnitStr: "mm", Size: fpdf.SizeType{Wd: W, Ht: H}})
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddPage()

	// Teal card background.
	fill(pdf, colTeal)
	pdf.Rect(0, 0, W, H, "F")

	// Header: logo + org name + "STUDENT ID CARD".
	pdf.ImageOptions(logoName(pdf), 6, 5, 9, 9, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	text(pdf, colWhite)
	pdf.SetFont("Helvetica", "B", 11)
	pdf.SetXY(17.5, 5.0)
	pdf.CellFormat(62, 6, tr(pdf, d.OrgName), "", 0, "L", false, 0, "")
	text(pdf, tint(colTeal, 0.7))
	pdf.SetFont("Helvetica", "B", 6.5)
	pdf.SetXY(17.5, 11)
	pdf.CellFormat(62, 4, "STUDENT ID CARD", "", 0, "L", false, 0, "")

	// White content panel (echoes the card motif).
	fill(pdf, colWhite)
	pdf.RoundedRect(5, 17.5, 75.6, 31, 3.5, "1234", "F")

	// Name + amber accent + reg + class.
	text(pdf, colInk)
	pdf.SetFont("Helvetica", "B", 12.5)
	pdf.SetXY(9, 21.5)
	pdf.CellFormat(48, 6, tr(pdf, d.FullName), "", 0, "L", false, 0, "")
	fill(pdf, colAmber)
	pdf.Rect(9, 30, 16, 0.8, "F")
	text(pdf, colMuted)
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetXY(9, 31.5)
	pdf.CellFormat(48, 5, tr(pdf, d.RegNo), "", 0, "L", false, 0, "")
	if d.Subtitle != "" {
		pdf.SetXY(9, 36)
		pdf.CellFormat(48, 5, tr(pdf, d.Subtitle), "", 0, "L", false, 0, "")
	}

	// Status pill.
	if d.Active {
		pill(pdf, 9, 42, "ACTIVE", colOk)
	} else {
		pill(pdf, 9, 42, "INACTIVE", colBad)
	}

	// QR bottom-right inside the panel + caption.
	pdf.RegisterImageOptionsReader("qr", fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(qr))
	pdf.ImageOptions("qr", 61, 20.5, 17.5, 17.5, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	text(pdf, colMuted)
	pdf.SetFont("Helvetica", "", 5.5)
	pdf.SetXY(59.5, 38.3)
	pdf.CellFormat(20, 3, "Scan to check in", "", 0, "C", false, 0, "")

	// Footer wordmark on the teal.
	text(pdf, tint(colTeal, 0.75))
	pdf.SetFont("Helvetica", "B", 7)
	pdf.SetXY(6, 49.8)
	pdf.CellFormat(40, 4, "attendly", "", 0, "L", false, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("render pdf: %w", err)
	}
	return buf.Bytes(), nil
}
