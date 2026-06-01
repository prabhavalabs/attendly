// Package pdfgen renders the printable PDFs (ID cards, receipts) as pure Go, so
// no external service or browser is required.
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

// Card renders a credit-card-sized PDF with a QR encoding the opaque card token.
func Card(d CardData) ([]byte, error) {
	qr, err := qrcode.Encode(d.CardToken, qrcode.Medium, 256)
	if err != nil {
		return nil, fmt.Errorf("encode qr: %w", err)
	}

	pdf := fpdf.NewCustom(&fpdf.InitType{
		UnitStr: "mm",
		Size:    fpdf.SizeType{Wd: 85.6, Ht: 54},
	})
	pdf.SetMargins(6, 6, 6)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddPage()

	pdf.SetFont("Helvetica", "B", 11)
	pdf.SetTextColor(15, 23, 42)
	pdf.CellFormat(0, 6, tr(pdf, d.OrgName), "", 1, "L", false, 0, "")

	pdf.Ln(3)
	pdf.SetFont("Helvetica", "B", 13)
	pdf.CellFormat(48, 7, tr(pdf, d.FullName), "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(100, 116, 139)
	pdf.CellFormat(48, 5, tr(pdf, d.RegNo), "", 1, "L", false, 0, "")
	if d.Subtitle != "" {
		pdf.CellFormat(48, 5, tr(pdf, d.Subtitle), "", 1, "L", false, 0, "")
	}

	status := "ACTIVE"
	if !d.Active {
		status = "INACTIVE"
	}
	pdf.SetY(44)
	pdf.SetFont("Helvetica", "B", 8)
	if d.Active {
		pdf.SetTextColor(22, 163, 74)
	} else {
		pdf.SetTextColor(220, 38, 38)
	}
	pdf.CellFormat(48, 5, status, "", 0, "L", false, 0, "")

	// QR bottom-right. fpdf accumulates errors internally (surfaced at Output).
	pdf.RegisterImageOptionsReader("qr", fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(qr))
	pdf.ImageOptions("qr", 60, 19, 22, 22, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("render pdf: %w", err)
	}
	return buf.Bytes(), nil
}

// tr transliterates UTF-8 to the font's encoding (cp1252) to avoid mojibake.
func tr(pdf *fpdf.Fpdf, s string) string {
	return pdf.UnicodeTranslatorFromDescriptor("")(s)
}
