/**
 * Receipt OCR via the system `tesseract` binary.
 *
 * The alt-account Claude bridge is text-only, so receipt photos are turned into
 * text here first; the model then structures that text (see parseReceiptText).
 * Requires `tesseract-ocr` installed on the host (apt-get install tesseract-ocr).
 */

import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export class OCRUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OCRUnavailableError";
  }
}

/** Strip a data-URL prefix and decode base64 image data to a Buffer. */
export function decodeImageData(imageData: string): Buffer {
  const comma = imageData.indexOf(",");
  const b64 = imageData.startsWith("data:") && comma !== -1
    ? imageData.slice(comma + 1)
    : imageData;
  return Buffer.from(b64, "base64");
}

/** Run a command, resolving stdout. Rejects on spawn error; tolerates nonzero. */
function run(cmd: string, args: string[], timeout = 60_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (e) => reject(new OCRUnavailableError(`${cmd} not available: ${e.message}`)));
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Detect upright rotation via tesseract OSD. Returns degrees to rotate CW (0/90/180/270). */
async function detectRotation(imgPath: string): Promise<number> {
  try {
    const { stdout } = await run("tesseract", [imgPath, "stdout", "--psm", "0"], 30_000);
    const rot = stdout.match(/Rotate:\s*(\d+)/);
    const conf = stdout.match(/Orientation confidence:\s*([\d.]+)/);
    const angle = rot ? parseInt(rot[1], 10) : 0;
    const confidence = conf ? parseFloat(conf[1]) : 0;
    // Only trust a rotation when OSD is reasonably confident.
    return [90, 180, 270].includes(angle) && confidence >= 1.0 ? angle : 0;
  } catch {
    return 0;
  }
}

/**
 * Run tesseract on an image buffer and return extracted text.
 * Phone-photo receipts are often rotated, so we EXIF-auto-orient and apply
 * OSD-detected rotation before OCR (requires ImageMagick `convert`).
 */
export async function ocrImage(image: Buffer): Promise<string> {
  if (image.length === 0) throw new OCRUnavailableError("Empty image");
  const base = join(tmpdir(), `receipt-${randomUUID()}`);
  const imgPath = `${base}.png`;
  const orientPath = `${base}-o.png`;
  await writeFile(imgPath, image);
  const cleanup = [imgPath, orientPath];

  try {
    // EXIF auto-orient (cheap; no-op if no EXIF). Fall back to original if convert missing.
    let ocrTarget = imgPath;
    const conv = await run("convert", [imgPath, "-auto-orient", orientPath]).catch(() => null);
    if (conv && conv.code === 0) ocrTarget = orientPath;

    // OSD rotation for pixel-rotated photos.
    const angle = await detectRotation(ocrTarget);
    if (angle !== 0) {
      const rotPath = `${base}-r.png`;
      cleanup.push(rotPath);
      const r = await run("convert", [ocrTarget, "-rotate", String(angle), rotPath]).catch(() => null);
      if (r && r.code === 0) ocrTarget = rotPath;
    }

    // Final OCR. psm 4 = single column of variable-size text (typical receipt).
    const { code, stdout, stderr } = await run("tesseract", [ocrTarget, "stdout", "--psm", "4"]);
    if (code !== 0 && !stdout.trim()) {
      throw new OCRUnavailableError(`tesseract failed: ${stderr.slice(0, 200)}`);
    }
    return stdout.trim();
  } finally {
    for (const p of cleanup) unlink(p).catch(() => {});
  }
}

/** Decode base64 image data and OCR it in one step. */
export async function ocrBase64(imageData: string): Promise<string> {
  return ocrImage(decodeImageData(imageData));
}
