/*
 * Generates the PWA icons as PNGs with no image dependency.
 * Draws a rounded background tile with a banknote glyph (white note,
 * ring, centre dot) using signed-distance shapes so edges stay smooth.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const BG = [16, 185, 129, 255]; // emerald-500
const FG = [255, 255, 255, 255];

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy
      ? rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(
          raw,
          y * (width * 4 + 1) + 1,
        );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outside - r;
}

function sdCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

function render(size, { radiusFactor }) {
  const px = Buffer.alloc(size * size * 4);
  const s = size;
  const pad = 0.5;
  const radius = radiusFactor * s;

  const blend = (i, col, alpha) => {
    const a = alpha / 255;
    px[i] = Math.round(col[0] * a + px[i] * (1 - a));
    px[i + 1] = Math.round(col[1] * a + px[i + 1] * (1 - a));
    px[i + 2] = Math.round(col[2] * a + px[i + 2] * (1 - a));
    px[i + 3] = Math.round(col[3] * a + px[i + 3] * (1 - a));
  };

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const pxPos = x + pad;
      const pyPos = y + pad;
      const i = (y * s + x) * 4;

      // Background tile (full bleed when radiusFactor is 0, e.g. maskable icons).
      const dBg = radiusFactor === 0 ? -1 : sdRoundRect(pxPos, pyPos, s / 2, s / 2, s / 2, s / 2, radius);
      const aBg = Math.max(0, Math.min(1, 0.5 - dBg)) * 255;
      if (aBg > 0) blend(i, BG, aBg);

      // Banknote.
      const note = sdRoundRect(pxPos, pyPos, s / 2, s / 2, 0.35 * s, 0.2 * s, 0.06 * s);
      const aNote = Math.max(0, Math.min(1, 0.5 - note)) * 255;
      if (aNote > 0) blend(i, FG, aNote);

      // Ring knocked out of the note, then a solid centre dot.
      const ring = sdCircle(pxPos, pyPos, s / 2, s / 2, 0.13 * s);
      const aRing = Math.max(0, Math.min(1, 0.5 - ring)) * 255;
      if (aRing > 0) blend(i, BG, aRing);

      const dot = sdCircle(pxPos, pyPos, s / 2, s / 2, 0.065 * s);
      const aDot = Math.max(0, Math.min(1, 0.5 - dot)) * 255;
      if (aDot > 0) blend(i, FG, aDot);

      // Two small side marks on the note, like a bill's corners.
      const m1 = sdCircle(pxPos, pyPos, 0.26 * s, s / 2, 0.03 * s);
      const m2 = sdCircle(pxPos, pyPos, 0.74 * s, s / 2, 0.03 * s);
      const a1 = Math.max(0, Math.min(1, 0.5 - m1)) * 255;
      const a2 = Math.max(0, Math.min(1, 0.5 - m2)) * 255;
      if (a1 > 0) blend(i, BG, a1);
      if (a2 > 0) blend(i, BG, a2);
    }
  }
  return encodePNG(s, s, px);
}

mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-512.png', 512, { radiusFactor: 0.22 }],
  ['icon-192.png', 192, { radiusFactor: 0.22 }],
  ['icon-maskable-512.png', 512, { radiusFactor: 0 }],
  ['icon-maskable-192.png', 192, { radiusFactor: 0 }],
  ['apple-touch-icon-180.png', 180, { radiusFactor: 0 }],
  ['favicon-32.png', 32, { radiusFactor: 0.22 }],
];
for (const [name, size, opts] of targets) {
  writeFileSync(join(OUT, name), render(size, opts));
  console.log('wrote', name, size + 'px');
}