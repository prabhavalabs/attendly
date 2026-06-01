package pdfgen

import (
	"bytes"
	"os"
	"testing"
)

// writeDebug dumps a rendered PDF when PDF_DEBUG_DIR is set (for visual review).
func writeDebug(name string, b []byte) {
	if dir := os.Getenv("PDF_DEBUG_DIR"); dir != "" {
		_ = os.WriteFile(dir+"/"+name, b, 0o644)
	}
}

func assertPDF(t *testing.T, b []byte, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !bytes.HasPrefix(b, []byte("%PDF")) {
		t.Fatalf("output is not a PDF (prefix %q)", b[:min(8, len(b))])
	}
	if len(b) < 1000 {
		t.Fatalf("PDF unexpectedly small: %d bytes", len(b))
	}
}

func TestCard(t *testing.T) {
	b, err := Card(CardData{
		OrgName:   "Bright Future Academy",
		FullName:  "Imasha Dissanayake",
		RegNo:     "2026-0101",
		Subtitle:  "A/L 2027 · Combined Maths",
		CardToken: "tok_3xQ9aZ7bL2mK8pR",
		Active:    true,
	})
	assertPDF(t, b, err)
	writeDebug("sample-card.pdf", b)
}

func TestReceipt(t *testing.T) {
	b, err := Receipt(ReceiptData{
		OrgName:     "Bright Future Academy",
		ReceiptNo:   "RC-202606-0042",
		PaidAt:      "2026-06-01",
		StudentName: "Imasha Dissanayake",
		RegNo:       "2026-0101",
		ClassName:   "Combined Maths — Grade 11",
		Period:      "2026-06",
		Method:      "Cash",
		AmountText:  "3,500.00",
	})
	assertPDF(t, b, err)
	writeDebug("sample-receipt.pdf", b)
}

func TestInvoice(t *testing.T) {
	b, err := Invoice(InvoiceData{
		OrgName:         "Bright Future Academy",
		InvoiceNo:       "INV-202606-0041",
		IssuedAt:        "2026-06-01",
		DueDate:         "2026-06-10",
		StudentName:     "Buddhika Wickramasinghe",
		RegNo:           "2026-0041",
		ClassName:       "ICT — 2027 A/L",
		Period:          "2026-06",
		Status:          "partial",
		AmountText:      "3,000.00",
		PaidText:        "1,500.00",
		OutstandingText: "1,500.00",
	})
	assertPDF(t, b, err)
	writeDebug("sample-invoice.pdf", b)
}
