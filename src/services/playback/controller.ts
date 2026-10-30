import { filterPlaybackQueue } from './queue';
import { isCloudSong, isNasSong } from '@/services/music-source';
import { resolvePlaybackSource } from './source';
import { isLosslessPlayback } from './lossless';
import { ExpoAudioEngine, type AudioEngine } from './audio-engine';
import { SessionExpiredError, SynologyClient, SynologyError } from '@/services/synology/api';
import { useAuthStore } from '@/stores/auth';
import { usePlaybackStore, type RepeatMode, type SleepTimerStopMode } from '@/stores/playback';
import { usePlayerBackgroundStore } from '@/stores/player-background';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { hiddenMatcher, privacyScope } from '@/features/hidden-music/rules';
import type { Song } from '@/types/music';
import {
  createSleepTimerScheduler,
  sleepTimerDecision,
  timeSleepTimer,
  trackSleepTimer,
} from './sleep-timer';
import { createSectionRepeatController } from './section-repeat-controller';
import { validatePlaybackRate } from './playback-rate';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { applyMetadata, metadataKey } from '@/features/metadata/rules';
import { useSongArtworkStore } from '@/stores/song-artwork';
import { applySongArtwork } from '@/features/artwork/rules';

let engine: AudioEngine | null = null;
export function getPlaybackAudioSessionId(): number | null {
  return engine?.getAudioSessionId() ?? null;
}
let generation = 0;
let sourceRequest: AbortController | null = null;
let loadedSongId: string | null = null;
let pendingSavedPosition = 0;
let transportRevision = 0;
let finishing = false;
let checkingSession = false;
let checkedGeneration = -1;
let recoveredCloudGeneration = -1;
const sectionRepeat = createSectionRepeatController({
  getLoadedSongId: () => loadedSongId,
  getGeneration: () => generation,
  getPosition: getPlaybackPosition,
  getEngine: () => engine,
  checkSleepTimer,
});
export const setSectionRepeatStart = sectionRepeat.setStart;
export const startSectionRepeat = sectionRepeat.start;
export const setSectionRepeatEnd = sectionRepeat.setEnd;
export const toggleSectionRepeat = sectionRepeat.toggle;
export const cancelSectionRepeat = sectionRepeat.cancel;
const updateSleepTimerSchedule = createSleepTimerScheduler(
  () => usePlaybackStore.getState().sleepTimer,
  () => checkSleepTimer(),
);

export function setPlaybackRate(rate: number): void {
  validatePlaybackRate(rate);
  // Publish the choice only after the native player accepts it.
  engine?.setPlaybackRate(rate);
  usePlaybackStore.getState().setPlaybackRate(rate);
}

export function setPreservePitch(preserve: boolean): void {
  engine?.setPreservePitch(preserve);
  usePlaybackStore.getState().setPreservePitch(preserve);
}

