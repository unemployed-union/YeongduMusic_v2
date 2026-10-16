import { isCloudSong, isNasSong } from '@/services/music-source';
import { cloudStreamSource } from '@/services/cloud-music/source';
import { ExpoAudioEngine } from './audio-engine';
import { SessionExpiredError, SynologyClient, SynologyError } from '@/services/synology/api';
import { musicRepository } from '@/features/library/repository';
import { useAuthStore } from '@/stores/auth';
import { usePlaybackStore, type RepeatMode, type SleepTimerStopMode } from '@/stores/playback';
import { usePlayerBackgroundStore } from '@/stores/player-background';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { hiddenMatcher, privacyScope } from '@/features/hidden-music/rules';
import type { Song } from '@/types/music';
import { createSleepTimerScheduler, sleepTimerDecision, timeSleepTimer, trackSleepTimer } from './sleep-timer';
import { MIN_SECTION_SECONDS, validateSectionPoint, validateSectionRange } from './section-repeat';
import { validatePlaybackRate } from './playback-rate';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { applyMetadata, metadataKey } from '@/features/metadata/rules';
import { useSongArtworkStore } from '@/stores/song-artwork';
import { applySongArtwork } from '@/features/artwork/rules';

let engine: ExpoAudioEngine | null = null;
export function getPlaybackAudioSessionId(): number | null {
  return engine?.getAudioSessionId() ?? null;
}
let generation = 0;
let loadedSongId: string | null = null;
let pendingSavedPosition = 0;
let finishing = false;
let checkingSession = false;
let checkedGeneration = -1;
let recoveredCloudGeneration = -1;
let sectionTimeout: ReturnType<typeof setTimeout> | null = null;
let sectionJump: object | null = null;
let sectionPauseVersion = 0;
let seekVersion = 0;
const updateSleepTimerSchedule = createSleepTimerScheduler(() => usePlaybackStore.getState().sleepTimer, () => checkSleepTimer());

function sectionContext() {
  const state = usePlaybackStore.getState(), song = state.queue[state.index];
  if (!song || song.id !== loadedSongId) throw new Error('먼저 곡을 재생한 뒤 구간을 설정해 주세요.');
  return { state, song, duration: state.duration || song.duration };
}

export function setSectionRepeatStart(position = getPlaybackPosition()): void {
  const { state, song, duration } = sectionContext();
  validateSectionPoint(position, duration);
  if (duration - position < MIN_SECTION_SECONDS) throw new Error('시작점 A는 곡이 끝나기 최소 0.5초 전에 설정해 주세요.');
  state.setSectionRepeat({ songId: song.id, start: position, end: null, enabled: false });
}

export function startSectionRepeat(start: number, end: number): void {
  const { state, song, duration } = sectionContext();
  validateSectionRange(start, end, duration);
  if (state.sleepTimer?.mode === 'track') throw new Error('현재 곡 종료 수면 타이머를 해제한 뒤 구간 반복을 켜 주세요.');
  state.setSectionRepeat({ songId: song.id, start, end, enabled: true });
  checkSectionRepeat();
}

export function setSectionRepeatEnd(position = getPlaybackPosition()): void {
  const { state, song } = sectionContext();
  if (state.sectionRepeat?.songId !== song.id) throw new Error('시작점 A를 먼저 설정해 주세요.');
  startSectionRepeat(state.sectionRepeat.start, position);
}

export function toggleSectionRepeat(): void {
  const { state } = sectionContext(), repeat = state.sectionRepeat;
  if (!repeat || repeat.end === null) throw new Error('시작점 A와 종료점 B를 먼저 설정해 주세요.');
  if (repeat.enabled) state.setSectionRepeat({ ...repeat, enabled: false });
  else startSectionRepeat(repeat.start, repeat.end);
}

export function cancelSectionRepeat(): void {
  usePlaybackStore.getState().setSectionRepeat(null);
}

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

/** Poll only an active A–B range; the rest of the app keeps its normal status cadence. */
function scheduleSectionRepeat(): void {
  if (sectionTimeout !== null) clearTimeout(sectionTimeout);
  sectionTimeout = null;
  const state = usePlaybackStore.getState(), repeat = state.sectionRepeat;
  if (!repeat?.enabled || repeat.end === null || !state.playing || state.buffering || state.error
    || repeat.songId !== loadedSongId || repeat.songId !== state.queue[state.index]?.id || sectionJump) return;
  const delay = Math.min(250, Math.max(20, (repeat.end - getPlaybackPosition()) * 1000 / state.playbackRate));
  sectionTimeout = setTimeout(() => {
    sectionTimeout = null;
    checkSectionRepeat();
    scheduleSectionRepeat();
  }, delay);
}

