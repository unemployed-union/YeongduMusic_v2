import type { AppearanceField } from '@/theme/appearance';

export const COLOR_PRESETS = [
  ['로즈', '#E85D75'],
  ['오렌지', '#F29B4B'],
  ['골드', '#D9BC55'],
  ['그린', '#2AA58C'],
  ['블루', '#498FE7'],
  ['퍼플', '#9273D9'],
  ['슬레이트', '#64748B'],
  ['그레이', '#D3D6DE'],
] as const;
export const COLOR_HINTS: Record<AppearanceField, string> = {
  accent: '버튼·스위치·선택 표시와 재생 화면의 강조색에 적용합니다.',
  background: '보관함·설정 등의 배경을 선택한 색조로 꾸밉니다. 밝기는 다크·화이트 모드에 맞춥니다.',
  playerBackground: '앨범아트 색상 대신 선택한 색조의 어두운 그라데이션을 사용합니다.',
  miniAccent: '미니 플레이어의 재생 버튼과 진행 표시 색상을 따로 지정합니다.',
  miniBackground: '미니 플레이어의 배경을 별도 색조로 꾸밉니다. 블러 설정도 함께 적용됩니다.',
};
export function defaultColorLabel(field: AppearanceField): string {
  if (field === 'playerBackground') {
    return '앨범아트 색상 사용';
  }
  if (field.startsWith('mini')) {
    return '앱 색상 따르기';
  }
  return '기본 색상';
}
