import MediaFileReader, { type Callbacks } from 'jsmediatags/build2/MediaFileReader';
import ID3v2TagReader from 'jsmediatags/build2/ID3v2TagReader';
import ID3v1TagReader from 'jsmediatags/build2/ID3v1TagReader';
import MP4TagReader from 'jsmediatags/build2/MP4TagReader';
import FLACTagReader from 'jsmediatags/build2/FLACTagReader';
import type { Song } from '@/types/music';

export type ByteReader = (start: number, end: number) => Promise<Uint8Array>;
export type MusicTags = Partial<
  Pick<
    Song,
    | 'title'
    | 'artist'
    | 'album'
    | 'albumArtist'
    | 'year'
    | 'trackNumber'
    | 'discNumber'
    | 'duration'
  >
>;
export type EmbeddedTags = { fields: MusicTags; picture?: { mime: string; bytes: Uint8Array } };
const MAX_RANGE = 4 * 1024 * 1024;

class RangeReader extends MediaFileReader {
  onFailure: (error: unknown) => void = () => {};
  private chunks: { start: number; bytes: Uint8Array }[] = [];
  private requested = 0;
  private requests = 0;
  constructor(
    size: number,
    private readonly readBytes: ByteReader,
    private readonly signal: AbortSignal,
  ) {
    super();
    this._size = size;
  }
  _init(callbacks: Callbacks) {
    callbacks.onSuccess();
  }
  getByteAt(offset: number): number {
    if (this.signal.aborted) {
      throw new Error('Cancelled metadata');
    }
    const chunk = this.chunks.find(
      (chunk) => offset >= chunk.start && offset < chunk.start + chunk.bytes.length,
    );
    if (!chunk) {
      throw new Error('Unloaded metadata byte');
    }
    return chunk.bytes[offset - chunk.start];
  }
  async bytes(start: number, end: number): Promise<Uint8Array> {
    if (this.signal.aborted) {
      throw new Error('Cancelled metadata');
    }
    end = Math.min(end, this._size - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
      throw new Error('Invalid metadata range');
    }
    // Count cached reads too: malformed MP4 atoms can otherwise loop at one offset forever.
    if (++this.requests > 64) {
      throw new Error('Metadata read limit exceeded');
    }
    const cached = this.chunks.find(
      (chunk) => start >= chunk.start && end < chunk.start + chunk.bytes.length,
    );
    if (cached) {
      return cached.bytes.slice(start - cached.start, end - cached.start + 1);
    }
    const length = end - start + 1;
    this.requested += length;
    if (length > MAX_RANGE || this.requested > MAX_RANGE * 2) {
      throw new Error('Metadata read limit exceeded');
    }
    const bytes = await this.readBytes(start, end);
    if (this.signal.aborted) {
      throw new Error('Cancelled metadata');
    }
    if (bytes.length !== length) {
      throw new Error('Incomplete metadata range');
    }
    this.chunks.push({ start, bytes });
    return bytes;
  }
  loadRange(range: [number, number], callbacks: Callbacks) {
    const fail = (error: unknown) => {
      this.onFailure(error);
      callbacks.onError?.(error);
    };
    void this.bytes(range[0], range[1]).then(() => {
      // Parser callbacks may throw while reading a malformed file.
      try {
        callbacks.onSuccess();
      } catch (error) {
        fail(error);
      }
    }, fail);
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string | undefined {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').trim().slice(0, 1000) || undefined
    : undefined;
}
function number(value: unknown): number | undefined {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    parsed = Number.parseInt(value, 10);
  } else {
    parsed = NaN;
  }

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
function value(tags: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (tags[key] !== undefined) {
      return record(tags[key]) && 'id' in tags[key] && 'data' in tags[key]
        ? tags[key].data
        : tags[key];
    }
  }
  return undefined;
}
export function mapTags(tags: Record<string, unknown>): EmbeddedTags {
  const fields: MusicTags = {};
  for (const [field, keys] of [
    ['title', ['title']],
    ['artist', ['artist']],
    ['album', ['album']],
    ['albumArtist', ['TPE2', 'TP2', 'aART', 'ALBUMARTIST', 'ALBUM_ARTIST']],
  ] as const) {
    const tag = text(value(tags, ...keys));
    if (tag) {
      fields[field] = tag;
    }
  }
  for (const [field, keys] of [
    ['year', ['year', 'DATE', 'YEAR', 'TDRC', 'TYER']],
    ['trackNumber', ['track', 'TRACKNUMBER']],
    ['discNumber', ['TPOS', 'TPA', 'DISCNUMBER']],
  ] as const) {
    const tag = number(value(tags, ...keys));
    if (tag) {
      fields[field] = tag;
    }
  }
  const disk = value(tags, 'disk');
  if (record(disk)) {
    fields.discNumber = number(disk.disk);
  }
  const length = number(value(tags, 'TLEN'));
  if (length) {
    fields.duration = length / 1000;
  }
  const picture = value(tags, 'picture');
  if (record(picture) && Array.isArray(picture.data) && picture.data.length <= 2 * 1024 * 1024) {
    const mime = picture.format === 'image/jpg' ? 'image/jpeg' : picture.format;
    if (
      (mime === 'image/jpeg' || mime === 'image/png') &&
      picture.data.length &&
      picture.data.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ) {
      return { fields, picture: { mime, bytes: Uint8Array.from(picture.data as number[]) } };
    }
  }
  return { fields };
}
async function additionalFlacTags(reader: RangeReader): Promise<MusicTags> {
  // jsmediatags' FLAC reader exposes only five common tags. Read these additional
  // fields from the same bounded byte cache so written album/year/disc tags round-trip.
  let offset = 4;
  for (let block = 0; block < 32; block++) {
    const header = await reader.bytes(offset, offset + 3);
    const length = header[1] * 65536 + header[2] * 256 + header[3];
    if ((header[0] & 127) === 4) {
      const bytes = await reader.bytes(offset + 4, offset + 3 + length);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let cursor = 0;
      const u32 = () => {
        if (cursor + 4 > bytes.length) {
          throw new Error('Invalid FLAC comment length');
        }
        const value = view.getUint32(cursor, true);
        cursor += 4;
        return value;
      };
      const string = () => {
        const size = u32();
        if (cursor + size > bytes.length) {
          throw new Error('Invalid FLAC comment length');
        }
        const value = new TextDecoder().decode(bytes.subarray(cursor, cursor + size));
        cursor += size;
        return value;
      };
      string();
      const count = u32();
      if (count > 100000) {
        throw new Error('Invalid FLAC comment count');
      }
      const values: Record<string, string> = {};
      for (let i = 0; i < count; i++) {
        const entry = string();
        const separator = entry.indexOf('=');
        const key = entry.slice(0, separator).toUpperCase();
        if (['ALBUMARTIST', 'ALBUM_ARTIST', 'DATE', 'YEAR', 'DISCNUMBER'].includes(key)) {
          values[key] = entry.slice(separator + 1);
        }
      }
      return mapTags(values).fields;
    }
    if (header[0] & 128) {
      return {};
    }
    offset += 4 + length;
  }
  throw new Error('FLAC block limit exceeded');
}
export async function readEmbeddedTags(
  size: number,
  readBytes: ByteReader,
  signal: AbortSignal,
): Promise<EmbeddedTags> {
  const reader = new RangeReader(size, readBytes, signal);
  await new Promise<void>((resolve, reject) =>
    reader.init({ onSuccess: resolve, onError: reject }),
  );
  const header = await reader.bytes(0, 15);
  const signature = (start: number, length: number) =>
    String.fromCharCode(...header.slice(start, start + length));
  let Parser;
  if (signature(0, 3) === 'ID3') {
    Parser = ID3v2TagReader;
  } else if (signature(0, 4) === 'fLaC') {
    Parser = FLACTagReader;
  } else if (signature(4, 4) === 'ftyp') {
    Parser = MP4TagReader;
  } else if (
    size >= 128 &&
    String.fromCharCode(...(await reader.bytes(size - 128, size - 126))) === 'TAG'
  ) {
    Parser = ID3v1TagReader;
  }
  if (!Parser) {
    return { fields: {} };
  }
  const tags = await new Promise<{ tags: Record<string, unknown> }>((resolve, reject) => {
    reader.onFailure = reject;
    new Parser(reader).read({ onSuccess: resolve, onError: reject });
  });
  const result = mapTags(tags.tags);
  if (Parser === FLACTagReader && size >= 42) {
    Object.assign(result.fields, await additionalFlacTags(reader));
    const stream = await reader.bytes(8, 41);
    const sampleRate = stream[10] * 4096 + stream[11] * 16 + (stream[12] >> 4);
    const samples =
      (stream[13] & 15) * 4294967296 +
      stream[14] * 16777216 +
      stream[15] * 65536 +
      stream[16] * 256 +
      stream[17];
    if (sampleRate && samples) {
      result.fields.duration = samples / sampleRate;
    }
  }
  return result;
}
