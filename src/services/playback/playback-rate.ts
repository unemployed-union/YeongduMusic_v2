export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export function isPlaybackRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 2;
}

export function validatePlaybackRate(value: number): void {
  if (!isPlaybackRate(value)) throw new Error('배속은 0.5배에서 2배 사이로 선택해 주세요.');
}
