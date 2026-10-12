import { SettingsLink, SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { VersionSettings } from '@/features/settings/version-settings';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';

export default function SettingsScreen() {
  const showOther = useHiddenFeatureAccess((state) => state.ready && state.enabled);
  return <SettingsPage>
    <SettingsSection title="연결">
      <SettingsLink title="클라우드 연결" description="Synology · Google Drive" icon="cloud-outline" href="/settings/cloud" />
    </SettingsSection>
    <SettingsSection title="앱 설정">
      <SettingsLink title="재생 및 화면" description="스트리밍 음질 · 앨범아트 · 이퀄라이저" icon="musical-notes-outline" href="/settings/playback" />
      <SettingsLink title="보관함" description="폴더 앨범 표시 · 기기 음악 제외 폴더" icon="library-outline" href="/settings/library" />
      {showOther && <SettingsLink title="기타" icon="ellipsis-horizontal-circle-outline" href="/settings/other" />}
    </SettingsSection>
    <SettingsSection title="정보">
      <SettingsLink title="오픈소스 라이선스" icon="document-text-outline" href="/settings/licenses" />
      <VersionSettings />
    </SettingsSection>
  </SettingsPage>;
}
