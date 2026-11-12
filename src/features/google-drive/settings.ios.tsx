import { SettingsFeedback, SettingsNote } from '@/features/settings/ios/controls';
import { SettingsSection } from '@/features/settings/settings-ui';
import { Button, Group } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import { Alert } from 'react-native';
import { DriveDocumentSettings } from './document-settings';
import { DriveFilePicker } from './file-picker';
import { useGoogleDriveSettings } from './use-google-drive-settings';

export function GoogleDriveSettings() {
  const state = useGoogleDriveSettings();
  const { drive, busy } = state;
  return (
    <Group>
      <SettingsSection
        title="파일 앱에서 음원 선택"
        nativeContent
        description="파일 앱에서 선택한 음원의 읽기 권한을 유지해 직접 재생합니다. 앱에 별도로 복사하지 않으며 Drive 제공자가 재생용 캐시를 만들 수 있습니다. 선택을 해제하면 이 앱의 읽기 권한만 제거하며 Drive 원본은 유지됩니다. 파일 앱에 Drive가 없다면 Google Drive 앱에서 먼저 로그인해 주세요. 검색 결과는 한 번에 최대 100곡까지 표시하며 검색으로 다른 음원을 찾을 수 있습니다."
      >
        <DriveDocumentSettings blocked={drive.busy || drive.fileSaving} />
      </SettingsSection>
      <SettingsSection
        title="Google API 연결"
        nativeContent
        description="Google에서 직접 선택해 허용한 음악 파일만 접근합니다. 음악과 태그를 읽어 재생하고 기기에 보관하며 Drive 원본을 수정하거나 삭제하지 않습니다. NAS 로그인과 독립적으로 사용할 수 있습니다. MP3·M4A·FLAC의 태그와 내장 앨범아트를 기기에 캐시합니다. 읽을 수 없는 정보는 파일명과 기본 이미지로 표시합니다. 폴더의 하위 음악을 자동으로 가져오지는 않습니다."
      >
        {drive.account && <SettingsNote>{drive.account.email}</SettingsNote>}
        <Button
          label={drive.account ? 'Google 계정 변경' : 'Google Drive 연결'}
          modifiers={[disabled(busy)]}
          onPress={state.connect}
        />
        <SettingsFeedback loading={state.apiBusy} error={drive.error} />
        {state.apiBusy && (
          <Group>
            <SettingsNote>{state.progressLabel}</SettingsNote>
            <Button label="요청 취소" onPress={drive.cancelConnection} />
          </Group>
        )}
        {drive.metadataLoading && (
          <SettingsNote>
            곡 태그와 앨범아트를 확인하는 중입니다. 음악은 바로 재생할 수 있습니다.
          </SettingsNote>
        )}
        {drive.metadataWarning && <SettingsNote>{drive.metadataWarning}</SettingsNote>}
        {drive.account && (
          <Group>
            <SettingsNote>{`선택한 음악 ${drive.files.length}개`}</SettingsNote>
            <Button
              label="Google 선택 창으로 음악 파일 추가"
              modifiers={[disabled(busy)]}
              onPress={() => {
                void drive.pickFiles();
              }}
            />
            {drive.files.length > 0 && (
              <Group>
                <Button
                  label="선택 목록 편집"
                  modifiers={[disabled(busy)]}
                  onPress={() => state.setFilePicker(true)}
                />
                <Button
                  label="음악 목록 다시 불러오기"
                  modifiers={[disabled(busy)]}
                  onPress={() => {
                    void drive.refresh().catch(() => {});
                  }}
                />
              </Group>
            )}
            <Button
              label="연결 해제"
              role="destructive"
              modifiers={[disabled(busy)]}
              onPress={() =>
                Alert.alert(
                  'Google Drive 연결 해제',
                  'Drive 곡의 재생을 종료하고 기기의 인증 정보를 삭제합니다.',
                  [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '해제',
                      style: 'destructive',
                      onPress: () => {
                        void drive.disconnect();
                      },
                    },
                  ],
                )
              }
            />
          </Group>
        )}
        {!drive.account && drive.error && (
          <Button
            label="연결 정보 삭제 다시 시도"
            modifiers={[disabled(busy)]}
            onPress={() => {
              void drive.disconnect();
            }}
          />
        )}
      </SettingsSection>
      {state.filePicker && drive.account && (
        <SettingsSection
          title="선택 목록 편집"
          nativeContent
          description="표시할 음악을 선택하세요. 선택을 해제해도 Drive 원본 파일은 유지됩니다. 검색 결과는 한 번에 최대 100곡까지 표시하며 검색으로 다른 음악을 찾을 수 있습니다."
        >
          <DriveFilePicker
            key={`${drive.account.id}:${drive.generation}`}
            onClose={() => state.setFilePicker(false)}
          />
        </SettingsSection>
      )}
    </Group>
  );
}
