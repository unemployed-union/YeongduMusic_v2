// Render the outline of the installed Ionicons musical-notes glyph used by connect.tsx.
// No new drawing/font dependency is needed to reproduce the committed PNGs.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const outline = JSON.parse(fs.readFileSync(path.join(root, 'assets/branding/musical-notes.json'), 'utf8'));
const size = 1024;
const colors = [[230, 91, 124], [97, 58, 128], [24, 46, 91]];
const contours = [];
let contour;
for (let i = 0; i < outline.points.length; i++) {
  const type = outline.types[i] & 7;
  if (type === 0) { contour = [outline.points[i]]; contours.push(contour); }
  else if (type === 1) contour.push(outline.points[i]);
  else if (type === 3) {
    const start = contour.at(-1), a = outline.points[i], b = outline.points[i + 1], end = outline.points[i + 2];
    for (let step = 1; step <= 24; step++) {
      const t = step / 24, u = 1 - t;
      contour.push([0, 1].map(axis => u ** 3 * start[axis] + 3 * u ** 2 * t * a[axis] + 3 * u * t ** 2 * b[axis] + t ** 3 * end[axis]));
    }
    i += 2;
  } else throw new Error('Unsupported glyph outline');
}
function mask(scale) {
  const height = size * (74 / 112) * outline.heightPerEm * scale;
  const width = height * outline.aspect;
  const polygons = contours.map(points => points.map(([x, y]) => [(size - width) / 2 + x * width, (size - height) / 2 + y * height]));
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (const subY of [0.25, 0.75]) {
    const scanY = y + subY, intersections = [];
    for (const polygon of polygons) for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      if ((a[1] > scanY) !== (b[1] > scanY)) intersections.push(a[0] + (scanY - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = intersections[i], right = intersections[i + 1];
      for (let x = Math.max(0, Math.floor(left)); x < Math.min(size, Math.ceil(right)); x++) {
        if (x + 0.25 >= left && x + 0.25 < right) pixels[y * size + x]++;
        if (x + 0.75 >= left && x + 0.75 < right) pixels[y * size + x]++;
      }
    }
  }
  return pixels;
}
const table = Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function chunk(type, payload) {
  const name = Buffer.from(type), length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  let crc = 0xFFFFFFFF;
  for (const byte of Buffer.concat([name, payload])) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0);
  return Buffer.concat([length, name, payload, checksum]);
}
function write(name, glyph, transparent = false) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const fraction = y / (size - 1) * 2;
    const stop = Math.min(1, Math.floor(fraction)), t = fraction - stop;
    const color = colors[stop].map((value, channel) => value + (colors[stop + 1][channel] - value) * t);
    for (let x = 0; x < size; x++) {
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      const alpha = glyph ? glyph[y * size + x] / 4 : 0;
      for (let channel = 0; channel < 3; channel++) raw[offset + channel] = transparent ? 255 : Math.round(color[channel] * (1 - alpha) + 255 * alpha);
      raw[offset + 3] = transparent ? Math.round(alpha * 255) : 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  fs.writeFileSync(path.join(root, 'assets/images', name), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}
write('icon.png', mask(1));
// Adaptive icons have a larger canvas than the visible launcher mask; keep the note safe.
write('app-icon-foreground.png', mask(66 / 108), true);
write('app-icon-background.png', null);
console.log('Generated login-style icon and adaptive icon layers (1024x1024).');
