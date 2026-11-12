import { SettingsFeedback, SettingsNote, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { Button, Group } from '@expo/ui/swift-ui';
import { disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { Alert } from 'react-native';
import { useS3Settings } from './use-s3-settings';

export function S3Settings() {
  const state = useS3Settings();
  const { s3, disabled } = state;
  return (
    <SettingsPage>
      {s3.connection && (
        <SettingsSection title="현재 연결" nativeContent>
          <SettingsNote>{`${s3.connection.bucket}\n${s3.connection.endpoint}\n접두사: ${s3.connection.prefix || '(버킷 전체)'}`}</SettingsNote>
          <Button
            label="음악 목록 다시 불러오기"
            modifiers={[unavailable(disabled)]}
            onPress={() => {
              void s3.refresh().catch(() => {});
            }}
          />
          <Button
            label="연결 해제"
            role="destructive"
            modifiers={[unavailable(disabled)]}
            onPress={() =>
              Alert.alert(
                'S3 연결 해제',
                '이 기기의 인증 정보와 S3 음악 목록을 제거합니다. 서버 원본과 내려받은 음악 복사본은 유지됩니다.',
                [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '해제',
                    style: 'destructive',
                    onPress: () => {
                      void s3.disconnect();
                    },
                  },
                ],
              )
            }
          />
        </SettingsSection>
      )}
      <SettingsSection
        title="연결 설정"
        nativeContent
        description="버킷 목록 조회(ListBucket)와 음악 읽기(GetObject) 권한이 필요합니다. 파일을 업로드하거나 서버의 원본을 변경하지 않습니다."
      >
        <SettingsField
          label="엔드포인트"
          value={state.endpoint}
          onChange={state.setEndpoint}
          disabled={disabled}
          url
        />
        <SettingsField
          label="리전"
          value={state.region}
          onChange={state.setRegion}
          disabled={disabled}
        />
        <SettingsField
          label="버킷"
          value={state.bucket}
          onChange={state.setBucket}
          disabled={disabled}
        />
        <SettingsField
          label="음악 경로 접두사"
          value={state.prefix}
          onChange={state.setPrefix}
          disabled={disabled}
        />
        <SettingsField
          label="Access Key ID"
          value={state.accessKeyId}
          onChange={state.setAccessKeyId}
          disabled={disabled}
        />
        <SettingsField
          label="Secret Access Key"
          value={state.secretAccessKey}
          onChange={state.setSecretAccessKey}
          disabled={disabled}
          secure
        />
        <SettingsField
          label="Session Token (선택)"
          value={state.sessionToken}
          onChange={state.setSessionToken}
          disabled={disabled}
          secure
        />
        <SettingsToggle
          label="경로 방식 주소 사용"
          value={state.pathStyle}
          disabled={disabled}
          onChange={state.setPathStyle}
        />
        <SettingsToggle
          label="HTTP 연결 허용"
          value={state.allowHttp}
          disabled={disabled}
          onChange={state.setAllowHttp}
        />
        <Button
          label="연결하고 음악 불러오기"
          modifiers={[unavailable(disabled)]}
          onPress={() => {
            void state.connect();
          }}
        />
      </SettingsSection>
      <SettingsSection
        title="연결 정보"
        nativeContent
        description="HTTP 연결에서는 데이터가 암호화되지 않습니다. 인증 정보는 기기의 보안 저장소에 보관합니다. 임시 토큰이 만료되면 다시 연결해야 합니다."
      >
        <SettingsFeedback loading={s3.busy || s3.loading} error={s3.error} />
        {(s3.busy || s3.loading) && (
          <Group>
            <SettingsNote>{`음악 목록 확인 중 · ${s3.scanned}개`}</SettingsNote>
            <Button label="취소" onPress={s3.cancel} />
          </Group>
        )}
        {s3.ready && s3.connection && !s3.busy && !s3.loading && !s3.songs.length && (
          <SettingsNote>
            이 접두사에서 지원되는 음악을 찾지 못했습니다. 경로와 파일 형식을 확인해 주세요.
          </SettingsNote>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
