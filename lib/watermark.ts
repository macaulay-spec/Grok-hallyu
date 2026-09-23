/**
 * Pure, dependency-light image compositor that burns the Hallyu mark into a JPEG's pixels.
 *
 * It has no React Native imports so it runs identically on-device and under `node` for tests
 * (scripts/test-watermark.mjs). The mark is a real alpha PNG; the photo is decoded with `jpeg-js`,
 * the two are alpha-composited, and the result is re-encoded as a high-quality JPEG — so the saved
 * file genuinely carries the mark (it survives download, share, and re-import).
 *
 * The brand mark is sized to ~30% of the frame width and tucked into the lower-right corner with a
 * small margin — present but never in the way.
 */
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';

export interface WatermarkResult {
  /** JPEG bytes with the mark burned in. */
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Decode a PNG watermark once and cache the decoded RGBA (the asset is constant for the session). */
let cachedMark: { data: Uint8Array; width: number; height: number } | null = null;

export function setWatermarkSource(pngBytes: Uint8Array): void {
  const png = PNG.sync.read(Buffer.from(pngBytes));
  cachedMark = { data: new Uint8Array(png.data), width: png.width, height: png.height };
}

export function hasWatermarkSource(): boolean {
  return cachedMark !== null;
}

/**
 * Alpha-composite the mark over `photo` (RGBA). Writes into `photo` in place.
 */
export function composite(photo: Uint8Array, pw: number, ph: number, mark: { data: Uint8Array; width: number; height: number }, ratio = 0.3, marginRatio = 0.02): void {
  const mw0 = Math.round(pw * ratio);
  const scale = mw0 / mark.width;
  const mw = mw0;
  const mh = Math.round(mark.height * scale);
  const margin = Math.round(Math.min(pw, ph) * marginRatio);
  const ox = pw - mw - margin; // origin x
  const oy = ph - mh - margin; // origin y
  if (mw <= 0 || mh <= 0) return;

  for (let y = 0; y < mh; y++) {
    const py = oy + y;
    if (py < 0 || py >= ph) continue;
    const sy = Math.min(mark.height - 1, Math.floor(y / scale));
    for (let x = 0; x < mw; x++) {
      const px = ox + x;
      if (px < 0 || px >= pw) continue;
      const sx = Math.min(mark.width - 1, Math.floor(x / scale));
      const si = (sy * mark.width + sx) * 4;
      const a = mark.data[si + 3] / 255;
      if (a === 0) continue;
      const di = (py * pw + px) * 4;
      // source-over blend, premultiplied on the fly
      photo[di] = Math.round(mark.data[si] * a + photo[di] * (1 - a));
      photo[di + 1] = Math.round(mark.data[si + 1] * a + photo[di + 1] * (1 - a));
      photo[di + 2] = Math.round(mark.data[si + 2] * a + photo[di + 2] * (1 - a));
      photo[di + 3] = 255;
    }
  }
}

/**
 * Burn the mark into a JPEG. Returns null (rather than a fake) when the mark asset or the decoder
 * is unavailable, so callers can fall back without pretending.
 */
export function burnIntoJpeg(jpegBytes: Uint8Array, quality = 0.92): WatermarkResult | null {
  const mark = cachedMark;
  if (!mark) return null;
  try {
    const dec = jpeg.decode(Buffer.from(jpegBytes), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
    const data = new Uint8Array(dec.data);
    composite(data, dec.width, dec.height, mark);
    const enc = jpeg.encode({ data: Buffer.from(data), width: dec.width, height: dec.height }, Math.round(quality * 100));
    return { bytes: new Uint8Array(enc.data), width: dec.width, height: dec.height };
  } catch {
    return null;
  }
}
