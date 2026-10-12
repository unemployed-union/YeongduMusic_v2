import { SettingsLink, SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useAuthStore } from '@/stores/auth';
import { useGoogleDriveStore } from '@/stores/google-drive';

export default function CloudSettingsScreen() {
  const mode = useAuthStore((state) => state.mode);
  const connected = useAuthStore((state) => !!state.session);
  const driveConnected = useGoogleDriveStore((state) => !!state.account);
  return <SettingsPage><SettingsSection title="서비스">
    <SettingsLink title="Synology" description={mode === 'mock' ? '데모 모드 · NAS 연결 설정' : connected ? '연결됨 · 주소 및 계정 관리' : 'NAS 연결 및 계정 관리'} icon="server-outline" href="/settings/cloud/synology" />
    <SettingsLink title="Google Drive" description={driveConnected ? '연결됨 · 음악 폴더 및 계정 관리' : 'Google 계정 연결 및 음악 폴더 선택'} icon="cloud-outline" href="/settings/cloud/google-drive" />
  </SettingsSection></SettingsPage>;
}