function checkSectionRepeat(fromEnd = false): boolean {
  const state = usePlaybackStore.getState(), repeat = state.sectionRepeat, currentEngine = engine;
  if (!repeat?.enabled || repeat.end === null || !currentEngine || state.error || state.buffering
    || repeat.songId !== loadedSongId || repeat.songId !== state.queue[state.index]?.id || (!state.playing && !fromEnd)) return false;
  if (checkSleepTimer(fromEnd)) return true;
  if (usePlaybackStore.getState().sectionRepeat !== repeat) return false;
  if (sectionJump) return true;
  const position = getPlaybackPosition();
  if (!fromEnd && position >= repeat.start && position < repeat.end) return false;
  const requestGeneration = generation, pauseVersion = sectionPauseVersion, requestSeek = ++seekVersion, jump = {};
  sectionJump = jump;
  if (sectionTimeout !== null) clearTimeout(sectionTimeout);
  sectionTimeout = null;
  void currentEngine.seek(repeat.start, true).then(() => {
    const latest = usePlaybackStore.getState();
    if (requestGeneration !== generation || requestSeek !== seekVersion || latest.sectionRepeat !== repeat || pauseVersion !== sectionPauseVersion) return;
    latest.setStatus({ position: repeat.start });
    if (fromEnd && !checkSleepTimer(true)) currentEngine.play();
  }).catch(() => {
    if (requestGeneration !== generation || requestSeek !== seekVersion || usePlaybackStore.getState().sectionRepeat !== repeat) return;
    usePlaybackStore.getState().setSectionRepeat({ ...repeat, enabled: false });
    usePlaybackStore.getState().setStatus({ error: '구간 반복 위치로 이동하지 못했습니다. 다시 설정해 주세요.' });
  }).finally(() => {
    if (sectionJump === jump) sectionJump = null;
    scheduleSectionRepeat();
  });
  return true;
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
  const decision = sleepTimerDecision(state.sleepTimer, { ...state, songId: state.queue[state.index]?.id, loadedSongId }, fromEnd, changingTrack);
  if (decision.kind === 'keep') return false;
  if (decision.kind === 'arm') { state.setSleepTimer(decision.timer); return false; }
  generation++;
  state.setSleepTimer(null);
  engine?.pause();
  state.setStatus({ playing: false, buffering: false });
  return true;
}
usePlaybackStore.subscribe((state, previousState) => {
  const song = state.queue[state.index], previous = previousState.queue[previousState.index];
  // Restored/paused queues can receive artwork edits before a native source exists.
  if (song && (song.id !== previous?.id || song.artworkUrl !== previous.artworkUrl || song.palette !== previous.palette)) {
    usePlayerBackgroundStore.getState().selectArtwork(song);
  }
  if (song && song.id === loadedSongId && previous?.id === song.id
    && (song.title !== previous.title || song.artist !== previous.artist || song.album !== previous.album || song.artworkUrl !== previous.artworkUrl)) {
    try { engine?.updateMetadata?.(song); } catch { /* A lock-screen refresh cannot invalidate saved song metadata. */ }
  }
  if (state.sleepTimer !== previousState.sleepTimer) updateSleepTimerSchedule(state.sleepTimer);
  if (!state.playing && previousState.playing) sectionPauseVersion++;
  // Finish-track timers must be able to reach the actual end of the song.
  if (state.sleepTimer?.mode === 'track' && state.sectionRepeat?.enabled) {
    state.setSectionRepeat({ ...state.sectionRepeat, enabled: false });
  }
  if (state.sectionRepeat !== previousState.sectionRepeat || state.playing !== previousState.playing
    || state.buffering !== previousState.buffering || state.error !== previousState.error || state.playbackRate !== previousState.playbackRate || song?.id !== previous?.id) scheduleSectionRepeat();
});