export function cancelSleepTimer(): void {
  usePlaybackStore.getState().setSleepTimer(null);
}
export function startSleepTimer(minutes: number, stopMode: SleepTimerStopMode = 'immediate'): void {
  const state = usePlaybackStore.getState();
  state.setSleepTimer(timeSleepTimer(minutes, stopMode, !!state.queue[state.index]));
}
export function stopAfterCurrentTrack(): void {
  const state = usePlaybackStore.getState();
  state.setSleepTimer(trackSleepTimer(state.queue[state.index]?.id));
}
/** Apply timer decisions here so source-load generation remains owned by the controller. */
export function checkSleepTimer(fromEnd = false, changingTrack = false): boolean {
  const state = usePlaybackStore.getState();
  const decision = sleepTimerDecision(
    state.sleepTimer,
    { ...state, songId: state.queue[state.index]?.id, loadedSongId },
    fromEnd,
    changingTrack,
  );
  if (decision.kind === 'keep') return false;
  if (decision.kind === 'arm') {
    state.setSleepTimer(decision.timer);
    return false;
  }
  generation++;
  sourceRequest?.abort();
  state.setSleepTimer(null);
  engine?.pause();
  state.setStatus({ playing: false, buffering: false });
  return true;
}
usePlaybackStore.subscribe((state, previousState) => {
  const song = state.queue[state.index],
    previous = previousState.queue[previousState.index];
  // Restored/paused queues can receive artwork edits before a native source exists.
  if (
    song &&
    (song.id !== previous?.id ||
      song.artworkUrl !== previous.artworkUrl ||
      song.palette !== previous.palette)
  ) {
    usePlayerBackgroundStore.getState().selectArtwork(song);
  }
  if (
    song &&
    song.id === loadedSongId &&
    previous?.id === song.id &&
    (song.title !== previous.title ||
      song.artist !== previous.artist ||
      song.album !== previous.album ||
      song.artworkUrl !== previous.artworkUrl)
  ) {
    try {
      engine?.updateMetadata?.(song);
    } catch {
      /* A lock-screen refresh cannot invalidate saved song metadata. */
    }
  }
  if (state.sleepTimer !== previousState.sleepTimer) updateSleepTimerSchedule(state.sleepTimer);
  sectionRepeat.onStateChange(state, previousState);
});

function currentMetadata(song: Song): Song {
  const metadata = useSongMetadataStore.getState(),
    auth = useAuthStore.getState();
  const key = metadataKey(song, privacyScope(auth.mode, auth.session));
  const updated =
    metadata.ready && !metadata.loadError
      ? applyMetadata(song, key ? metadata.patches[key] : undefined)
      : song;
  const artwork = useSongArtworkStore.getState();
  return artwork.ready && !artwork.loadError
    ? applySongArtwork(updated, key ? artwork.patches[key] : undefined, artwork.baseUri)
    : updated;
}
function reconcileMetadataQueue(): void {
  const state = usePlaybackStore.getState(),
    queue = state.queue.map(currentMetadata);
  if (queue.some((song, index) => song !== state.queue[index]))
    usePlaybackStore.setState({ queue });
}
useSongMetadataStore.subscribe((state, previous) => {
  if (state.ready && (state.patches !== previous.patches || state.ready !== previous.ready))
    reconcileMetadataQueue();
});
useSongArtworkStore.subscribe((state, previous) => {
  if (state.ready && (state.patches !== previous.patches || state.ready !== previous.ready))
    reconcileMetadataQueue();
});

async function checkPlaybackSession(): Promise<void> {
  const { mode, session, generation: authGeneration, expire } = useAuthStore.getState();
  const playback = usePlaybackStore.getState();
  const song = playback.queue[playback.index];
  if (song?.source === 'local') return;
  if (song && isCloudSong(song)) {
    if (recoveredCloudGeneration === generation || loadedSongId !== song.id) return;
    const requestGeneration = generation;
    recoveredCloudGeneration = requestGeneration;
    try {
      const source = await resolvePlaybackSource(song, {
        refreshCredentials: true,
        signal: sourceRequest?.signal,
      });
      if (requestGeneration !== generation) return;
      usePlaybackStore.getState().setStatus({ lossless: isLosslessPlayback(song, source) });
      await activeEngine().load(source, song);
      if (requestGeneration !== generation) return;
      await activeEngine().seek(playback.position);
    } catch (error) {
      if (requestGeneration === generation)
        usePlaybackStore.getState().setStatus({
          playing: false,
          buffering: false,
          error:
            error instanceof Error ? error.message : '클라우드 음악 재생 연결을 확인해 주세요.',
        });
    }
    return;
  }
  if (checkingSession || checkedGeneration === generation || mode !== 'nas' || !session) return;
  checkingSession = true;
  checkedGeneration = generation;
  try {
    await new SynologyClient(session).checkSession();
  } catch (error) {
    if (
      error instanceof SessionExpiredError ||
      (error instanceof SynologyError && error.code === 105)
    )
      await expire(session, authGeneration);
  } finally {
    checkingSession = false;
  }
}

