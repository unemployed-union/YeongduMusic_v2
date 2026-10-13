import { SettingsLink, SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useAuthStore } from '@/stores/auth';
import { useS3Store } from '@/stores/s3';
import { useGoogleDriveStore } from '@/stores/google-drive';

export default function CloudSettingsScreen() {
  const mode = useAuthStore((state) => state.mode);
  const connected = useAuthStore((state) => !!state.session);
  const s3Connected = useS3Store(state => !!state.connection);
  const driveConnected = useGoogleDriveStore((state) => !!state.account);
  return <SettingsPage><SettingsSection title="서비스">
    <SettingsLink title="Synology" description={mode === 'mock' ? '데모 모드 · NAS 연결 설정' : connected ? '연결됨 · 주소 및 계정 관리' : 'NAS 연결 및 계정 관리'} icon="server-outline" href="/settings/cloud/synology" />
    <SettingsLink title="Google Drive" description={driveConnected ? '연결됨 · 음악 폴더 및 계정 관리' : 'Google 계정 연결 및 음악 폴더 선택'} icon="cloud-outline" href="/settings/cloud/google-drive" />
    <SettingsLink title="S3 호환 저장소" description={s3Connected ? '연결됨 · 버킷과 음악 경로 관리' : 'AWS S3 및 S3 호환 서비스 연결'} icon="cloud-outline" href="/settings/cloud/s3" />
  </SettingsSection></SettingsPage>;
}
