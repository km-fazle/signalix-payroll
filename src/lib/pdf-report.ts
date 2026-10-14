import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Line = { text: string; bold?: boolean; size?: number };

function ascii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

export async function hoursPdf(title: string, lines: Line[]) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 744;

  function ensure(height: number) {
    if (y - height < 48) {
      page = doc.addPage([612, 792]);
      y = 744;
    }
  }

  for (const line of [{ text: title, bold: true, size: 16 }, ...lines]) {
    const size = line.size ?? 11;
    const font = line.bold ? bold : regular;
    const text = ascii(line.text) || " ";
    const width = 516;
    const words = text.split(" ");
    let current = "";
    const wrapped: string[] = [];
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && current) {
        wrapped.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) wrapped.push(current);
    for (const row of wrapped) {
      ensure(size + 5);
      page.drawText(row, { x: 48, y, size, font, color: rgb(0, 0, 0) });
      y -= size + 5;
    }
    y -= 2;
  }

  return Buffer.from(await doc.save());
}
