import { SettingsLink, SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { StreamingQualitySettings } from '@/features/playback/streaming-quality-settings';
import { PlaybackOptionsSettings } from '@/features/playback/playback-options-settings';
import { LyricsTranslationSettings } from '@/features/lyrics/translation-settings';

export default function PlaybackSettingsScreen() {
  return <SettingsPage><SettingsSection title="재생 화면"><SettingsLink title="재생 화면 메뉴" description="가사 · 구간 반복 · 수면 타이머 등 표시 항목 선택" icon="list-outline" href="/settings/player-menu" /></SettingsSection><SettingsSection title="가사 번역"><LyricsTranslationSettings /></SettingsSection><StreamingQualitySettings /><PlaybackOptionsSettings /></SettingsPage>;
}
