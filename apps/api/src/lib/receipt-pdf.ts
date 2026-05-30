/**
 * Payment receipt PDF (SRS FR-6.4) — A6-ish, card-motif styling.
 * Pure-JS (pdf-lib), runs on Workers.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const TEAL = rgb(0x0e / 255, 0x76 / 255, 0x6a / 255);
const AMBER = rgb(0xe0 / 255, 0xa4 / 255, 0x22 / 255);
const INK = rgb(0x19 / 255, 0x21 / 255, 0x1f / 255);
const GRAY = rgb(0x58 / 255, 0x64 / 255, 0x60 / 255);
const BORDER = rgb(0xe7 / 255, 0xe3 / 255, 0xda / 255);

export interface ReceiptData {
  orgName: string;
  receiptNo: string;
  paidAt: string; // ISO
  studentName: string;
  regNo: string;
  className: string;
  period: string;
  method: string;
  amountText: string; // formatted "5,000.00"
}

export async function buildReceiptPdf(d: ReceiptData): Promise<Uint8Array> {
  const W = 360;
  const H = 480;
  const doc = await PDFDocument.create();
  const page = doc.addPage([W, H]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 0.5, y: 0.5, width: W - 1, height: H - 1, borderColor: BORDER, borderWidth: 1 });
  // top brand band
  page.drawRectangle({ x: 0, y: H - 64, width: W, height: 64, color: TEAL });
  // glyph
  page.drawRectangle({ x: 24, y: H - 48, width: 26, height: 26, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 28, y: H - 32, width: 18, height: 3.5, color: AMBER });
  page.drawText(d.orgName, { x: 60, y: H - 34, size: 14, font: bold, color: rgb(1, 1, 1) });
  page.drawText("PAYMENT RECEIPT", { x: 60, y: H - 50, size: 8, font: bold, color: rgb(0.85, 0.93, 0.91) });

  let y = H - 96;
  const line = (label: string, value: string, valueBold = false) => {
    page.drawText(label, { x: 24, y, size: 9.5, font: reg, color: GRAY });
    page.drawText(value, { x: 150, y, size: 10.5, font: valueBold ? bold : reg, color: INK });
    y -= 26;
  };

  line("Receipt no", d.receiptNo, true);
  line("Date", new Date(d.paidAt).toISOString().slice(0, 10));
  y -= 6;
  page.drawLine({ start: { x: 24, y: y + 14 }, end: { x: W - 24, y: y + 14 }, color: BORDER, thickness: 1 });
  y -= 6;
  line("Student", d.studentName, true);
  line("Reg no", d.regNo);
  line("Class", d.className);
  line("Period", d.period);
  line("Method", d.method);

  y -= 8;
  page.drawRectangle({ x: 24, y: y - 30, width: W - 48, height: 48, color: rgb(0.93, 0.96, 0.95) });
  page.drawText("Amount paid", { x: 36, y: y - 2, size: 10, font: reg, color: GRAY });
  page.drawText(`LKR ${d.amountText}`, { x: 36, y: y - 20, size: 18, font: bold, color: TEAL });

  page.drawText("Thank you. This is a computer-generated receipt.", {
    x: 24,
    y: 28,
    size: 8,
    font: reg,
    color: GRAY,
  });

  return doc.save();
}