function activeEngine(): AudioEngine {
  if (!engine) {
    const state = usePlaybackStore.getState();
    engine = new ExpoAudioEngine(state.playbackRate, state.preservePitch);
    engine.subscribe((status) => {
      const playback = usePlaybackStore.getState();
      // loadIndex clears this identity before pausing the old source. Its final
      // status must not overwrite the next song's position or saved duration.
      if (!loadedSongId || playback.queue[playback.index]?.id !== loadedSongId) return;
      usePlaybackStore.getState().setStatus({
        playing: status.playing,
        buffering: status.buffering,
        position: status.position,
        duration: status.duration,
        error: status.error,
      });
      const current = usePlaybackStore.getState().queue[usePlaybackStore.getState().index];
      if (
        current?.source === 'local' &&
        loadedSongId === current.id &&
        status.duration > 0 &&
        Math.abs(current.duration - status.duration) > 0.5
      ) {
        usePlaybackStore.setState((state) => ({
          queue: state.queue.map((song, index) =>
            index === state.index ? { ...song, duration: status.duration } : song,
          ),
        }));
        void import('@/stores/local-music')
          .then(({ useLocalMusicStore }) =>
            useLocalMusicStore.getState().recordDuration(current.id, status.duration),
          )
          .catch(() => {});
      }
      if (
        (current?.source === 's3' || current?.source === 'mybox') &&
        loadedSongId === current.id &&
        status.duration > 0 &&
        Math.abs(current.duration - status.duration) > 0.5
      ) {
        usePlaybackStore.setState((state) => ({
          queue: state.queue.map((song, index) =>
            index === state.index ? { ...song, duration: status.duration } : song,
          ),
        }));
      }
      if (checkSleepTimer()) return;
      if (status.error) void checkPlaybackSession();
      if (sectionRepeat.check(status.ended)) return;
      if (status.ended && !finishing) {
        finishing = true;
        void next(true).finally(() => {
          finishing = false;
        });
      }
    });
    engine.subscribeRemoteNavigation((command) => {
      // Use the same queue, shuffle/repeat and previous-button semantics as the app UI.
      void (command === 'next' ? next() : previous()).catch((error: unknown) => {
        usePlaybackStore.getState().setStatus({
          buffering: false,
          error: error instanceof Error ? error.message : '곡을 변경할 수 없습니다.',
        });
      });
    });
  }
  return engine;
}

async function loadIndex(index: number, initialPosition = 0): Promise<void> {
  reconcileMetadataQueue();
  const state = usePlaybackStore.getState();
  const song = state.queue[index];
  if (!song || hiddenMatcher(useHiddenMusicStore.getState().profile.presets)(song)) {
    reconcilePlaybackVisibility();
    return;
  }
  if (state.sleepTimer?.mode === 'track' && !state.sleepTimer.afterDeadline) cancelSleepTimer();
  const currentGeneration = ++generation;
  sourceRequest?.abort();
  sourceRequest = new AbortController();
  sectionRepeat.resetPending();
  pendingSavedPosition = 0;
  state.setQueue(state.queue, index);
  if (initialPosition > 0) state.setStatus({ position: initialPosition });
  usePlayerBackgroundStore.getState().selectArtwork(song);
  try {
    loadedSongId = null;
    engine?.pause(true);
    state.setStatus({ buffering: true, playing: false });
    const source = await resolvePlaybackSource(song, { signal: sourceRequest.signal });
    if (currentGeneration !== generation) return;
    loadedSongId = song.id;
    const currentSong = usePlaybackStore.getState().queue[index];
    state.setStatus({ lossless: isLosslessPlayback(currentSong, source) });
    await activeEngine().load(source, currentSong, initialPosition);
    if (currentGeneration !== generation) return;
    const latest = usePlaybackStore.getState().queue[index];
    if (latest && latest !== currentSong) {
      try {
        engine?.updateMetadata?.(latest);
      } catch {
        /* Keep audio loading independent of lock-screen label updates. */
      }
    }
  } catch (error) {
    if (currentGeneration === generation) {
      engine?.pause();
      state.setStatus({
        buffering: false,
        playing: false,
        error: error instanceof Error ? error.message : '재생을 시작할 수 없습니다.',
      });
    }
  }
}

