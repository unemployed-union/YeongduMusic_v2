import { SETTINGS_DESCRIPTIONS } from '@/features/settings/settings-descriptions';
import { isIosSystemSettingsAvailable } from '@/features/settings/ios-system-settings';
import { IosSystemSettingsLink } from '@/features/settings/ios-system-settings-link';
import {
  SettingsLink,
  SettingsNativeContent,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/settings-ui';
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
        <SettingsSection
          title="iOS 설정"
          description="시스템 설정에서 이 앱의 화면 모드와 재생 옵션을 변경할 수 있습니다."
          nativeContent
        >
          <IosSystemSettingsLink />
        </SettingsSection>
      ) : (
        <SettingsSection title="화면 모드" description={SETTINGS_DESCRIPTIONS.theme} nativeContent>
          <ThemeSettings />
        </SettingsSection>
      )}
      <SettingsSection
        title="재생 동작"
        description="일시정지 중 재생 위치를 조절하면 해당 위치에서 재생을 시작합니다."
        nativeContent
      >
        <SeekPlaybackSettings />
      </SettingsSection>
      <SettingsSection title="색상" description="앱에서 사용할 색상을 선택할 수 있습니다.">
        <SettingsLink
          title="색상 설정"
          description="앱 강조색 · 배경색 · 미니 플레이어 색상"
          icon="color-palette-outline"
          href="/settings/colors"
        />
      </SettingsSection>
      {!isIosSystemSettingsAvailable && (
        <SettingsSection title="화면 효과" description={SETTINGS_DESCRIPTIONS.blur} nativeContent>
          <BlurSettings />
        </SettingsSection>
      )}
      <SettingsSection
        title="재생 화면"
        description="재생 화면에 표시할 도구를 선택할 수 있습니다."
      >
        <SettingsLink
          title="재생 화면 메뉴"
          description="가사 · 구간 반복 · 수면 타이머 등 표시 항목 선택"
          icon="list-outline"
          href="/settings/player-menu"
        />
      </SettingsSection>
      <SettingsSection
        title="가사 번역"
        description={SETTINGS_DESCRIPTIONS.lyricsTranslation}
        nativeContent
      >
        <LyricsTranslationSettings />
      </SettingsSection>
      {!isIosSystemSettingsAvailable && (
        <SettingsNativeContent>
          <StreamingQualitySettings />
          <PlaybackOptionsSettings />
        </SettingsNativeContent>
      )}
    </SettingsPage>
  );
}
