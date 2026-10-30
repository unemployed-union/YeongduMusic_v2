import { isIosSystemSettingsAvailable } from '@/features/settings/ios-system-settings';
import { IosSystemSettingsLink } from '@/features/settings/ios-system-settings-link';
import { SettingsLink, SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { StreamingQualitySettings } from '@/features/playback/streaming-quality-settings';
import { PlaybackOptionsSettings } from '@/features/playback/playback-options-settings';
import { LyricsTranslationSettings } from '@/features/lyrics/translation-settings';
import { ThemeSettings } from '@/features/settings/theme-settings';
import { BlurSettings } from '@/features/settings/blur-settings';
import { SeekPlaybackSettings } from '@/features/playback/seek-playback-settings';

export default function PlaybackSettingsScreen() {
  return (
    <SettingsPage>
      {isIosSystemSettingsAvailable ? (
        <SettingsSection title="iOS 설정">
          <IosSystemSettingsLink />
        </SettingsSection>
      ) : (
        <SettingsSection title="화면 모드">
          <ThemeSettings />
        </SettingsSection>
      )}
      <SettingsSection title="재생 동작">
        <SeekPlaybackSettings />
      </SettingsSection>
      <SettingsSection title="색상">
        <SettingsLink
          title="색상 설정"
          description="앱 강조색 · 배경색 · 미니 플레이어 색상"
          icon="color-palette-outline"
          href="/settings/colors"
        />
      </SettingsSection>
      {!isIosSystemSettingsAvailable && (
        <SettingsSection title="화면 효과">
          <BlurSettings />
        </SettingsSection>
      )}
      <SettingsSection title="재생 화면">
        <SettingsLink
          title="재생 화면 메뉴"
          description="가사 · 구간 반복 · 수면 타이머 등 표시 항목 선택"
          icon="list-outline"
          href="/settings/player-menu"
        />
      </SettingsSection>
      <SettingsSection title="가사 번역">
        <LyricsTranslationSettings />
      </SettingsSection>
      {!isIosSystemSettingsAvailable && (
        <>
          <StreamingQualitySettings />
          <PlaybackOptionsSettings />
        </>
      )}
    </SettingsPage>
  );
}
