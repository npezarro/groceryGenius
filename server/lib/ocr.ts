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

/** Run tesseract on an image buffer and return extracted text. */
export async function ocrImage(image: Buffer): Promise<string> {
  if (image.length === 0) throw new OCRUnavailableError("Empty image");
  const path = join(tmpdir(), `receipt-${randomUUID()}`);
  const imgPath = `${path}.png`;
  await writeFile(imgPath, image);

  try {
    return await new Promise<string>((resolve, reject) => {
      // `tesseract <img> stdout` prints recognized text to stdout
      const proc = spawn("tesseract", [imgPath, "stdout", "--psm", "6"], {
        timeout: 60_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      proc.stdout.on("data", (d) => { out += d.toString(); });
      proc.stderr.on("data", (d) => { err += d.toString(); });
      proc.on("error", (e) => {
        reject(new OCRUnavailableError(`tesseract not available: ${e.message}`));
      });
      proc.on("close", (code) => {
        if (code !== 0 && !out.trim()) {
          reject(new OCRUnavailableError(`tesseract failed: ${err.slice(0, 200)}`));
        } else {
          resolve(out.trim());
        }
      });
    });
  } finally {
    unlink(imgPath).catch(() => {});
  }
}

/** Decode base64 image data and OCR it in one step. */
export async function ocrBase64(imageData: string): Promise<string> {
  return ocrImage(decodeImageData(imageData));
}
