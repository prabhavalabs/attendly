package pdfgen

import (
	"bytes"
	"fmt"

	"github.com/go-pdf/fpdf"
)

// ReceiptData is the content of a payment receipt.
type ReceiptData struct {
	OrgName     string
	ReceiptNo   string
	PaidAt      string
	StudentName string
	RegNo       string
	ClassName   string
	Period      string
	Method      string
	AmountText  string // formatted, e.g. "2500.00"
}

// Receipt renders an A6 payment receipt PDF.
func Receipt(d ReceiptData) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A6", "")
	pdf.SetMargins(10, 10, 10)
	pdf.AddPage()
	t := pdf.UnicodeTranslatorFromDescriptor("")

	pdf.SetFont("Helvetica", "B", 14)
	pdf.SetTextColor(15, 23, 42)
	pdf.CellFormat(0, 8, t(d.OrgName), "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(100, 116, 139)
	pdf.CellFormat(0, 5, "Payment Receipt", "", 1, "L", false, 0, "")
	pdf.Ln(2)
	pdf.SetDrawColor(226, 232, 240)
	y := pdf.GetY()
	pdf.Line(10, y, 95, y)
	pdf.Ln(3)

	row := func(label, value string) {
		pdf.SetFont("Helvetica", "", 8)
		pdf.SetTextColor(100, 116, 139)
		pdf.CellFormat(30, 6, label, "", 0, "L", false, 0, "")
		pdf.SetFont("Helvetica", "B", 9)
		pdf.SetTextColor(15, 23, 42)
		pdf.CellFormat(0, 6, t(value), "", 1, "L", false, 0, "")
	}
	row("Receipt No", d.ReceiptNo)
	row("Date", d.PaidAt)
	row("Student", fmt.Sprintf("%s (%s)", d.StudentName, d.RegNo))
	row("Class", d.ClassName)
	row("Period", d.Period)
	row("Method", d.Method)

	pdf.Ln(3)
	pdf.SetFont("Helvetica", "B", 13)
	pdf.SetTextColor(22, 163, 74)
	pdf.CellFormat(0, 9, "LKR "+d.AmountText, "", 1, "R", false, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("render receipt: %w", err)
	}
	return buf.Bytes(), nil
}
