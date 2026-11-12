import {
  Button,
  Form,
  Host,
  NavigationStack,
  ProgressView,
  Section,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  disabled,
  frame,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  navigationBarTitleDisplayMode,
  navigationTitle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import { SettingsField } from '@/features/settings/ios/field';
import { SettingsFeedback, SettingsToggle } from '@/features/settings/ios/controls';
import { useConnectForm } from './use-connect-form';

const actionSectionModifiers = [
  listRowBackground('#00000000'),
  listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }),
  listRowSeparator('hidden'),
];

export function ConnectScreen() {
  const state = useConnectForm();
  const colors = useColors();
  const scheme = useAppColorScheme();
  const testDisabled = state.loading || !state.address || (state.isHttp && !state.allowHttp);
  const feedback = state.error || state.notice;
  return (
    <Host style={{ flex: 1 }} colorScheme={scheme} seedColor={colors.tint}>
      <NavigationStack>
        <Toolbar
          modifiers={[navigationTitle('NAS 로그인'), navigationBarTitleDisplayMode('inline')]}
        >
          <Form modifiers={[tint(colors.tint)]}>
            <Section
              title="서버"
              footer={
                <Text>
                  {state.isHttp
                    ? 'HTTP 연결에서는 계정과 음악 데이터가 암호화되지 않습니다.'
                    : 'Synology Audio Station 주소를 입력하세요. HTTPS 연결을 권장합니다.'}
                </Text>
              }
            >
              <SettingsField
                label="NAS 주소"
                layout="inline"
                placeholder="https://nas.example.com:5001"
                value={state.address}
                disabled={state.loading}
                url
                onChange={(value) => {
                  state.setAddress(value);
                  state.setTestResult(null);
                }}
              />
              {state.isHttp && (
                <SettingsToggle
                  label="HTTP 연결 허용"
                  value={state.allowHttp}
                  disabled={state.loading}
                  onChange={state.setAllowHttp}
                />
              )}
            </Section>
            <Section
              modifiers={actionSectionModifiers}
              footer={state.testResult ? <Text>{state.testResult}</Text> : undefined}
            >
              <Button
                modifiers={[
                  accessibilityLabel('연결 테스트'),
                  buttonStyle('bordered'),
                  controlSize('large'),
                  disabled(testDisabled),
                ]}
                onPress={() => void state.testAddress()}
              >
                <Text modifiers={[frame({ maxWidth: Infinity })]}>연결 테스트</Text>
              </Button>
            </Section>
            <Section title="계정" footer={<Text>비밀번호는 기기에 저장하지 않습니다.</Text>}>
              <SettingsField
                label="계정"
                layout="inline"
                placeholder="사용자 이름"
                value={state.account}
                contentType="username"
                disabled={state.loading}
                onChange={state.setAccount}
              />
              <SettingsField
                label="비밀번호"
                layout="inline"
                placeholder="필수"
                value={state.password}
                secure
                contentType="password"
                disabled={state.loading}
                onChange={state.setPassword}
              />
              {state.needsOtp && (
                <SettingsField
                  label="2단계 인증 코드"
                  layout="inline"
                  value={state.otp}
                  keyboard="numeric"
                  contentType="oneTimeCode"
                  disabled={state.loading}
                  onChange={state.setOtp}
                />
              )}
            </Section>
            <Section
              modifiers={actionSectionModifiers}
              footer={
                state.loading || feedback ? (
                  <VStack spacing={8}>
                    {state.loading && (
                      <ProgressView modifiers={[accessibilityLabel('NAS 연결 처리 중')]} />
                    )}
                    <SettingsFeedback error={feedback} />
                  </VStack>
                ) : undefined
              }
            >
              <Button
                modifiers={[
                  accessibilityLabel('로그인'),
                  buttonStyle('borderedProminent'),
                  controlSize('large'),
                  disabled(state.disabled),
                ]}
                onPress={() => void state.submit()}
              >
                <Text modifiers={[frame({ maxWidth: Infinity })]}>로그인</Text>
              </Button>
            </Section>
            <Section title="다른 방법">
              <Button
                label="데모 둘러보기"
                modifiers={[disabled(state.loading)]}
                onPress={state.enterDemo}
              />
              <Button
                label="이 기기 음악 듣기"
                modifiers={[disabled(state.loading)]}
                onPress={state.cancel}
              />
            </Section>
          </Form>
          <Toolbar.Content>
            <ToolbarItem placement="cancellationAction">
              <Button
                label="취소"
                role="cancel"
                modifiers={[disabled(state.loading), accessibilityLabel('NAS 로그인 취소')]}
                onPress={state.cancel}
              />
            </ToolbarItem>
          </Toolbar.Content>
        </Toolbar>
      </NavigationStack>
    </Host>
  );
}
