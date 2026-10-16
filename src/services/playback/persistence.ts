import { useS3Store } from '@/stores/s3';
import { AppState, Platform } from 'react-native';
import { privacyScope, hiddenMatcher } from '@/features/hidden-music/rules';
import { useAuthStore } from '@/stores/auth';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useLocalMusicStore } from '@/stores/local-music';
import { usePlaybackStore, type RepeatMode } from '@/stores/playback';
import type { Song } from '@/types/music';
import { SynologyClient } from '@/services/synology/api';
import { isPlaybackRate } from './playback-rate';
import { applySongArtwork } from '@/features/artwork/rules';

const KEY = 'yeongdumusic-playback-v1';
const SAVE_INTERVAL_MS = 15000;
const BACKGROUND_SAVE_INTERVAL_MS = 30000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Snapshot = {
  version: 1;
  queue: Song[];
  index: number;
  position: number;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  playbackRate?: number;
  preservePitch?: boolean;
  nasScope: string | null;
  driveAccountId: string | null;
  s3ConnectionId?: string | null;
  savedAt: number;
};

export type RestoredPlayback = Pick<Snapshot, 'queue' | 'index' | 'position' | 'playing' | 'shuffle' | 'repeat'> & { playbackRate: number; preservePitch: boolean };

async function read(): Promise<string | null> {
  if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  return (await import('expo-sqlite/kv-store')).default.getItem(KEY);
}

async function write(value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      if (value === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, value);
    }
    return;
  }
  const storage = (await import('expo-sqlite/kv-store')).default;
  if (value === null) await storage.removeItem(KEY);
  else await storage.setItem(KEY, value);
}

function validSong(value: unknown): value is Song {
  if (!value || typeof value !== 'object') return false;
  const song = value as Partial<Song>;
  return typeof song.id === 'string' && !!song.id && typeof song.title === 'string' &&
    typeof song.artist === 'string' && typeof song.album === 'string' &&
    typeof song.duration === 'number' && Number.isFinite(song.duration) && song.duration >= 0 &&
    (song.source === 'nas' || song.source === undefined ||
      (song.source === 'local' && !!song.local && typeof song.local.fileName === 'string') ||
      (song.source === 'drive' && !!song.drive && typeof song.drive.fileId === 'string' && typeof song.drive.accountId === 'string') ||
      (song.source === 's3' && !!song.s3 && typeof song.s3.key === 'string' && typeof song.s3.connectionId === 'string' && Number.isSafeInteger(song.s3.size) && song.s3.size > 0));
}

function parse(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Snapshot>;
    if (value.version !== 1 || !Array.isArray(value.queue) || !value.queue.length || value.queue.length > 10000 ||
      !value.queue.every(validSong) || !Number.isInteger(value.index) || value.index! < 0 || value.index! >= value.queue.length ||
      typeof value.position !== 'number' || !Number.isFinite(value.position) || value.position < 0 ||
      typeof value.playing !== 'boolean' || typeof value.shuffle !== 'boolean' ||
      !['off', 'all', 'one'].includes(value.repeat ?? '') ||
      !(value.nasScope === null || typeof value.nasScope === 'string') ||
      !(value.driveAccountId === null || typeof value.driveAccountId === 'string') ||
      !(value.s3ConnectionId === undefined || value.s3ConnectionId === null || typeof value.s3ConnectionId === 'string') ||
      typeof value.savedAt !== 'number' || Date.now() - value.savedAt > MAX_AGE_MS || value.savedAt > Date.now() + 60_000) return null;
    return value as Snapshot;
  } catch { return null; }
}

