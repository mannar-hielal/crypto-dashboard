/**
 * Screenshots for a bug report: the reporter picks the image files, and each is shrunk in the browser
 * before it goes (the server takes about 1 MB an image, three at most). Chosen by the reporter, so
 * nothing is captured behind their back.
 */

import type { BugReportScreenshot } from '@crypto-dashboard/sdk';

export const MAX_SCREENSHOTS = 3;
/** A picked file larger than this is refused before any work is done on it */
export const MAX_PICKED_BYTES = 20 * 1024 * 1024;
/** What the server accepts decoded: its cap is 1.1 MB, this stays under it */
export const TARGET_BYTES = 950 * 1024;
const LONG_SIDE = [1600, 1280, 1000, 800] as const;
const QUALITY = [0.82, 0.7, 0.58] as const;
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp']);
/**
 * 🔐 A small file can hold a picture of billions of pixels (a "decompression bomb") that fills the
 * memory of the tab when it is opened. A PNG's size is read from its header before anything is decoded,
 * and every image is checked again once it is. 100 megapixels is far above any screenshot.
 */
export const MAX_PIXELS = 100_000_000;

export class ScreenshotError extends Error {}

/** The size an image is drawn at: its long side at most `max`, the shape kept, never enlarged */
export function fitSize(width: number, height: number, max: number): { w: number; h: number } {
  const long = Math.max(width, height);
  if (long <= max) return { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) };
  const k = max / long;
  return { w: Math.max(1, Math.round(width * k)), h: Math.max(1, Math.round(height * k)) };
}

/** The base64 of a blob, without the "data:...;base64," front the server does not want */
async function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      resolve(text.slice(text.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new ScreenshotError('Could not read that image.'));
    reader.readAsDataURL(blob);
  });
}

const canvasBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** The first bytes of a file, without reading the rest */
function readHead(file: File, length: number): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => resolve(new Uint8Array(0));
    reader.readAsArrayBuffer(file.slice(0, length));
  });
}

/** A PNG's declared size from its header (its IHDR chunk), or null when it is not one */
export function pngPixels(head: Uint8Array): number | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length < 24 || sig.some((b, i) => head[i] !== b)) return null;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  return view.getUint32(16) * view.getUint32(20);
}

/** One picked file, as the shrunken JPEG the server takes. Throws a `ScreenshotError` with words for the reporter. */
export async function prepareScreenshot(file: File): Promise<BugReportScreenshot> {
  if (!ACCEPTED.has(file.type)) throw new ScreenshotError('Use a PNG, JPEG or WebP image.');
  if (file.size > MAX_PICKED_BYTES)
    throw new ScreenshotError('That image is too large (20 MB at most).');

  const declared = pngPixels(await readHead(file, 24));
  if (declared !== null && declared > MAX_PIXELS) {
    throw new ScreenshotError('That image is too large (too many pixels).');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ScreenshotError('Could not open that image.');
  }
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new ScreenshotError('That image is too large (too many pixels).');
    }
    for (const side of LONG_SIDE) {
      const { w, h } = fitSize(bitmap.width, bitmap.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ScreenshotError('Could not process that image.');
      // JPEG has no transparency: a screenshot with some would turn black
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const q of QUALITY) {
        const blob = await canvasBlob(canvas, q);
        if (blob && blob.size <= TARGET_BYTES) {
          const base =
            file.name
              .replace(/\.[^.]*$/, '')
              .replace(/[^\w.-]+/g, '-')
              .slice(0, 60) || 'screenshot';
          return { name: `${base}.jpg`, type: 'image/jpeg', data: await toBase64(blob) };
        }
      }
    }
  } finally {
    bitmap.close?.();
  }
  throw new ScreenshotError('Could not make that image small enough. Try a smaller one.');
}