/** Restore only when there is no newer user-selected queue. The native source is rebuilt with current credentials. */
export async function restorePlayback(
  queue: Song[],
  index: number,
  position: number,
  wasPlaying: boolean,
  shuffle: boolean,
  repeat: RepeatMode,
  playbackRate = 1,
  preservePitch = true,
): Promise<boolean> {
  if (usePlaybackStore.getState().queue.length || !queue[index]) return false;
  validatePlaybackRate(playbackRate);
  setPlaybackRate(playbackRate);
  setPreservePitch(preservePitch);
  const state = usePlaybackStore.getState();
  state.setQueue(queue.map(currentMetadata), index);
  usePlaybackStore.setState({ shuffle, repeat });
  const restoredSong = usePlaybackStore.getState().queue[index];
  usePlayerBackgroundStore.getState().selectArtwork(restoredSong);
  if (wasPlaying) await loadIndex(index, position);
  else {
    pendingSavedPosition = position;
    state.setStatus({
      position,
      duration: restoredSong.duration,
      playing: false,
      buffering: false,
    });
  }
  return (
    usePlaybackStore.getState().queue[usePlaybackStore.getState().index]?.id === queue[index].id
  );
}

export async function playQueue(queue: Song[], index = 0): Promise<void> {
  if (!queue.length || !queue[index] || checkSleepTimer(false, true)) return;
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  const nasReady = privacy.ready && privacy.scope === privacyScope(auth.mode, auth.session);
  const match = hiddenMatcher(privacy.profile.presets);
  const hidden = (song: Song) => isNasSong(song) && (!nasReady || match(song));
  if (hidden(queue[index])) return;
  const { queue: visible, index: selected } = filterPlaybackQueue(
    queue,
    index,
    (song) => !hidden(song),
  );
  usePlaybackStore.getState().setQueue(visible.map(currentMetadata), selected);
  await loadIndex(selected);
}
export async function enqueue(song: Song): Promise<void> {
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  if (
    isNasSong(song) &&
    (privacy.scope !== privacyScope(auth.mode, auth.session) ||
      !privacy.ready ||
      hiddenMatcher(privacy.profile.presets)(song))
  )
    return;
  const state = usePlaybackStore.getState();
  if (state.index < 0) {
    await playQueue([song]);
    return;
  }
  state.enqueue(currentMetadata(song));
}
export function togglePlayback(): void {
  transportRevision++;
  reconcilePlaybackVisibility();
  const state = usePlaybackStore.getState();
  if (state.index < 0) return;
  if (
    state.queue[state.index]?.id !== loadedSongId ||
    ((state.queue[state.index]?.source === 'local' || isCloudSong(state.queue[state.index])) &&
      state.error)
  ) {
    void loadIndex(state.index, pendingSavedPosition);
    return;
  }
  if (state.playing) activeEngine().pause();
  else activeEngine().play();
}
export function getPlaybackPosition(): number {
  return engine?.getPosition() ?? usePlaybackStore.getState().position;
}

