import { ExpoAudioEngine } from './audio-engine';
import { SessionExpiredError, SynologyClient, SynologyError } from '@/services/synology/api';
import { musicRepository } from '@/features/library/repository';
import { useAuthStore } from '@/stores/auth';
import { usePlaybackStore, type SleepTimer } from '@/stores/playback';
import { usePlayerBackgroundStore } from '@/stores/player-background';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { hiddenMatcher, privacyScope } from '@/features/hidden-music/rules';
import type { Song } from '@/types/music';

let engine: ExpoAudioEngine | null = null;
export function getPlaybackAudioSessionId(): number | null {
  return engine?.getAudioSessionId() ?? null;
}
let generation = 0;
let loadedSongId: string | null = null;
let finishing = false;
let checkingSession = false;
let checkedGeneration = -1;
let sleepTimeout: ReturnType<typeof setTimeout> | null = null;

export function cancelSleepTimer(): void {
  usePlaybackStore.getState().setSleepTimer(null);
}
export function startSleepTimer(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('1~1440분 사이의 시간을 입력해 주세요.');
  const state = usePlaybackStore.getState();
  if (!state.queue[state.index]) throw new Error('먼저 재생할 곡을 선택해 주세요.');
  state.setSleepTimer({ mode: 'time', minutes, endsAt: Date.now() + minutes * 60_000 });
}
export function stopAfterCurrentTrack(): void {
  const state = usePlaybackStore.getState();
  const song = state.queue[state.index];
  if (!song) throw new Error('먼저 재생할 곡을 선택해 주세요.');
  state.setSleepTimer({ mode: 'track', songId: song.id });
}
/** Check the deadline after delayed JS timers, native status events and foreground return. */
export function checkSleepTimer(fromEnd = false): boolean {
  const state = usePlaybackStore.getState();
  const timer = state.sleepTimer;
  if (!timer || !(timer.mode === 'time' ? Date.now() >= timer.endsAt : fromEnd && state.queue[state.index]?.id === timer.songId)) return false;
  // Invalidate pending source loads and engine setup/recovery; retain queue and position.
  generation++;
  state.setSleepTimer(null);
  engine?.pause();
  state.setStatus({ playing: false, buffering: false });
  return true;
}
function scheduleSleepTimer(timer: Extract<SleepTimer, { mode: 'time' }>): void {
  sleepTimeout = setTimeout(() => {
    if (usePlaybackStore.getState().sleepTimer !== timer) return;
    sleepTimeout = null;
    if (!checkSleepTimer()) scheduleSleepTimer(timer);
  }, Math.max(0, timer.endsAt - Date.now()));
}
usePlaybackStore.subscribe((state, previousState) => {
  if (state.sleepTimer === previousState.sleepTimer) return;
  if (sleepTimeout !== null) clearTimeout(sleepTimeout);
  sleepTimeout = null;
  if (state.sleepTimer?.mode === 'time') scheduleSleepTimer(state.sleepTimer);
});

async function checkPlaybackSession(): Promise<void> {
  const { mode, session, generation: authGeneration, expire } = useAuthStore.getState();
  if (usePlaybackStore.getState().queue[usePlaybackStore.getState().index]?.source === 'local') return;
  if (checkingSession || checkedGeneration === generation || mode !== 'nas' || !session) return;
  checkingSession = true;
  checkedGeneration = generation;
  try { await new SynologyClient(session).checkSession(); }
  catch (error) { if (error instanceof SessionExpiredError || (error instanceof SynologyError && error.code === 105)) await expire(session, authGeneration); }
  finally { checkingSession = false; }
}

function activeEngine(): ExpoAudioEngine {
  if (!engine) {
    engine = new ExpoAudioEngine();
    engine.subscribe((status) => {
      usePlaybackStore.getState().setStatus({ playing: status.playing, buffering: status.buffering, position: status.position, duration: status.duration, error: status.error });
      const current = usePlaybackStore.getState().queue[usePlaybackStore.getState().index];
      if (current?.source === 'local' && loadedSongId === current.id && status.duration > 0 && Math.abs(current.duration - status.duration) > 0.5) {
        usePlaybackStore.setState((state) => ({ queue: state.queue.map((song, index) => index === state.index ? { ...song, duration: status.duration } : song) }));
        void import('@/stores/local-music').then(({ useLocalMusicStore }) => useLocalMusicStore.getState().recordDuration(current.id, status.duration)).catch(() => {});
      }
      if (checkSleepTimer()) return;
      if (status.error) void checkPlaybackSession();
      if (status.ended && !finishing) {
        finishing = true;
        void next(true).finally(() => { finishing = false; });
      }
    });
    engine.subscribeRemoteNavigation((command) => {
      // Use the same queue, shuffle/repeat and previous-button semantics as the app UI.
      void (command === 'next' ? next() : previous()).catch((error: unknown) => {
        usePlaybackStore.getState().setStatus({ buffering: false, error: error instanceof Error ? error.message : '곡을 변경할 수 없습니다.' });
      });
    });
  }
  return engine;
}

