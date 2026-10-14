import type { SongMetadata } from '@/types/music';

export type TagReader = { size: number; read: (offset: number, length: number) => Uint8Array };
export type TagPart = Uint8Array | { offset: number; length: number };
export type TagPlan = { parts: TagPart[]; size: number };
export type TagArtwork = { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' | 'image/webp'; width: number; height: number };
const MAX_TAG = 16 * 1024 * 1024;
const fail = () => new Error('이 파일의 태그 구조는 안전하게 수정할 수 없습니다. 앱 표시 정보만 저장해 주세요.');
function read(reader: TagReader, offset: number, length: number): Uint8Array {
  if (!Number.isSafeInteger(offset) || offset < 0 || length < 0 || offset + length > reader.size || length > MAX_TAG) throw fail();
  const bytes = reader.read(offset, length);
  if (bytes.length !== length) throw fail();
  return bytes;
}
const ascii = (bytes: Uint8Array) => Array.from(bytes, byte => String.fromCharCode(byte)).join('');
const text = (value: string) => new TextEncoder().encode(value);
function join(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  if (size > MAX_TAG) throw fail();
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
function number(bytes: Uint8Array, little = false, sync = false): number {
  if (sync && bytes.some(byte => byte > 127)) throw fail();
  return Array.from(little ? bytes.slice().reverse() : bytes).reduce((value, byte) => value * (sync ? 128 : 256) + byte, 0);
}
function integer(value: number, width: number, little = false, sync = false): Uint8Array {
  const bytes = new Uint8Array(width), base = sync ? 128 : 256;
  for (let i = width - 1; i >= 0; i--) { bytes[i] = value % base; value = Math.floor(value / base); }
  if (value) throw fail();
  return little ? bytes.reverse() : bytes;
}
function plan(parts: TagPart[]): TagPlan {
  return { parts, size: parts.reduce((total, part) => total + part.length, 0) };
}
function frame(id: string, value: string, version: number): Uint8Array {
  const body = version === 4 ? join([new Uint8Array([3]), text(value)]) : join([new Uint8Array([1, 255, 254]),
    Uint8Array.from(Array.from({ length: value.length * 2 }, (_, index) => (value.charCodeAt(Math.floor(index / 2)) >> (index % 2 * 8)) & 255))]);
  return join([text(id), integer(body.length, 4, false, version === 4), new Uint8Array(2), body]);
}
const ID3_EDITED = new Set(['TIT2', 'TPE1', 'TALB', 'TPE2', 'TYER', 'TDRC', 'TRCK', 'TPOS']);
function id3Text(bytes: Uint8Array): string {
  if (bytes[0] === 0 || bytes[0] === 3) return new TextDecoder().decode(bytes.subarray(1)).replace(/\0/g, '').trim();
  const little = bytes[0] === 1 && bytes[1] === 255 && bytes[2] === 254;
  if (bytes[0] !== 1 && bytes[0] !== 2) return '';
  const start = bytes[0] === 1 ? 3 : 1; let result = '';
  for (let offset = start; offset + 1 < bytes.length; offset += 2) result += String.fromCharCode(little ? bytes[offset] + bytes[offset + 1] * 256 : bytes[offset] * 256 + bytes[offset + 1]);
  return result.replace(/\0/g, '').trim();
}
function mp3(reader: TagReader, fields: SongMetadata | undefined, artwork?: TagArtwork): TagPlan {
  const header = read(reader, 0, 10), retained: Uint8Array[] = [];
  let version = 4, start = 0, tagSize = 0;
  const totals = new Map<string, string>(); let originalDate: string | undefined;
  if (ascii(header.subarray(0, 3)) === 'ID3') {
    version = header[3];
    // Global unsynchronisation needs a separate rewrite; do not reinterpret its frame lengths.
    if (![3, 4].includes(version) || header[4] !== 0 || header[5] & 0x80 || header[5] & (version === 3 ? 0x1f : 0x0f)) throw fail();
    tagSize = number(header.subarray(6), false, true);
    const data = read(reader, 10, tagSize);
    start = 10 + tagSize + (version === 4 && header[5] & 0x10 ? 10 : 0);
    let offset = 0;
    if (header[5] & 0x40) {
      if (data.length < 4) throw fail();
      offset = number(data.subarray(0, 4), false, version === 4) + (version === 3 ? 4 : 0);
      if (offset < (version === 3 ? 10 : 6) || offset > data.length) throw fail();
    }
    while (offset < data.length) {
      if (data[offset] === 0) { if (data.subarray(offset).some(byte => byte !== 0)) throw fail(); break; }
      if (data.length - offset < 10) throw fail();
      const id = ascii(data.subarray(offset, offset + 4)), length = number(data.subarray(offset + 4, offset + 8), false, version === 4);
      if (!/^[A-Z0-9]{4}$/.test(id) || length < 1 || offset + 10 + length > data.length) throw fail();
      let replacePicture = false;
      if (artwork && id === 'APIC') {
        // Status flags do not change the payload, but compression/encryption/unsync do.
        if (data[offset + 9]) throw fail();
        const body = data.subarray(offset + 10, offset + 10 + length), mimeEnd = body.indexOf(0, 1);
        if (mimeEnd < 2 || mimeEnd + 1 >= body.length || body[0] > 3) throw fail();
        replacePicture = body[mimeEnd + 1] === 3;
      }
      if (!replacePicture && (!fields || !ID3_EDITED.has(id))) retained.push(data.slice(offset, offset + 10 + length));
      else if (!data[offset + 8] && !data[offset + 9]) {
        const value = id3Text(data.subarray(offset + 10, offset + 10 + length));
        if (id === 'TDRC') originalDate = value;
        if (id === 'TRCK' || id === 'TPOS') { const suffix = value.match(/\/(\d{1,4})$/)?.[1]; if (suffix) totals.set(id, suffix); }
      }
      offset += 10 + length;
    }
    if (version === 4 && header[5] & 0x10 && ascii(read(reader, start - 10, 3)) !== '3DI') throw fail();
  }
  const audioHeader = read(reader, start, 4);
  if (audioHeader[0] !== 255 || (audioHeader[1] & 0xe0) !== 0xe0 || (audioHeader[1] & 6) === 0 || (audioHeader[1] & 0x18) === 8 || (audioHeader[2] >> 4) === 15 || (audioHeader[2] & 12) === 12) throw fail();
  const values: [string, string | number | undefined][] = !fields ? [] : [['TIT2', fields.title], ['TPE1', fields.artist], ['TALB', fields.album], ['TPE2', fields.albumArtist],
    [version === 4 ? 'TDRC' : 'TYER', version === 4 && fields.year && Number(originalDate?.slice(0, 4)) === fields.year ? originalDate : fields.year],
    ['TRCK', fields.trackNumber && Number(totals.get('TRCK')) >= fields.trackNumber ? fields.trackNumber + '/' + totals.get('TRCK') : fields.trackNumber],
    ['TPOS', fields.discNumber && Number(totals.get('TPOS')) >= fields.discNumber ? fields.discNumber + '/' + totals.get('TPOS') : fields.discNumber]];
  const pictures: Uint8Array[] = [];
  if (artwork) {
    const body = join([new Uint8Array([0]), text(artwork.mime), new Uint8Array([0, 3, 0]), artwork.bytes]);
    pictures.push(join([text('APIC'), integer(body.length, 4, false, version === 4), new Uint8Array(2), body]));
  }
  const frames = join([...pictures, ...retained, ...values.filter(([, value]) => value !== undefined && value !== '').map(([id, value]) => frame(id, String(value), version))]);
  // Chapter byte offsets remain valid when the existing tag footprint is retained.
  if (frames.length > tagSize && retained.some(bytes => ['CHAP', 'CTOC', 'SEEK', 'ASPI'].includes(ascii(bytes.subarray(0, 4))))) throw fail();
  const bodySize = Math.max(frames.length + (tagSize ? 0 : 1024), tagSize + (start > tagSize + 10 ? 10 : 0));
  const prefix = join([text('ID3'), new Uint8Array([version, 0, 0]), integer(bodySize, 4, false, true), frames, new Uint8Array(bodySize - frames.length)]);
  let end = reader.size; const parts: TagPart[] = [prefix];
  // Clear stale ID3v1 display fields but retain its comment and genre.
  let legacy: Uint8Array | undefined;
  if (end - start >= 128 && ascii(read(reader, end - 128, 3)) === 'TAG') {
    legacy = read(reader, end - 128, 128).slice(); end -= 128;
    for (const [value, offset, length] of (fields ? [[fields.title, 3, 30], [fields.artist, 33, 30], [fields.album, 63, 30], [String(fields.year ?? ''), 93, 4]] as const : [])) {
      legacy.fill(0, offset, offset + length);
      if (Array.from(value).every(char => char.charCodeAt(0) <= 255)) legacy.set(Uint8Array.from(Array.from(value.slice(0, length), char => char.charCodeAt(0))), offset);
    }
    if (fields && legacy[125] === 0) legacy[126] = fields.trackNumber && fields.trackNumber <= 255 ? fields.trackNumber : 0;
  }
  if (end <= start) throw fail();
  parts.push({ offset: start, length: end - start }); if (legacy) parts.push(legacy);
  return plan(parts);
}
const VORBIS_EDITED = new Set(['TITLE', 'ARTIST', 'ALBUM', 'ALBUMARTIST', 'ALBUM_ARTIST', 'DATE', 'YEAR', 'TRACKNUMBER', 'DISCNUMBER']);
function comments(data: Uint8Array | undefined, fields: SongMetadata): Uint8Array {
  let vendor = text('YeongduMusic'), kept: Uint8Array[] = [];
  if (data) {
    let offset = 0;
    const take = (length: number) => { if (length < 0 || offset + length > data.length) throw fail(); const bytes = data.slice(offset, offset + length); offset += length; return bytes; };
    const next = () => take(number(take(4), true));
    vendor = next(); const count = number(take(4), true);
    if (count > 100000) throw fail();
    for (let i = 0; i < count; i++) {
      const entry = next(), equals = entry.indexOf(61);
      if (equals < 1) throw fail();
      if (!VORBIS_EDITED.has(ascii(entry.subarray(0, equals)).toUpperCase())) kept.push(entry);
    }
    if (offset !== data.length) throw fail();
  }
  const values: [string, string | number | undefined][] = [['TITLE', fields.title], ['ARTIST', fields.artist], ['ALBUM', fields.album], ['ALBUMARTIST', fields.albumArtist],
    ['DATE', fields.year], ['TRACKNUMBER', fields.trackNumber], ['DISCNUMBER', fields.discNumber]];
  kept = [...kept, ...values.filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => text(key + '=' + value))];
  return join([integer(vendor.length, 4, true), vendor, integer(kept.length, 4, true), ...kept.flatMap(entry => [integer(entry.length, 4, true), entry])]);
}
function flac(reader: TagReader, fields: SongMetadata | undefined, artwork?: TagArtwork): TagPlan {
  if (ascii(read(reader, 0, 4)) !== 'fLaC') throw fail();
  const blocks: { type: number; data: TagPart; length: number }[] = [];
  let offset = 4, original: Uint8Array | undefined, done = false, count = 0;
  while (!done) {
    if (++count > 10000) throw fail();
    const header = read(reader, offset, 4), type = header[0] & 127, length = number(header.subarray(1)); done = !!(header[0] & 128); offset += 4;
    if (offset + length > reader.size || type === 127 || !blocks.length && (type !== 0 || length !== 34) || blocks.length && type === 0) throw fail();
    if (type === 4 && fields) { if (original) throw fail(); original = read(reader, offset, length); }
    else if (type === 6 && artwork) {
      if (length < 4) throw fail();
      if (number(read(reader, offset, 4)) !== 3) blocks.push({ type, data: { offset, length }, length });
    }
    else if (type !== 1) blocks.push({ type, data: { offset, length }, length });
    offset += length;
  }
  if (offset >= reader.size) throw fail();
  if (fields) {
    const comment = comments(original, fields); if (comment.length > 0xffffff) throw fail();
    blocks.push({ type: 4, data: comment, length: comment.length });
  }
  if (artwork) {
    // Unknown depth/palette count must be zero (RFC 9639 section 8.8).
    const mime = text(artwork.mime), picture = join([integer(3, 4), integer(mime.length, 4), mime, integer(0, 4),
      integer(artwork.width, 4), integer(artwork.height, 4), integer(0, 4), integer(0, 4), integer(artwork.bytes.length, 4), artwork.bytes]);
    blocks.splice(1, 0, { type: 6, data: picture, length: picture.length });
  }
  const parts: TagPart[] = [text('fLaC')];
  blocks.forEach((block, index) => parts.push(join([new Uint8Array([block.type | (index === blocks.length - 1 ? 128 : 0)]), integer(block.length, 3)]), block.data));
  parts.push({ offset, length: reader.size - offset });
  return plan(parts);
}
export function buildTagPlan(reader: TagReader, format: 'mp3' | 'flac', fields?: SongMetadata, artwork?: TagArtwork): TagPlan {
  if (!Number.isSafeInteger(reader.size) || reader.size <= 0) throw fail();
  if (!fields && !artwork) throw fail();
  if (artwork && (!(artwork.bytes instanceof Uint8Array) || !artwork.bytes.length || artwork.bytes.length > 8 * 1024 * 1024
    || !['image/jpeg', 'image/png', 'image/webp'].includes(artwork.mime) || !Number.isSafeInteger(artwork.width) || artwork.width <= 0
    || !Number.isSafeInteger(artwork.height) || artwork.height <= 0 || artwork.width * artwork.height > 16000000)) throw fail();
  return format === 'mp3' ? mp3(reader, fields, artwork) : flac(reader, fields, artwork);
}
