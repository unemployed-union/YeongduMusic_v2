import { SettingsLink, SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { VersionSettings } from '@/features/settings/version-settings';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useEffect, useState } from 'react';
import { ToastNotice } from '@/components/toast-notice';

export default function SettingsScreen() {
  const showOther = useHiddenFeatureAccess((state) => state.ready && state.enabled);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  return <SettingsPage overlay={toast && <ToastNotice message={toast.message} />}>
    <SettingsSection title="연결">
      <SettingsLink title="클라우드 연결" description="Synology · Google Drive · S3" icon="cloud-outline" href="/settings/cloud" />
    </SettingsSection>
    <SettingsSection title="앱 설정">
      <SettingsLink title="재생 및 화면" description="화면 모드 · 스트리밍 음질 · 앨범아트 · 이퀄라이저" icon="musical-notes-outline" href="/settings/playback" />
      <SettingsLink title="햅틱 피드백" description="동작별 켜기·끄기 및 강도 조절" icon="phone-portrait-outline" href="/settings/haptics" />
      <SettingsLink title="하단 메뉴" description="보관함 · 플레이리스트 · 검색 순서 및 표시" icon="reorder-three-outline" href="/settings/bottom-menu" />
      <SettingsLink title="보관함" description="메뉴 순서 및 표시 · 앨범 · 좋아요 버튼 · 기기 폴더" icon="library-outline" href="/settings/library" />
      {showOther && <SettingsLink title="기타" icon="ellipsis-horizontal-circle-outline" href="/settings/other" />}
    </SettingsSection>
    <SettingsSection title="백업 및 복구">
      <SettingsLink title="설정 백업 및 복구" description="파일로 저장 · 백업 파일 가져오기" icon="save-outline" href="/settings/backup" />
      <SettingsLink title="플레이리스트 백업 및 복구" description="목록과 곡 순서 저장 · 백업 파일 가져오기" icon="copy-outline" href="/settings/playlist-backup" />
    </SettingsSection>
    <SettingsSection title="정보">
      <SettingsLink title="오픈소스 라이선스" icon="document-text-outline" href="/settings/licenses" />
      <VersionSettings onToast={message => setToast({ message })} />
    </SettingsSection>
  </SettingsPage>;
}