function currentMetadata(song: Song): Song {
  const metadata = useSongMetadataStore.getState(), auth = useAuthStore.getState();
  const key = metadataKey(song, privacyScope(auth.mode, auth.session));
  const updated = metadata.ready && !metadata.loadError ? applyMetadata(song, key ? metadata.patches[key] : undefined) : song;
  const artwork = useSongArtworkStore.getState();
  return artwork.ready && !artwork.loadError ? applySongArtwork(updated, key ? artwork.patches[key] : undefined, artwork.baseUri) : updated;
}
function reconcileMetadataQueue(): void {
  const state = usePlaybackStore.getState(), queue = state.queue.map(currentMetadata);
  if (queue.some((song, index) => song !== state.queue[index])) usePlaybackStore.setState({ queue });
}
useSongMetadataStore.subscribe((state, previous) => {
  if (state.ready && (state.patches !== previous.patches || state.ready !== previous.ready)) reconcileMetadataQueue();
});
useSongArtworkStore.subscribe((state, previous) => {
  if (state.ready && (state.patches !== previous.patches || state.ready !== previous.ready)) reconcileMetadataQueue();
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
      const source = await cloudStreamSource(song, true);
      if (requestGeneration !== generation) return;
      await activeEngine().load(source, song);
      if (requestGeneration !== generation) return;
      await activeEngine().seek(playback.position);
    } catch (error) {
      if (requestGeneration === generation) usePlaybackStore.getState().setStatus({ playing: false, buffering: false, error: error instanceof Error ? error.message : '클라우드 음악 재생 연결을 확인해 주세요.' });
    }
    return;
  }
  if (checkingSession || checkedGeneration === generation || mode !== 'nas' || !session) return;
  checkingSession = true;
  checkedGeneration = generation;
  try { await new SynologyClient(session).checkSession(); }
  catch (error) { if (error instanceof SessionExpiredError || (error instanceof SynologyError && error.code === 105)) await expire(session, authGeneration); }
  finally { checkingSession = false; }
}

