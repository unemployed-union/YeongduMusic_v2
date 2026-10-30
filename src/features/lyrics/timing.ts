export const LYRIC_OFFSET_STEP_MS = 100;
export const MAX_LYRIC_OFFSET_MS = 30000;

/** Positive values display lyrics later; negative values display them earlier. */
export function normalizeLyricOffset(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('가사 타이밍 값이 올바르지 않습니다.');
  }
  return Math.max(
    -MAX_LYRIC_OFFSET_MS,
    Math.min(MAX_LYRIC_OFFSET_MS, Math.round(value / LYRIC_OFFSET_STEP_MS) * LYRIC_OFFSET_STEP_MS),
  );
}

export function lyricPlaybackTime(time: number, offsetMs: number): number {
  return Math.max(0, time + offsetMs / 1000);
}

export function formatLyricOffset(offsetMs: number): string {
  return `${offsetMs > 0 ? '+' : ''}${(offsetMs / 1000).toFixed(1)}초`;
}
