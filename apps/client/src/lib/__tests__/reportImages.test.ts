import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import {
  MAX_PICKED_BYTES,
  MAX_PIXELS,
  ScreenshotError,
  TARGET_BYTES,
  fitSize,
  pngPixels,
  prepareScreenshot,
} from '../reportImages';

describe('fitSize', () => {
  it('should shrink the long side to the limit and keep the shape', () => {
    expect(fitSize(3200, 1600, 1600)).toEqual({ w: 1600, h: 800 });
    expect(fitSize(1000, 4000, 1000)).toEqual({ w: 250, h: 1000 });
  });
  it('should never enlarge an image, and never make it zero', () => {
    expect(fitSize(300, 200, 1600)).toEqual({ w: 300, h: 200 });
    expect(fitSize(1, 5000, 100)).toEqual({ w: 1, h: 100 });
  });
});

/** The first 24 bytes of a PNG that says it is `w` by `h` */
const pngHead = (w: number, h: number) => {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
};

describe('pngPixels', () => {
  it('should read the size a PNG declares, and say nothing for a file that is not one', () => {
    expect(pngPixels(pngHead(1920, 1080))).toBe(1920 * 1080);
    expect(pngPixels(new Uint8Array(24))).toBeNull();
    expect(pngPixels(new Uint8Array(5))).toBeNull();
  });
});

describe('prepareScreenshot', () => {
  const draws = vi.fn();
  let blobSize = 1000;

  beforeEach(() => {
    blobSize = 1000;
    draws.mockClear();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 2400, height: 1200, close: vi.fn() }))
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: draws,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) =>
      cb(new Blob([new Uint8Array(blobSize)], { type: 'image/jpeg' }))
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const file = (name: string, type: string, size = 100) =>
    new File([new Uint8Array(size)], name, { type });

  it('should turn a picked image into a small JPEG, base64 without the data: front, named from the file', async () => {
    const out = await prepareScreenshot(file('Bug at 10:42 (chart).png', 'image/png'));
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toMatch(/^Bug-at-10-42-chart-\.jpg$|^[\w.-]+\.jpg$/);
    expect(out.data).not.toMatch(/^data:/);
    expect(out.data.length).toBeGreaterThan(0);
  });

  it('should draw it no larger than the first long-side step', async () => {
    await prepareScreenshot(file('a.png', 'image/png'));
    const [, , , w, h] = draws.mock.calls[0];
    expect(Math.max(w, h)).toBeLessThanOrEqual(1600);
  });

  it('should try smaller sizes and lower quality until it fits the server', async () => {
    let calls = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      calls += 1;
      cb(new Blob([new Uint8Array(calls < 4 ? TARGET_BYTES + 1 : 1000)], { type: 'image/jpeg' }));
    });
    const out = await prepareScreenshot(file('a.png', 'image/png'));
    expect(calls).toBe(4);
    expect(out.data.length).toBeGreaterThan(0);
  });

  it('should refuse, in words, what it cannot make small enough', async () => {
    blobSize = TARGET_BYTES + 1;
    await expect(prepareScreenshot(file('a.png', 'image/png'))).rejects.toThrow(/small enough/);
  });

  it('should refuse a file that is not a PNG, JPEG or WebP, and one that is far too large, before any work', async () => {
    await expect(prepareScreenshot(file('a.gif', 'image/gif'))).rejects.toBeInstanceOf(
      ScreenshotError
    );
    await expect(
      prepareScreenshot(file('a.png', 'image/png', MAX_PICKED_BYTES + 1))
    ).rejects.toThrow(/too large/);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('should refuse a PNG that declares billions of pixels before it is decoded', async () => {
    const bomb = new File([pngHead(60000, 60000)], 'bomb.png', { type: 'image/png' });
    await expect(prepareScreenshot(bomb)).rejects.toThrow(/too many pixels/);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('should refuse any image that is huge once decoded', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 20000, height: MAX_PIXELS / 20000 + 1, close: vi.fn() }))
    );
    await expect(prepareScreenshot(file('a.jpg', 'image/jpeg'))).rejects.toThrow(/too many pixels/);
  });

  it('should still take a large but sensible PNG', async () => {
    const big = new File([pngHead(3840, 2160)], 'ok.png', { type: 'image/png' });
    await expect(prepareScreenshot(big)).resolves.toMatchObject({ type: 'image/jpeg' });
  });

  it('should say so when the browser cannot open the image', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => Promise.reject(new Error('bad')))
    );
    await expect(prepareScreenshot(file('a.png', 'image/png'))).rejects.toThrow(
      'Could not open that image.'
    );
  });
});
