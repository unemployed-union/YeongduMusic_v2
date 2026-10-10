export type Song = {
  id: string;
  path?: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  albumArtist?: string;
  discNumber?: number;
  year?: number;
  duration: number;
  trackNumber?: number;
  artworkUrl?: string;
  palette?: readonly [string, string];
};

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