export async function readRestoredPlayback(): Promise<RestoredPlayback | null> {
  const saved = parse(await read());
  if (!saved) return null;
  const auth = useAuthStore.getState();
  const privacy = useHiddenMusicStore.getState();
  const local = useLocalMusicStore.getState();
  const driveAccountId = useGoogleDriveStore.getState().account?.id ?? null;
  const scope = privacyScope(auth.mode, auth.session);
  const currentLocal = new Map(local.songs.map((song) => [song.id, song]));
  const currentDrive = new Map(useGoogleDriveStore.getState().songs.map(song => [song.id, song]));
  const currentS3 = new Map(useS3Store.getState().songs.map(song => [song.id, song]));
  const hidden = hiddenMatcher(privacy.profile.presets);
  const nasClient = auth.mode === 'nas' && auth.session ? new SynologyClient(auth.session) : null;
  const selectedId = saved.queue[saved.index].id;
  const queue: Song[] = [];
  let index = -1;
  for (let i = 0; i < saved.queue.length; i++) {
    const { artworkOriginal: _original, ...song } = applySongArtwork(saved.queue[i], undefined, '');
    let restored: Song | null = null;
    if (song.source === 'local') restored = currentLocal.get(song.id) ?? null;
    else if (song.source === 'drive') {
      const current = currentDrive.get(song.id);
      restored = song.drive.accountId === driveAccountId && saved.driveAccountId === driveAccountId ? { ...song, artworkUrl: current?.artworkUrl, palette: current?.palette ?? song.palette } : null;
    }
    else if (song.source === 's3') {
      const connection = useS3Store.getState().connection;
      const current = currentS3.get(song.id);
      restored = connection && saved.s3ConnectionId === connection.id && song.s3.connectionId === connection.id && song.s3.key.startsWith(connection.prefix) ? { ...song, artworkUrl: current?.artworkUrl, palette: current?.palette ?? song.palette } : null;
    }
    else if (saved.nasScope === scope && privacy.ready && privacy.scope === scope && !hidden(song)) {
      restored = nasClient ? { ...song, artworkUrl: nasClient.coverUrl(song.nasId ?? song.id) } : auth.mode === 'mock' ? song : null;
    }
    if (!restored) continue;
    if (i === saved.index && restored.id === selectedId) index = queue.length;
    queue.push(restored);
  }
  if (index < 0) return null;
  return { queue, index, position: saved.position, playing: saved.playing, shuffle: saved.shuffle, repeat: saved.repeat,
    playbackRate: isPlaybackRate(saved.playbackRate) ? saved.playbackRate : 1, preservePitch: typeof saved.preservePitch === 'boolean' ? saved.preservePitch : true };
}

function snapshot(): string | null {
  const state = usePlaybackStore.getState();
  if (state.index < 0 || !state.queue[state.index]) return null;
  const auth = useAuthStore.getState();
  const current: Snapshot = {
    version: 1,
    // Cover URLs can contain a NAS session ID. Rebuild them from the current session on restore.
    queue: state.queue.map(item => {
      const { artworkUrl: _artworkUrl, artworkOriginal: _original, ...song } = applySongArtwork(item, undefined, '');
      return song as Song;
    }),
    index: state.index,
    position: state.position,
    playing: state.playing,
    shuffle: state.shuffle,
    repeat: state.repeat,
    playbackRate: state.playbackRate,
    preservePitch: state.preservePitch,
    nasScope: privacyScope(auth.mode, auth.session),
    driveAccountId: useGoogleDriveStore.getState().account?.id ?? null,
    s3ConnectionId: useS3Store.getState().connection?.id ?? null,
    savedAt: Date.now(),
  };
  return JSON.stringify(current);
}

/** Start only after the initial restore, so an empty new store cannot erase the saved queue. */
export function startPlaybackPersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSave = 0;
  let foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
  let tail: Promise<void> = Promise.resolve();
  const persist = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastSave = Date.now();
    const value = snapshot();
    tail = tail.then(() => write(value)).catch(() => {});
  };
  const schedule = (important: boolean) => {
    // Position samples must neither allocate a fresh timer nor postpone a pending important save.
    if (timer !== null) {
      if (!important) return;
      clearTimeout(timer);
    }
    const interval = foreground ? SAVE_INTERVAL_MS : BACKGROUND_SAVE_INTERVAL_MS;
    timer = setTimeout(persist, important ? 250 : Math.max(250, interval - (Date.now() - lastSave)));
  };
  const unsubscribe = usePlaybackStore.subscribe((state, previous) => {
    const changed = state.queue !== previous.queue || state.index !== previous.index || state.playing !== previous.playing ||
      state.shuffle !== previous.shuffle || state.repeat !== previous.repeat || state.playbackRate !== previous.playbackRate || state.preservePitch !== previous.preservePitch;
    if (changed || Math.abs(state.position - previous.position) >= 0.5) schedule(changed);
  });
  const appState = AppState.addEventListener('change', (next) => {
    const active = next === 'active';
    if (foreground === active) return;
    foreground = active;
    if (!foreground) persist();
    else {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (usePlaybackStore.getState().queue.length) schedule(false);
    }
  });
  if (usePlaybackStore.getState().queue.length) schedule(true);
  return () => { if (timer !== null) clearTimeout(timer); unsubscribe(); appState.remove(); };
}
