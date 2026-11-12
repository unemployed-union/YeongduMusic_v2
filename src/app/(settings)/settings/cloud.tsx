import { SettingsLink, SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useAuthStore } from '@/stores/auth';
import { useS3Store } from '@/stores/s3';
import { useMyboxStore } from '@/stores/mybox';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useJellyfinStore } from '@/stores/jellyfin';

export default function CloudSettingsScreen() {
  const mode = useAuthStore((state) => state.mode);
  const connected = useAuthStore((state) => !!state.session);
  const s3Connected = useS3Store((state) => !!state.connection);
  const myboxConnected = useMyboxStore((state) => !!state.connection);
  const driveConnected = useGoogleDriveStore((state) => !!state.account);
  const jellyfinConnected = useJellyfinStore((state) => !!state.connection);
  let nasConnectionDescription: string;
  if (mode === 'mock') {
    nasConnectionDescription = '데모 모드 · NAS 연결 설정';
  } else if (connected) {
    nasConnectionDescription = '연결됨 · 주소 및 계정 관리';
  } else {
    nasConnectionDescription = 'NAS 연결 및 계정 관리';
  }
  return (
    <SettingsPage>
      <SettingsSection title="서비스" description="음악을 가져올 서버와 계정을 설정할 수 있습니다.">
        <SettingsLink
          title="Synology"
          description={nasConnectionDescription}
          icon="server-outline"
          href="/settings/cloud/synology"
        />
      </SettingsSection>
      <SettingsSection
        title="베타 서비스"
        description="다른 저장소에 있는 음악을 보관함에 추가할 수 있습니다."
      >
        <SettingsLink
          title="Jellyfin"
          badge="베타"
          description={
            jellyfinConnected
              ? '연결됨 · 계정과 음악 라이브러리 관리'
              : 'Jellyfin 서버 연결 및 음악 라이브러리'
          }
          icon="musical-note-outline"
          href="/settings/cloud/jellyfin"
        />
        <SettingsLink
          title="S3 호환 저장소"
          badge="베타"
          description={
            s3Connected ? '연결됨 · 버킷과 음악 경로 관리' : 'AWS S3 및 S3 호환 서비스 연결'
          }
          icon="file-tray-stacked-outline"
          href="/settings/cloud/s3"
        />
        <SettingsLink
          title="Google Drive"
          badge="베타"
          description={
            driveConnected
              ? '연결됨 · 선택한 음악 및 계정 관리'
              : 'Google 계정 연결 및 음악 파일 선택'
          }
          icon="logo-google"
          href="/settings/cloud/google-drive"
        />
        <SettingsLink
          title="네이버 MYBOX"
          badge="베타"
          description={
            myboxConnected ? '연결됨 · 음악 폴더 및 토큰 관리' : '개인 액세스 토큰으로 음악 연결'
          }
          icon="cloud-outline"
          href="/settings/cloud/mybox"
        />
      </SettingsSection>
    </SettingsPage>
  );
}