async function loadIndex(index: number): Promise<void> {
  const state = usePlaybackStore.getState();
  const song = state.queue[index];
  if (!song || hiddenMatcher(useHiddenMusicStore.getState().profile.presets)(song)) { reconcilePlaybackVisibility(); return; }
  if (state.sleepTimer?.mode === 'track') cancelSleepTimer();
  const currentGeneration = ++generation;
  state.setQueue(state.queue, index);
  usePlayerBackgroundStore.getState().selectArtwork(song);
  try {
    loadedSongId = null;
    engine?.pause();
    state.setStatus({ buffering: true, playing: false });
    const source = song.source === 'local'
      ? await (await import('@/services/local-music/storage')).localSource(song)
      : await musicRepository().streamSource(song);
    if (currentGeneration !== generation) return;
    loadedSongId = song.id;
    await activeEngine().load(source, song);
  } catch (error) {
    if (currentGeneration === generation) state.setStatus({ buffering: false, playing: false, error: error instanceof Error ? error.message : '재생을 시작할 수 없습니다.' });
  }
}

export async function playQueue(queue: Song[], index = 0): Promise<void> {
  if (!queue.length || !queue[index]) return;
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  const nasReady = privacy.ready && privacy.scope === privacyScope(auth.mode, auth.session);
  const match = hiddenMatcher(privacy.profile.presets);
  const hidden = (song: Song) => song.source !== 'local' && (!nasReady || match(song));
  if (hidden(queue[index])) return;
  const visible = queue.filter((song) => !hidden(song));
  const selected = queue.slice(0, index).filter((song) => !hidden(song)).length;
  usePlaybackStore.getState().setQueue(visible, selected);
  await loadIndex(selected);
}
export async function enqueue(song: Song): Promise<void> {
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  if (song.source !== 'local' && (privacy.scope !== privacyScope(auth.mode, auth.session) || !privacy.ready || hiddenMatcher(privacy.profile.presets)(song))) return;
  const state = usePlaybackStore.getState();
  if (state.index < 0) { await playQueue([song]); return; }
  state.enqueue(song);
}
export function togglePlayback(): void {
  reconcilePlaybackVisibility();
  const state = usePlaybackStore.getState();
  if (state.index < 0) return;
  if (state.queue[state.index]?.id !== loadedSongId || (state.queue[state.index]?.source === 'local' && state.error)) { void loadIndex(state.index); return; }
  if (state.playing) activeEngine().pause(); else activeEngine().play();
}
export async function seek(seconds: number): Promise<void> {
  await activeEngine().seek(seconds);
  usePlaybackStore.getState().setStatus({ position: seconds });
}
export async function next(fromEnd = false): Promise<void> {
  if (checkSleepTimer(fromEnd)) return;
  reconcilePlaybackVisibility();
  const state = usePlaybackStore.getState();
  if (state.index < 0) return;
  if (fromEnd && state.repeat === 'one') { await seek(0); activeEngine().play(); return; }
  let index = state.index + 1;
  if (state.shuffle && state.queue.length > 1) {
    index = Math.floor(Math.random() * (state.queue.length - 1));
    if (index >= state.index) index++;
  }
  if (index >= state.queue.length) {
    if (state.repeat === 'all') index = 0;
    else { activeEngine().pause(); state.setStatus({ playing: false, position: state.duration }); return; }
  }
  await loadIndex(index);
}
export async function previous(restartCurrent = true): Promise<void> {
  reconcilePlaybackVisibility();
  const state = usePlaybackStore.getState();
  if (state.index < 0) return;
  if (restartCurrent && state.position > 3) { await seek(0); return; }
  await loadIndex(state.index > 0 ? state.index - 1 : state.repeat === 'all' ? state.queue.length - 1 : 0);
}
export function stopPlayback(): void {
  generation++;
  loadedSongId = null;
  engine?.pause();
  engine?.release();
  engine = null;
  usePlaybackStore.getState().clear();
  usePlayerBackgroundStore.getState().reset();
}

// Keep hidden tracks out of existing queues, including native previous/next commands.
export function reconcilePlaybackVisibility(excludedLocal?: (song: Song) => boolean): void {
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  const state = usePlaybackStore.getState();
  if (!state.queue.length) return;
  if (excludedLocal) {
    const current = state.queue[state.index];
    if (current && excludedLocal(current)) { stopPlayback(); return; }
    const queue = state.queue.filter(song => !excludedLocal(song));
    if (queue.length !== state.queue.length) {
      usePlaybackStore.setState({ queue, index: current ? state.queue.slice(0, state.index).filter(song => !excludedLocal(song)).length : -1 });
      reconcilePlaybackVisibility(); return;
    }
  }
  const current = state.queue[state.index];
  if (!privacy.ready || privacy.scope !== privacyScope(auth.mode, auth.session)) {
    if (current?.source !== 'local') { stopPlayback(); return; }
    const queue = state.queue.filter((song) => song.source === 'local');
    usePlaybackStore.setState({ queue, index: state.queue.slice(0, state.index).filter((song) => song.source === 'local').length });
    return;
  }
  const hidden = hiddenMatcher(privacy.profile.presets);
  if (current && hidden(current)) { stopPlayback(); return; }
  const queue = state.queue.filter((song) => !hidden(song));
  if (queue.length !== state.queue.length) usePlaybackStore.setState({ queue, index: current ? state.queue.slice(0, state.index).filter((song) => !hidden(song)).length : -1 });
}

useHiddenMusicStore.subscribe((state, previousState) => {
  if (state.ready !== previousState.ready || state.scope !== previousState.scope || state.profile.presets !== previousState.profile.presets) reconcilePlaybackVisibility();
});
