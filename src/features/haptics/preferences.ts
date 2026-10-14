export const HAPTIC_EVENTS = [
  { id: 'longPress', title: '길게 누르기', description: '곡·앨범 작업 메뉴와 앨범 이미지 변경 화면 열기', strength: 'medium' },
  { id: 'menu', title: '메뉴 열기', description: '곡 메뉴·재생 메뉴·대기열·설정 및 전체 재생 화면 열기', strength: 'light' },
  { id: 'playback', title: '재생 조작', description: '곡 선택·재생·일시정지·이전·다음·앨범아트 스와이프', strength: 'light' },
  { id: 'selection', title: '선택 변경', description: '설정 스위치·메뉴 항목·배속·가사 소스·번역 언어·편집 탭', strength: 'light' },
  { id: 'seek', title: '재생 위치 이동', description: '진행 막대 조절 완료·가사를 눌러 해당 위치로 이동', strength: 'light' },
] as const;
export type HapticKind = typeof HAPTIC_EVENTS[number]['id'];
export type HapticStrength = 'light' | 'medium' | 'heavy';
export type HapticEventPreference = { enabled: boolean; strength: HapticStrength };
export type HapticPreferences = { enabled: boolean; events: Record<HapticKind, HapticEventPreference> };
export const HAPTIC_STRENGTHS = [{ id: 'light', label: '약' }, { id: 'medium', label: '중' }, { id: 'heavy', label: '강' }] as const;
export const DEFAULT_HAPTIC_PREFERENCES: HapticPreferences = {
  enabled: true,
  events: Object.fromEntries(HAPTIC_EVENTS.map(event => [event.id, { enabled: true, strength: event.strength }])) as HapticPreferences['events'],
};
export function parseHapticPreferences(value: unknown): HapticPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('햅틱 설정 형식이 올바르지 않습니다.');
  const input = value as Partial<HapticPreferences>;
  if (typeof input.enabled !== 'boolean' || !input.events || typeof input.events !== 'object' || Array.isArray(input.events)) throw new Error('햅틱 설정을 확인할 수 없습니다.');
  const events = Object.fromEntries(HAPTIC_EVENTS.map(({ id }) => {
    const event = input.events![id];
    if (!event || typeof event.enabled !== 'boolean' || !HAPTIC_STRENGTHS.some(item => item.id === event.strength)) throw new Error('햅틱 사용 여부와 강도를 확인해 주세요.');
    return [id, { enabled: event.enabled, strength: event.strength }];
  })) as HapticPreferences['events'];
  return { enabled: input.enabled, events };
}
