import { usePlaybackStore } from '@/stores/playback';
import type { AudioEngine } from './audio-engine';
import { MIN_SECTION_SECONDS, validateSectionPoint, validateSectionRange } from './section-repeat';

interface Runtime {
  getLoadedSongId(): string | null;
  getGeneration(): number;
  getPosition(): number;
  getEngine(): AudioEngine | null;
  checkSleepTimer(fromEnd?: boolean): boolean;
}

/** Own A–B scheduling and stale seeks without owning the playback engine/session. */
export function createSectionRepeatController({
  getLoadedSongId,
  getGeneration,
  getPosition,
  getEngine,
  checkSleepTimer,
}: Runtime) {
  let sectionTimeout: ReturnType<typeof setTimeout> | null = null;
  let sectionJump: object | null = null;
  let sectionPauseVersion = 0;
  let seekVersion = 0;
  function sectionContext() {
    const state = usePlaybackStore.getState(),
      song = state.queue[state.index];
    if (!song || song.id !== getLoadedSongId())
      throw new Error('먼저 곡을 재생한 뒤 구간을 설정해 주세요.');
    return { state, song, duration: state.duration || song.duration };
  }

  function setSectionRepeatStart(position = getPosition()): void {
    const { state, song, duration } = sectionContext();
    validateSectionPoint(position, duration);
    if (duration - position < MIN_SECTION_SECONDS)
      throw new Error('시작점 A는 곡이 끝나기 최소 0.5초 전에 설정해 주세요.');
    state.setSectionRepeat({ songId: song.id, start: position, end: null, enabled: false });
  }

  function startSectionRepeat(start: number, end: number): void {
    const { state, song, duration } = sectionContext();
    validateSectionRange(start, end, duration);
    if (state.sleepTimer?.mode === 'track')
      throw new Error('현재 곡 종료 수면 타이머를 해제한 뒤 구간 반복을 켜 주세요.');
    state.setSectionRepeat({ songId: song.id, start, end, enabled: true });
    checkSectionRepeat();
  }

  function setSectionRepeatEnd(position = getPosition()): void {
    const { state, song } = sectionContext();
    if (state.sectionRepeat?.songId !== song.id) throw new Error('시작점 A를 먼저 설정해 주세요.');
    startSectionRepeat(state.sectionRepeat.start, position);
  }

  function toggleSectionRepeat(): void {
    const { state } = sectionContext(),
      repeat = state.sectionRepeat;
    if (!repeat || repeat.end === null)
      throw new Error('시작점 A와 종료점 B를 먼저 설정해 주세요.');
    if (repeat.enabled) state.setSectionRepeat({ ...repeat, enabled: false });
    else startSectionRepeat(repeat.start, repeat.end);
  }

  function cancelSectionRepeat(): void {
    usePlaybackStore.getState().setSectionRepeat(null);
  }

  function scheduleSectionRepeat(): void {
    if (sectionTimeout !== null) clearTimeout(sectionTimeout);
    sectionTimeout = null;
    const state = usePlaybackStore.getState(),
      repeat = state.sectionRepeat;
    if (
      !repeat?.enabled ||
      repeat.end === null ||
      !state.playing ||
      state.buffering ||
      state.error ||
      repeat.songId !== getLoadedSongId() ||
      repeat.songId !== state.queue[state.index]?.id ||
      sectionJump
    )
      return;
    const delay = Math.min(
      250,
      Math.max(20, ((repeat.end - getPosition()) * 1000) / state.playbackRate),
    );
    sectionTimeout = setTimeout(() => {
      sectionTimeout = null;
      checkSectionRepeat();
      scheduleSectionRepeat();
    }, delay);
  }

  function checkSectionRepeat(fromEnd = false): boolean {
    const state = usePlaybackStore.getState(),
      repeat = state.sectionRepeat,
      currentEngine = getEngine();
    if (
      !repeat?.enabled ||
      repeat.end === null ||
      !currentEngine ||
      state.error ||
      state.buffering ||
      repeat.songId !== getLoadedSongId() ||
      repeat.songId !== state.queue[state.index]?.id ||
      (!state.playing && !fromEnd)
    )
      return false;
    if (checkSleepTimer(fromEnd)) return true;
    if (usePlaybackStore.getState().sectionRepeat !== repeat) return false;
    if (sectionJump) return true;
    const position = getPosition();
    if (!fromEnd && position >= repeat.start && position < repeat.end) return false;
    const requestGeneration = getGeneration(),
      pauseVersion = sectionPauseVersion,
      requestSeek = ++seekVersion,
      jump = {};
    sectionJump = jump;
    if (sectionTimeout !== null) clearTimeout(sectionTimeout);
    sectionTimeout = null;
    void currentEngine
      .seek(repeat.start, true)
      .then(() => {
        const latest = usePlaybackStore.getState();
        if (
          requestGeneration !== getGeneration() ||
          requestSeek !== seekVersion ||
          latest.sectionRepeat !== repeat ||
          pauseVersion !== sectionPauseVersion
        )
          return;
        latest.setStatus({ position: repeat.start });
        if (fromEnd && !checkSleepTimer(true)) currentEngine.play();
      })
      .catch(() => {
        if (
          requestGeneration !== getGeneration() ||
          requestSeek !== seekVersion ||
          usePlaybackStore.getState().sectionRepeat !== repeat
        )
          return;
        usePlaybackStore.getState().setSectionRepeat({ ...repeat, enabled: false });
        usePlaybackStore
          .getState()
          .setStatus({ error: '구간 반복 위치로 이동하지 못했습니다. 다시 설정해 주세요.' });
      })
      .finally(() => {
        if (sectionJump === jump) sectionJump = null;
        scheduleSectionRepeat();
      });
    return true;
  }
  function onStateChange(
    state: ReturnType<typeof usePlaybackStore.getState>,
    previous: ReturnType<typeof usePlaybackStore.getState>,
  ) {
    const song = state.queue[state.index],
      previousSong = previous.queue[previous.index];
    if (!state.playing && previous.playing) sectionPauseVersion++;
    if (state.sleepTimer?.mode === 'track' && state.sectionRepeat?.enabled)
      state.setSectionRepeat({ ...state.sectionRepeat, enabled: false });
    if (
      state.sectionRepeat !== previous.sectionRepeat ||
      state.playing !== previous.playing ||
      state.buffering !== previous.buffering ||
      state.error !== previous.error ||
      state.playbackRate !== previous.playbackRate ||
      song?.id !== previousSong?.id
    )
      scheduleSectionRepeat();
  }
  return {
    setStart: setSectionRepeatStart,
    start: startSectionRepeat,
    setEnd: setSectionRepeatEnd,
    toggle: toggleSectionRepeat,
    cancel: cancelSectionRepeat,
    check: checkSectionRepeat,
    schedule: scheduleSectionRepeat,
    onStateChange,
    resetPending: () => {
      sectionJump = null;
    },
    beginSeek: () => ++seekVersion,
    isCurrentSeek: (version: number) => version === seekVersion,
  };
}
