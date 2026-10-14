import sharp from "sharp";

export type StoredImage = {
  bytes: Buffer;
  mime: "image/png" | "image/jpeg" | "image/webp";
  ext: "png" | "jpg" | "webp";
};

function sniff(bytes: Buffer): StoredImage["mime"] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function reencode(bytes: Buffer, mime: StoredImage["mime"]): Promise<Buffer> {
  const image = sharp(bytes, { failOn: "none" }).rotate();
  if (mime === "image/png") return image.png().toBuffer();
  if (mime === "image/webp") return image.webp().toBuffer();
  return image.jpeg({ quality: 90 }).toBuffer();
}

export async function privateImage(bytes: Buffer): Promise<StoredImage | null> {
  const mime = sniff(bytes);
  if (mime) {
    const cleaned = await reencode(bytes, mime);
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    return { bytes: cleaned, mime, ext };
  }
  try {
    const jpeg = await sharp(bytes, { failOn: "none" }).rotate().jpeg({ quality: 90 }).toBuffer();
    if (sniff(jpeg) !== "image/jpeg") return null;
    return { bytes: jpeg, mime: "image/jpeg", ext: "jpg" };
  } catch {
    return null;
  }
}

export async function outboundImage(bytes: Buffer): Promise<StoredImage> {
  const reduced = await sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { bytes: reduced, mime: "image/jpeg", ext: "jpg" };
}
