// Import only pure JS readers. The package's default RN entry requires react-native-fs.
declare module 'jsmediatags/build2/MediaFileReader' {
  export type Callbacks = { onSuccess: () => void; onError: (error: unknown) => void };
  export default class MediaFileReader {
    _size: number;
    init(callbacks: Callbacks): void;
    getSize(): number;
    getByteAt(offset: number): number;
    getBytesAt(offset: number, length: number): number[];
  }
}
declare module 'jsmediatags/build2/MediaTagReader' {
  import MediaFileReader from 'jsmediatags/build2/MediaFileReader';
  export default class MediaTagReader {
    constructor(reader: MediaFileReader);
    read(callbacks: { onSuccess: (result: { tags: Record<string, unknown> }) => void; onError: (error: unknown) => void }): void;
  }
}
declare module 'jsmediatags/build2/ID3v2TagReader' { export { default } from 'jsmediatags/build2/MediaTagReader'; }
declare module 'jsmediatags/build2/ID3v1TagReader' { export { default } from 'jsmediatags/build2/MediaTagReader'; }
declare module 'jsmediatags/build2/MP4TagReader' { export { default } from 'jsmediatags/build2/MediaTagReader'; }
declare module 'jsmediatags/build2/FLACTagReader' { export { default } from 'jsmediatags/build2/MediaTagReader'; }
