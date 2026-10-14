export const MIN_SECTION_SECONDS = 0.5;

export function validateSectionPoint(position: number, duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('곡의 재생 시간을 불러온 뒤 다시 시도해 주세요.');
  if (!Number.isFinite(position) || position < 0 || position > duration) throw new Error('곡의 재생 시간 안에서 지점을 선택해 주세요.');
}

export function validateSectionRange(start: number, end: number, duration: number): void {
  validateSectionPoint(start, duration);
  validateSectionPoint(end, duration);
  if (end - start < MIN_SECTION_SECONDS) throw new Error('종료점 B는 시작점 A보다 최소 0.5초 뒤여야 합니다.');
}

export function sectionClock(value: number): string {
  const tenths = Math.max(0, Math.round(value * 10));
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}

export function parseSectionTime(value: string): number {
  const match = /^(?:(\d+):)?(\d{1,2})(?:\.(\d))?$/.exec(value.trim());
  if (!match || (match[1] !== undefined && Number(match[2]) >= 60)) throw new Error('시간을 분:초 형식으로 입력해 주세요. 예: 0:30.5');
  return Number(match[1] ?? 0) * 60 + Number(match[2]) + Number(match[3] ?? 0) / 10;
}
