// Generates src-tauri/app-icon.png — a 512x512 dark-fantasy source icon.
// Run `npm run tauri icon src-tauri/app-icon.png` (after installing Rust) to
// produce the full platform icon set referenced by tauri.conf.json.
import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const S = 512;
const buf = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const ia = a / 255;
  buf[i] = Math.round(buf[i] * (1 - ia) + r * ia);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - ia) + g * ia);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - ia) + b * ia);
  buf[i + 3] = 255;
}

// Background: subtle vertical gradient (deep navy -> near black).
for (let y = 0; y < S; y++) {
  const t = y / S;
  const r = Math.round(0x0d * (1 - t) + 0x08 * t);
  const g = Math.round(0x0f * (1 - t) + 0x0a * t);
  const b = Math.round(0x17 * (1 - t) + 0x12 * t);
  for (let x = 0; x < S; x++) set(x, y, r, g, b, 255);
}

// Amber rune diamond in the center with a soft glow.
const cx = S / 2;
const cy = S / 2;
const R = 150;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const d = Math.abs(x - cx) + Math.abs(y - cy); // diamond distance
    if (d < R) {
      // edge falloff
      const edge = Math.min(1, (R - d) / 18);
      set(x, y, 0xd9, 0xa4, 0x41, Math.round(235 * edge));
    } else if (d < R + 40) {
      // glow
      const g = (1 - (d - R) / 40) * 70;
      set(x, y, 0xf0, 0xc2, 0x64, Math.round(g));
    }
  }
}

// Inner cut (a lighter diamond) to suggest a gem facet.
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (d < R - 55 && d > R - 60) set(x, y, 0x0d, 0x0f, 0x17, 200);
    if (d < 40) set(x, y, 0xf7, 0xe3, 0xb0, 200);
  }
}

// Encode as PNG (truecolor + alpha, 8-bit).
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// rest 0

// Raw scanlines with filter byte 0.
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src-tauri");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "app-icon.png");
writeFileSync(out, png);
console.log("Wrote", out, `(${png.length} bytes)`);