export async function seek(seconds: number, playIfPaused = false): Promise<void> {
  const state = usePlaybackStore.getState(),
    repeat = state.sectionRepeat;
  if (!state.queue[state.index] || !Number.isFinite(seconds)) return;
  const shouldPlay = playIfPaused && !state.playing && !state.buffering;
  const requestedTransportRevision = transportRevision;
  const requestedGeneration = generation;
  const requestSeek = sectionRepeat.beginSeek();
  const target =
    repeat?.enabled && repeat.end !== null
      ? Math.max(repeat.start, Math.min(seconds, repeat.end - 0.01))
      : seconds;
  // A restored paused queue has no loaded source. Update the pending position
  // before optionally opening the source for an explicit seek-and-play request.
  if (!state.buffering && state.queue[state.index].id !== loadedSongId) {
    pendingSavedPosition = Math.max(
      0,
      state.duration > 0 ? Math.min(target, state.duration) : target,
    );
    state.setStatus({ position: pendingSavedPosition });
    if (shouldPlay) await loadIndex(state.index, pendingSavedPosition);
    return;
  }
  await activeEngine().seek(target, !!repeat?.enabled);
  if (requestedGeneration !== generation || !sectionRepeat.isCurrentSeek(requestSeek)) return;
  usePlaybackStore.getState().setStatus({ position: target });
  if (
    shouldPlay &&
    requestedTransportRevision === transportRevision &&
    !usePlaybackStore.getState().playing
  )
    togglePlayback();
  sectionRepeat.schedule();
}
export async function next(fromEnd = false): Promise<void> {
  if (checkSleepTimer(fromEnd, !fromEnd)) return;
  reconcilePlaybackVisibility();
  const state = usePlaybackStore.getState();
  if (state.index < 0) return;
  if (fromEnd && state.repeat === 'one') {
    await seek(0);
    activeEngine().play();
    return;
  }
  let index = state.index + 1;
  if (state.shuffle && state.queue.length > 1) {
    index = Math.floor(Math.random() * (state.queue.length - 1));
    if (index >= state.index) index++;
  }
  if (index >= state.queue.length) {
    if (state.repeat === 'all') index = 0;
    else {
      activeEngine().pause();
      state.setStatus({ playing: false, position: state.duration });
      return;
    }
  }
  await loadIndex(index);
}
export async function previous(restartCurrent = true): Promise<void> {
  reconcilePlaybackVisibility();
  const state = usePlaybackStore.getState();
  if (state.index < 0 || checkSleepTimer(false, !(restartCurrent && state.position > 3))) return;
  if (restartCurrent && state.position > 3) {
    await seek(0);
    return;
  }
  await loadIndex(
    state.index > 0 ? state.index - 1 : state.repeat === 'all' ? state.queue.length - 1 : 0,
  );
}
export function stopNasPlayback(): void {
  const state = usePlaybackStore.getState();
  const song = state.queue[state.index];
  if (song && isNasSong(song)) stopPlayback();
}
export function stopPlayback(): void {
  generation++;
  sourceRequest?.abort();
  sectionRepeat.resetPending();
  loadedSongId = null;
  pendingSavedPosition = 0;
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
    if (current && excludedLocal(current)) {
      stopPlayback();
      return;
    }
    const { queue, index } = filterPlaybackQueue(
      state.queue,
      state.index,
      (song) => !excludedLocal(song),
    );
    if (queue.length !== state.queue.length) {
      usePlaybackStore.setState({ queue, index });
      reconcilePlaybackVisibility();
      return;
    }
  }
  const current = state.queue[state.index];
  if (!privacy.ready || privacy.scope !== privacyScope(auth.mode, auth.session)) {
    if (!current || isNasSong(current)) {
      stopPlayback();
      return;
    }
    usePlaybackStore.setState(
      filterPlaybackQueue(state.queue, state.index, (song) => !isNasSong(song)),
    );
    return;
  }
  const hidden = hiddenMatcher(privacy.profile.presets);
  if (current && hidden(current)) {
    stopPlayback();
    return;
  }
  const filtered = filterPlaybackQueue(state.queue, state.index, (song) => !hidden(song));
  if (filtered.queue.length !== state.queue.length) usePlaybackStore.setState(filtered);
}

useHiddenMusicStore.subscribe((state, previousState) => {
  if (
    state.ready !== previousState.ready ||
    state.scope !== previousState.scope ||
    state.profile.presets !== previousState.profile.presets
  )
    reconcilePlaybackVisibility();
});