function activeEngine(): ExpoAudioEngine {
  if (!engine) {
    const state = usePlaybackStore.getState();
    engine = new ExpoAudioEngine(state.playbackRate, state.preservePitch);
    engine.subscribe((status) => {
      usePlaybackStore.getState().setStatus({ playing: status.playing, buffering: status.buffering, position: status.position, duration: status.duration, error: status.error });
      const current = usePlaybackStore.getState().queue[usePlaybackStore.getState().index];
      if (current?.source === 'local' && loadedSongId === current.id && status.duration > 0 && Math.abs(current.duration - status.duration) > 0.5) {
        usePlaybackStore.setState((state) => ({ queue: state.queue.map((song, index) => index === state.index ? { ...song, duration: status.duration } : song) }));
        void import('@/stores/local-music').then(({ useLocalMusicStore }) => useLocalMusicStore.getState().recordDuration(current.id, status.duration)).catch(() => {});
      }
      if (current?.source === 's3' && loadedSongId === current.id && status.duration > 0 && Math.abs(current.duration - status.duration) > 0.5) {
        usePlaybackStore.setState(state => ({ queue: state.queue.map((song, index) => index === state.index ? { ...song, duration: status.duration } : song) }));
      }
      if (checkSleepTimer()) return;
      if (status.error) void checkPlaybackSession();
      if (checkSectionRepeat(status.ended)) return;
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

async function loadIndex(index: number, initialPosition = 0): Promise<void> {
  reconcileMetadataQueue();
  const state = usePlaybackStore.getState();
  const song = state.queue[index];
  if (!song || hiddenMatcher(useHiddenMusicStore.getState().profile.presets)(song)) { reconcilePlaybackVisibility(); return; }
  if (state.sleepTimer?.mode === 'track' && !state.sleepTimer.afterDeadline) cancelSleepTimer();
  const currentGeneration = ++generation;
  sectionJump = null;
  pendingSavedPosition = 0;
  state.setQueue(state.queue, index);
  if (initialPosition > 0) state.setStatus({ position: initialPosition });
  usePlayerBackgroundStore.getState().selectArtwork(song);
  try {
    loadedSongId = null;
    engine?.pause(true);
    state.setStatus({ buffering: true, playing: false });
    const source = song.source === 'local'
      ? await (await import('@/services/local-music/storage')).localSource(song)
      : isCloudSong(song) ? await cloudStreamSource(song)
      : await musicRepository().streamSource(song);
    if (currentGeneration !== generation) return;
    loadedSongId = song.id;
    const currentSong = usePlaybackStore.getState().queue[index];
    await activeEngine().load(source, currentSong, initialPosition);
    if (currentGeneration !== generation) return;
    const latest = usePlaybackStore.getState().queue[index];
    if (latest && latest !== currentSong) {
      try { engine?.updateMetadata?.(latest); } catch { /* Keep audio loading independent of lock-screen label updates. */ }
    }
  } catch (error) {
    if (currentGeneration === generation) {
      engine?.pause();
      state.setStatus({ buffering: false, playing: false, error: error instanceof Error ? error.message : '재생을 시작할 수 없습니다.' });
    }
  }
}

/** Restore only when there is no newer user-selected queue. The native source is rebuilt with current credentials. */
export async function restorePlayback(queue: Song[], index: number, position: number, wasPlaying: boolean, shuffle: boolean, repeat: RepeatMode, playbackRate = 1, preservePitch = true): Promise<boolean> {
  if (usePlaybackStore.getState().queue.length || !queue[index]) return false;
  validatePlaybackRate(playbackRate);
  setPlaybackRate(playbackRate);
  setPreservePitch(preservePitch);
  const state = usePlaybackStore.getState();
  state.setQueue(queue.map(currentMetadata), index);
  usePlaybackStore.setState({ shuffle, repeat });
  usePlayerBackgroundStore.getState().selectArtwork(usePlaybackStore.getState().queue[index]);
  if (wasPlaying) await loadIndex(index, position);
  else {
    pendingSavedPosition = position;
    state.setStatus({ position, playing: false, buffering: false });
  }
  return usePlaybackStore.getState().queue[usePlaybackStore.getState().index]?.id === queue[index].id;
}

export async function playQueue(queue: Song[], index = 0): Promise<void> {
  if (!queue.length || !queue[index] || checkSleepTimer(false, true)) return;
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  const nasReady = privacy.ready && privacy.scope === privacyScope(auth.mode, auth.session);
  const match = hiddenMatcher(privacy.profile.presets);
  const hidden = (song: Song) => isNasSong(song) && (!nasReady || match(song));
  if (hidden(queue[index])) return;
  const visible = queue.filter((song) => !hidden(song));
  const selected = queue.slice(0, index).filter((song) => !hidden(song)).length;
  usePlaybackStore.getState().setQueue(visible.map(currentMetadata), selected);
  await loadIndex(selected);
}
export async function enqueue(song: Song): Promise<void> {
  const privacy = useHiddenMusicStore.getState();
  const auth = useAuthStore.getState();
  if (isNasSong(song) && (privacy.scope !== privacyScope(auth.mode, auth.session) || !privacy.ready || hiddenMatcher(privacy.profile.presets)(song))) return;
  const state = usePlaybackStore.getState();
  if (state.index < 0) { await playQueue([song]); return; }
  state.enqueue(currentMetadata(song));
}
export function togglePlayback(): void {
  reconcilePlaybackVisibility();
  const state = usePlaybackStore.getState();
  if (state.index < 0) return;
  if (state.queue[state.index]?.id !== loadedSongId || ((state.queue[state.index]?.source === 'local' || state.queue[state.index]?.source === 'drive' || state.queue[state.index]?.source === 's3') && state.error)) { void loadIndex(state.index, pendingSavedPosition); return; }
  if (state.playing) activeEngine().pause(); else activeEngine().play();
}
export function getPlaybackPosition(): number {
  return engine?.getPosition() ?? usePlaybackStore.getState().position;
}

export async function seek(seconds: number): Promise<void> {
  const state = usePlaybackStore.getState(), repeat = state.sectionRepeat;
  const requestedGeneration = generation;
  const requestSeek = ++seekVersion;
  const target = repeat?.enabled && repeat.end !== null ? Math.max(repeat.start, Math.min(seconds, repeat.end - 0.01)) : seconds;
  await activeEngine().seek(target, !!repeat?.enabled);
  if (requestedGeneration !== generation || requestSeek !== seekVersion) return;
  usePlaybackStore.getState().setStatus({ position: target });
  scheduleSectionRepeat();
}
export async function next(fromEnd = false): Promise<void> {
  if (checkSleepTimer(fromEnd, !fromEnd)) return;
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
  if (state.index < 0 || checkSleepTimer(false, !(restartCurrent && state.position > 3))) return;
  if (restartCurrent && state.position > 3) { await seek(0); return; }
  await loadIndex(state.index > 0 ? state.index - 1 : state.repeat === 'all' ? state.queue.length - 1 : 0);
}
export function stopNasPlayback(): void {
  const state = usePlaybackStore.getState();
  const song = state.queue[state.index];
  if (song && isNasSong(song)) stopPlayback();
}
export function stopPlayback(): void {
  generation++;
  sectionJump = null;
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
    if (current && excludedLocal(current)) { stopPlayback(); return; }
    const queue = state.queue.filter(song => !excludedLocal(song));
    if (queue.length !== state.queue.length) {
      usePlaybackStore.setState({ queue, index: current ? state.queue.slice(0, state.index).filter(song => !excludedLocal(song)).length : -1 });
      reconcilePlaybackVisibility(); return;
    }
  }
  const current = state.queue[state.index];
  if (!privacy.ready || privacy.scope !== privacyScope(auth.mode, auth.session)) {
    if ((!current || isNasSong(current))) { stopPlayback(); return; }
    const queue = state.queue.filter((song) => !isNasSong(song));
    usePlaybackStore.setState({ queue, index: state.queue.slice(0, state.index).filter((song) => !isNasSong(song)).length });
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
