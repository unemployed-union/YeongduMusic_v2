import { ExpoAudioEngine } from './audio-engine';
import { SessionExpiredError, SynologyClient, SynologyError } from '@/services/synology/api';
import { musicRepository } from '@/features/library/repository';
import { useAuthStore } from '@/stores/auth';
import { usePlaybackStore } from '@/stores/playback';
import { usePlayerBackgroundStore } from '@/stores/player-background';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { hiddenMatcher, privacyScope } from '@/features/hidden-music/rules';
import type { Song } from '@/types/music';

let engine: ExpoAudioEngine | null = null;
let generation = 0;
let finishing = false;
let checkingSession = false;
let checkedGeneration = -1;

async function checkPlaybackSession(): Promise<void> {
  const { mode, session, generation: authGeneration, expire } = useAuthStore.getState();
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
  const currentGeneration = ++generation;
  state.setQueue(state.queue, index);
  usePlayerBackgroundStore.getState().selectArtwork(song);
  try {
    const source = await musicRepository().streamSource(song);
    if (currentGeneration !== generation) return;
    await activeEngine().load(source, song);
  } catch (error) {
    if (currentGeneration === generation) state.setStatus({ buffering: false, playing: false, error: error instanceof Error ? error.message : '재생을 시작할 수 없습니다.' });
  }
}

export async function playQueue(queue: Song[], index = 0): Promise<void> {
  if (!queue.length || !queue[index]) return;
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  if (!privacy.ready || privacy.scope !== privacyScope(auth.mode, auth.session)) return;
  const hidden = hiddenMatcher(privacy.profile.presets);
  if (hidden(queue[index])) return;
  const visible = queue.filter((song) => !hidden(song));
  const selected = queue.slice(0, index).filter((song) => !hidden(song)).length;
  usePlaybackStore.getState().setQueue(visible, selected);
  await loadIndex(selected);
}
export async function enqueue(song: Song): Promise<void> {
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  if (privacy.scope !== privacyScope(auth.mode, auth.session)) return;
  if (!useHiddenMusicStore.getState().ready || hiddenMatcher(useHiddenMusicStore.getState().profile.presets)(song)) return;
  const state = usePlaybackStore.getState();
  if (state.index < 0) { await playQueue([song]); return; }
  state.enqueue(song);
}
export function togglePlayback(): void {
  reconcilePlaybackVisibility();
  const state = usePlaybackStore.getState();
  if (state.index < 0) return;
  if (state.playing) activeEngine().pause(); else activeEngine().play();
}
export async function seek(seconds: number): Promise<void> {
  await activeEngine().seek(seconds);
  usePlaybackStore.getState().setStatus({ position: seconds });
}
export async function next(fromEnd = false): Promise<void> {
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
  engine?.pause();
  engine?.release();
  engine = null;
  usePlaybackStore.getState().clear();
  usePlayerBackgroundStore.getState().reset();
}

// Keep hidden tracks out of existing queues, including native previous/next commands.
export function reconcilePlaybackVisibility(): void {
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  const state = usePlaybackStore.getState();
  if (!state.queue.length) return;
  if (!privacy.ready || privacy.scope !== privacyScope(auth.mode, auth.session)) { stopPlayback(); return; }
  const hidden = hiddenMatcher(privacy.profile.presets);
  const current = state.queue[state.index];
  if (current && hidden(current)) { stopPlayback(); return; }
  const queue = state.queue.filter((song) => !hidden(song));
  if (queue.length !== state.queue.length) usePlaybackStore.setState({ queue, index: current ? state.queue.slice(0, state.index).filter((song) => !hidden(song)).length : -1 });
}

useHiddenMusicStore.subscribe((state, previousState) => {
  if (state.ready !== previousState.ready || state.scope !== previousState.scope || state.profile.presets !== previousState.profile.presets) reconcilePlaybackVisibility();
});
