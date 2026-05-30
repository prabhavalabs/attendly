/**
 * Printable student ID card (SRS FR-2.7) — CR80 landscape PDF.
 * Pure-JS (pdf-lib + qrcode-generator), so it runs on Workers and in the browser.
 * The QR encodes only the opaque card_token (never PII).
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import qrcode from "qrcode-generator";

const TEAL = rgb(0x0e / 255, 0x76 / 255, 0x6a / 255);
const AMBER = rgb(0xe0 / 255, 0xa4 / 255, 0x22 / 255);
const INK = rgb(0x19 / 255, 0x21 / 255, 0x1f / 255);
const GRAY = rgb(0x74 / 255, 0x80 / 255, 0x7b / 255);
const BAD = rgb(0xc0 / 255, 0x39 / 255, 0x2b / 255);
const BORDER = rgb(0xe7 / 255, 0xe3 / 255, 0xda / 255);

export interface CardData {
  orgName: string;
  fullName: string;
  regNo: string;
  subtitle: string;
  cardToken: string;
  active: boolean;
}

/** Build the card as PDF bytes. CR80 (85.6×54mm) landscape at 72dpi. */
export async function buildCardPdf(d: CardData): Promise<Uint8Array> {
  const W = 242.6;
  const H = 153.0;
  const doc = await PDFDocument.create();
  const page = doc.addPage([W, H]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);

  // Surface + soft border + teal edge band (the card motif).
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 0.5, y: 0.5, width: W - 1, height: H - 1, borderColor: BORDER, borderWidth: 1 });
  page.drawRectangle({ x: 0, y: 0, width: 8, height: H, color: TEAL });

  const padL = 20;

  // Header: org + STUDENT ID.
  page.drawText(d.orgName, { x: padL, y: H - 26, size: 11, font: bold, color: INK });
  page.drawText("STUDENT ID", { x: padL, y: H - 37, size: 6.5, font: bold, color: GRAY });

  // Brand glyph (top-right): teal tile with amber + white bands.
  const gx = W - 36;
  const gy = H - 32;
  page.drawRectangle({ x: gx, y: gy, width: 22, height: 22, color: TEAL });
  page.drawRectangle({ x: gx + 4, y: gy + 12, width: 14, height: 3, color: AMBER });
  page.drawRectangle({ x: gx + 4, y: gy + 5, width: 14, height: 4.5, color: rgb(1, 1, 1) });

  // Identity.
  page.drawText(d.fullName.slice(0, 28), { x: padL, y: H - 74, size: 15, font: bold, color: INK });
  page.drawText(`${d.regNo}  ·  ${d.subtitle}`, { x: padL, y: H - 88, size: 9, font: reg, color: GRAY });

  // Status line.
  page.drawText(d.active ? "Card active" : "Card not valid", {
    x: padL,
    y: 18,
    size: 8,
    font: bold,
    color: d.active ? TEAL : BAD,
  });

  // QR (bottom-right) of the opaque card token.
  const qr = qrcode(0, "M");
  qr.addData(d.cardToken);
  qr.make();
  const count = qr.getModuleCount();
  const qrSize = 60;
  const qx = W - qrSize - 16;
  const qy = 14;
  const cell = qrSize / count;
  page.drawRectangle({ x: qx - 4, y: qy - 4, width: qrSize + 8, height: qrSize + 8, color: rgb(1, 1, 1) });
  for (let r = 0; r < count; r++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(r, col)) {
        page.drawRectangle({
          x: qx + col * cell,
          y: qy + (count - 1 - r) * cell,
          width: cell + 0.3,
          height: cell + 0.3,
          color: INK,
        });
      }
    }
  }

  return doc.save();
}
