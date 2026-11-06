import type { LyricsDocument } from '@/types/lyrics';
import type {
  MusicEntityRef,
  MusicLibrary,
  MusicProviderId,
  Page,
  PageRequest,
  PlaybackSource,
  ServerPlaylist,
  Song,
  SourceRequest,
  UriSource,
} from '@/types/music';

export type ProviderState = {
  ready: boolean;
  connected: boolean;
  selectable?: boolean;
  scope: string;
  generation: number;
  songs: readonly Song[];
  loading: boolean;
  error: string | null;
  stale?: boolean;
  selection?: unknown;
  documentsRevision?: number;
};

export interface MusicProvider {
  readonly id: MusicProviderId;
  readonly name: string;
  readonly catalog: 'remote' | 'stored';
  readonly playbackRecovery?: 'check' | 'reload';
  getState(): ProviderState;
  subscribe(listener: () => void): () => void;
  bootstrap(): Promise<void>;
  songs(page: PageRequest): Promise<Page<Song>>;
  refresh(signal?: AbortSignal): Promise<void>;
  cancelLibrary?(): void;
  streamSource(song: Song, options?: SourceRequest): Promise<PlaybackSource>;
  entityRef(song: Song): MusicEntityRef;
  restore(song: Song): Song | null;
  checkSession?(): Promise<void>;
  libraries?: { list(signal?: AbortSignal): Promise<MusicLibrary[]> };
  playlists?: {
    list(signal?: AbortSignal): Promise<ServerPlaylist[]>;
    songs(playlist: ServerPlaylist, signal?: AbortSignal): Promise<Song[]>;
  };
  lyrics?: { read(song: Song, signal?: AbortSignal): Promise<LyricsDocument> };
  download?: { source(song: Song, options?: SourceRequest): Promise<UriSource> };
  fileWrite?: { description: string };
}

/** React external-store snapshots must keep their identity until a field changes. */
export function memoSnapshot(read: () => ProviderState): () => ProviderState {
  let previous: ProviderState | undefined;
  return () => {
    const next = read();
    if (
      !previous ||
      (Object.keys(next) as (keyof ProviderState)[]).some((key) => previous![key] !== next[key])
    ) {
      previous = next;
    }
    return previous;
  };
}

export function storedPage(songs: readonly Song[], page: PageRequest): Page<Song> {
  if (page.signal?.aborted) {
    throw new Error('음악 목록 요청이 취소되었습니다.');
  }
  return { items: songs.slice(page.offset, page.offset + page.limit), total: songs.length };
}
