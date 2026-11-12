import { Button, Group } from '@expo/ui/swift-ui';
import { disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { SettingsFeedback, SettingsNote, SettingsToggle } from './ios/controls';
import { SettingsField } from './ios/field';
import { SettingsSection } from './settings-ui';
import { useSynologySettings } from './use-synology-settings';

export function SynologySettings() {
  const state = useSynologySettings();
  const disabled = state.busy || !state.validInput;
  if (state.mode === 'setup') {
    return (
      <SettingsSection
        title="NAS 연결"
        nativeContent
        description="Synology 계정으로 로그인해 NAS의 음악을 들을 수 있습니다. 기기와 다른 클라우드의 음악은 로그인 없이도 사용할 수 있습니다."
      >
        <Button label="NAS 로그인" onPress={state.openLogin} />
      </SettingsSection>
    );
  }
  return (
    <Group>
      <SettingsSection
        title="연결"
        nativeContent
        description={
          '공용 music과 계정의 home/music을 함께 조회합니다. 선택한 NAS에서 음악을 직접 스트리밍하며 유효한 HTTPS 인증서가 필요합니다.' +
          (state.isHttp ? '\n\nHTTP에서는 비밀번호와 음악 데이터가 암호화되지 않습니다.' : '')
        }
      >
        <SettingsNote>{`${state.mode === 'mock' ? '데모 라이브러리' : 'Synology NAS'}\n${state.session?.baseUrl ?? '연결 없이 UI 둘러보기'}`}</SettingsNote>
        <SettingsField
          label="접속 주소"
          value={state.address}
          disabled={state.busy}
          url
          onChange={(value) => {
            state.setAddress(value);
            state.setTestResult(null);
          }}
        />
        {state.isHttp && (
          <Group>
            <SettingsToggle
              label="HTTP 연결 허용"
              value={state.allowHttp}
              disabled={state.busy}
              onChange={state.setAllowHttp}
            />
          </Group>
        )}
        <SettingsFeedback loading={state.busy} error={state.error} />
        {state.testResult && <SettingsNote>{state.testResult}</SettingsNote>}
        <Button
          label="연결 테스트"
          modifiers={[unavailable(disabled)]}
          onPress={() => {
            void state.testAddress();
          }}
        />
        <Button
          label="주소 변경 후 다시 로그인"
          modifiers={[unavailable(disabled)]}
          onPress={() => {
            void state.changeAddress();
          }}
        />
      </SettingsSection>
      <SettingsSection
        title="계정"
        nativeContent
        description="현재 주소에서 다시 로그인하거나 NAS 주소를 변경할 수 있습니다. 주소를 변경하면 현재 세션을 종료하고 새 주소에서 다시 로그인합니다. 연결을 해제해도 기기와 Google Drive 음악은 유지됩니다."
      >
        <Button
          label="다시 로그인"
          modifiers={[unavailable(state.busy)]}
          onPress={state.openLogin}
        />
        <Button
          label={state.mode === 'mock' ? '데모 종료' : 'NAS 연결 해제'}
          role="destructive"
          modifiers={[unavailable(state.busy)]}
          onPress={state.leave}
        />
      </SettingsSection>
    </Group>
  );
}
