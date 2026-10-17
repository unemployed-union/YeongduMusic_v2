export type StreamingQuality = 'original' | 'mp3';

export type MusicSourceFilter = 'all' | 'nas' | 'local' | 'drive' | 's3';
export type LocalFile = { fileName: string; originalName: string; size: number; mimeType?: string; originalFolders?: string[]; downloadedFrom?: 'nas' | 'drive' | 's3' };
export type SongMetadata = { title: string; artist: string; album: string; albumArtist?: string; year?: number; trackNumber?: number; discNumber?: number };
export type OriginalSongMetadata = SongMetadata & { albumId?: string; albumSource?: 'tag' | 'fallback' };

export type Song = {
  id: string;
  path?: string;
  title: string;
  artist: string;
  album: string;
  /** Whether the album name came from embedded tags or a folder/default label. */
  albumSource?: 'tag' | 'fallback';
  albumId?: string;
  albumArtist?: string;
  discNumber?: number;
  year?: number;
  duration: number;
  /** Source encoding information; playback may still use a lossy transcode. */
  audioCodec?: string;
  lossless?: boolean;
  trackNumber?: number;
  artworkUrl?: string;
  palette?: readonly [string, string];
  /** Original display fields allow local edits to be removed from a queued song. */
  metadataOriginal?: OriginalSongMetadata;
  artworkOriginal?: { artworkUrl?: string; palette?: readonly [string, string] };
} & ({ source?: 'nas'; nasId?: string; local?: never; drive?: never; s3?: never }
  | { source: 'local'; local: LocalFile; drive?: never; s3?: never }
  | { source: 'drive'; drive: { fileId: string; accountId: string; mimeType: string; size?: number; modifiedTime?: string }; local?: never; nasId?: never; s3?: never }
  | { source: 's3'; s3: { connectionId: string; key: string; size: number; modifiedTime?: string }; local?: never; drive?: never; nasId?: never });

export type Album = {
  id: string;
  title: string;
  artist: string;
  year?: number;
  artworkUrl?: string;
  palette?: readonly [string, string];
  songCount?: number;
};

export type Artist = { id: string; name: string; albumCount?: number };
export type Page<T> = { items: T[]; total: number; stale?: boolean };
export type PageRequest = { offset: number; limit: number; signal?: AbortSignal };

export interface MusicRepository {
  songs(page: PageRequest): Promise<Page<Song>>;
  albums(page: PageRequest): Promise<Page<Album>>;
  artists(page: PageRequest): Promise<Page<Artist>>;
  streamSource(song: Song): Promise<{ uri?: string; assetId?: number; headers?: Record<string, string> }>;
}
