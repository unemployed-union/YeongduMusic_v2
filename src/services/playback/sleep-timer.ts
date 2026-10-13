import type { SleepTimer, SleepTimerStopMode } from '@/stores/playback';

export function timeSleepTimer(minutes: number, stopMode: SleepTimerStopMode, hasSong: boolean, now = Date.now()): SleepTimer {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('1~1440분 사이의 시간을 입력해 주세요.');
  if (stopMode !== 'immediate' && stopMode !== 'track-end') throw new Error('타이머 종료 방식을 확인해 주세요.');
  if (!hasSong) throw new Error('먼저 재생할 곡을 선택해 주세요.');
  return { mode: 'time', minutes, stopMode, endsAt: now + minutes * 60_000 };
}

export function trackSleepTimer(songId: string | undefined): SleepTimer {
  if (!songId) throw new Error('먼저 재생할 곡을 선택해 주세요.');
  return { mode: 'track', songId };
}

type Playback = { songId?: string; loadedSongId: string | null; error: string | null; playing: boolean; position: number; duration: number };
type Decision = { kind: 'keep' } | { kind: 'arm'; timer: SleepTimer } | { kind: 'stop' };

/** Decide the policy without mutating playback or invalidating pending source loads. */
export function sleepTimerDecision(timer: SleepTimer | null, state: Playback, fromEnd = false, changingTrack = false, now = Date.now()): Decision {
  if (!timer) return { kind: 'keep' };
  if (timer.mode === 'time') {
    if (now < timer.endsAt) return { kind: 'keep' };
    if (timer.stopMode === 'track-end' && !fromEnd && !changingTrack && state.songId && state.loadedSongId === state.songId && !state.error && (state.playing || state.position > 0 || state.duration > 0)) {
      return { kind: 'arm', timer: { mode: 'track', songId: state.songId, afterDeadline: true } };
    }
  } else if (!(fromEnd && state.songId === timer.songId) && !(timer.afterDeadline && (changingTrack || state.songId !== timer.songId))) return { kind: 'keep' };
  return { kind: 'stop' };
}

/** Own the one countdown handle; the controller owns its store subscription. */
export function createSleepTimerScheduler(getTimer: () => SleepTimer | null, check: () => boolean) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const schedule = (timer: Extract<SleepTimer, { mode: 'time' }>) => {
    timeout = setTimeout(() => {
      if (getTimer() !== timer) return;
      timeout = null;
      if (!check() && getTimer() === timer) schedule(timer);
    }, Math.max(0, timer.endsAt - Date.now()));
  };
  return (timer: SleepTimer | null) => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    if (timer?.mode === 'time') schedule(timer);
  };
}
