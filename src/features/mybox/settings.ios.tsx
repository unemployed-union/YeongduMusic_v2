import { SettingsFeedback, SettingsNote } from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { Button, Group } from '@expo/ui/swift-ui';
import { disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { Alert, Linking } from 'react-native';
import { useMyboxSettings } from './use-mybox-settings';

export function MyboxSettings() {
  const state = useMyboxSettings();
  const { store, disabled } = state;
  return (
    <SettingsPage>
      <SettingsSection
        title="연결 방법"
        nativeContent
        description="MYBOX 웹의 계정 및 개인 액세스 토큰 관리에서 토큰을 생성한 후 붙여 넣으세요."
      >
        <Button
          label="토큰 발급 안내"
          onPress={() => {
            void Linking.openURL('https://developers.mybox.naver.com/getting-started').catch(() =>
              Alert.alert('MYBOX', '안내 페이지를 열지 못했습니다.'),
            );
          }}
        />
      </SettingsSection>
      {store.connection && (
        <SettingsSection title="현재 연결" nativeContent>
          <SettingsNote>{store.connection.folder}</SettingsNote>
          <Button
            label="음악 목록 다시 불러오기"
            modifiers={[unavailable(disabled)]}
            onPress={() => {
              void store.refresh().catch(() => {});
            }}
          />
          <Button
            label="연결 해제"
            role="destructive"
            modifiers={[unavailable(disabled)]}
            onPress={() =>
              Alert.alert(
                'MYBOX 연결 해제',
                '이 기기의 인증 정보와 MYBOX 음악 목록을 제거합니다. 원본 파일과 내려받은 음악은 유지됩니다.',
                [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '해제',
                    style: 'destructive',
                    onPress: () => {
                      void store.disconnect();
                    },
                  },
                ],
              )
            }
          />
        </SettingsSection>
      )}
      <SettingsSection
        title={store.connection ? '연결 변경' : '연결 설정'}
        nativeContent
        description="폴더 경로에 /를 입력하면 전체 음악을 불러옵니다. 특정 폴더를 입력하면 하위 폴더도 포함합니다."
      >
        <SettingsField
          label="개인 액세스 토큰"
          value={state.token}
          onChange={state.setToken}
          disabled={disabled}
          secure
          maxLength={1024}
        />
        <SettingsField
          label="음악 폴더 경로"
          value={state.folder}
          onChange={state.setFolder}
          disabled={disabled}
          maxLength={1024}
        />
        <Button
          label="연결하고 음악 불러오기"
          modifiers={[unavailable(disabled || !state.token.trim())]}
          onPress={() => {
            void state.connect();
          }}
        />
      </SettingsSection>
      <SettingsSection
        title="연결 정보"
        nativeContent
        description="토큰은 기기의 보안 저장소에 보관합니다. 암호 폴더와 공유받은 폴더는 MYBOX Open API에서 지원하지 않습니다. 처음 재생할 때 음원을 임시로 내려받으며 오프라인 재생은 ‘이 기기에 보관’을 사용합니다."
      >
        <SettingsFeedback loading={store.busy || store.loading} error={store.error} />
        {(store.busy || store.loading) && (
          <Group>
            <SettingsNote>{`음악 목록 확인 중 · ${store.scanned}개`}</SettingsNote>
            <Button label="취소" onPress={store.cancel} />
          </Group>
        )}
        {store.connection &&
          !store.busy &&
          !store.loading &&
          !store.error &&
          !store.songs.length && (
            <SettingsNote>
              이 폴더에서 지원되는 음악을 찾지 못했습니다. 폴더 경로와 파일 형식을 확인해 주세요.
            </SettingsNote>
          )}
      </SettingsSection>
    </SettingsPage>
  );
}
