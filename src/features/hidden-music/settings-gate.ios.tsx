import { SettingsFeedback, SettingsNote } from '@/features/settings/ios/controls';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useColors } from '@/theme/tokens';
import { Button } from '@expo/ui/swift-ui';
import { foregroundStyle, disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useHiddenSettingsGate } from './use-hidden-settings-gate';

export function HiddenSettingsGate({
  children,
  systemAppearance = true,
}: {
  children: ReactNode;
  systemAppearance?: boolean;
}) {
  const state = useHiddenSettingsGate();
  const colors = useColors();
  if (state.accessReady && !state.accessEnabled) {
    return <Redirect href="/settings" />;
  }
  if (
    state.accessReady &&
    state.scope &&
    state.ready &&
    (!state.profile.biometricLock || state.unlocked)
  ) {
    return <>{children}</>;
  }
  let content: ReactNode;
  if (!state.accessReady) {
    content = <SettingsFeedback loading />;
  } else if (!state.scope) {
    content = (
      <SettingsNote>
        NAS 계정을 확인해 주세요. 계정별 숨김 목록을 저장하려면 다시 로그인해야 합니다.
      </SettingsNote>
    );
  } else if (!state.ready) {
    content = (
      <SettingsFeedback
        loading={!state.error}
        error={state.error}
        onRetry={() => {
          void state.load(state.scope);
        }}
      />
    );
  } else {
    content = (
      <>
        <SettingsFeedback loading={state.busy} error={state.error} />
        <Button
          label="지문 · 기기 암호로 열기"
          modifiers={[
            unavailable(state.busy),
            ...(systemAppearance ? [foregroundStyle(colors.tint)] : []),
          ]}
          onPress={() => {
            void state.unlock();
          }}
        />
      </>
    );
  }
  return (
    <SettingsPage systemAppearance={systemAppearance}>
      <SettingsSection
        title="숨김 설정"
        nativeContent
        systemAppearance={systemAppearance}
        description={
          state.ready && state.scope
            ? '숨김 설정이 잠겨 있습니다. 기기의 생체 인증 또는 암호로 열 수 있습니다. 잠금 중에도 음악과 플레이리스트 숨김은 계속 적용됩니다.'
            : undefined
        }
      >
        {content}
      </SettingsSection>
    </SettingsPage>
  );
}
