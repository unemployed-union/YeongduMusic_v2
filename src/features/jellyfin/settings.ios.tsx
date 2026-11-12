import { SettingsFeedback, SettingsNote, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { Button, Group } from '@expo/ui/swift-ui';
import { disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { useJellyfinSettings } from './use-jellyfin-settings';

export function JellyfinSettings() {
  const state = useJellyfinSettings();
  const { store, libraries } = state;
  return (
    <SettingsPage>
      <SettingsSection
        title="Jellyfin 서버"
        nativeContent
        description={
          '서버 주소에 Base URL 경로까지 입력해 주세요. HTTPS와 Cloudflare Tunnel을 지원하며 Cloudflare Access의 웹 로그인은 지원하지 않습니다.' +
          (state.allowHttp ? '\n\nHTTP에서는 로그인 정보와 음악 데이터가 암호화되지 않습니다.' : '')
        }
      >
        <SettingsField
          label="서버 주소"
          value={state.address}
          onChange={state.setAddress}
          url
          disabled={store.busy}
        />
        <SettingsField
          label="사용자 이름"
          value={state.username}
          onChange={state.setUsername}
          disabled={store.busy}
        />
        <SettingsField
          label="비밀번호"
          value={state.password}
          onChange={state.setPassword}
          secure
          disabled={store.busy}
        />
        <SettingsToggle
          label="HTTP 연결 허용"
          value={state.allowHttp}
          disabled={store.busy}
          onChange={state.setAllowHttp}
        />
        <Button
          label="로그인"
          modifiers={[unavailable(store.busy)]}
          onPress={() => {
            void state.connect();
          }}
        />
        {store.busy && <Button label="연결 취소" onPress={store.cancel} />}
        <SettingsFeedback loading={store.busy || state.checking} error={store.error} />
        {state.notice && <SettingsNote>{state.notice}</SettingsNote>}
      </SettingsSection>
      {store.connection && (
        <Group>
          <SettingsSection title="현재 연결" nativeContent>
            <SettingsNote>{`${store.connection.username} · 서버 ${store.connection.version}`}</SettingsNote>
            <Button
              label="연결 상태 확인"
              modifiers={[unavailable(state.checking || store.busy)]}
              onPress={() => {
                void state.check();
              }}
            />
            <Button
              label="연결 해제"
              role="destructive"
              modifiers={[unavailable(store.busy)]}
              onPress={() => {
                void store.disconnect();
              }}
            />
          </SettingsSection>
          <SettingsSection
            title="음악 라이브러리"
            nativeContent
            description="선택한 라이브러리의 곡을 전체 음악과 Jellyfin 보관함에 표시합니다."
          >
            <SettingsToggle
              label="모든 음악 라이브러리"
              value={store.selectedLibraries === null}
              disabled={store.busy}
              onChange={(value) => {
                void store.selectLibraries(value ? null : []);
              }}
            />
            {libraries.data?.map((library) => (
              <SettingsToggle
                key={library.id}
                label={library.name}
                value={
                  store.selectedLibraries === null || store.selectedLibraries.includes(library.id)
                }
                disabled={store.busy}
                onChange={(value) => {
                  const selected =
                    store.selectedLibraries ?? libraries.data!.map((item) => item.id);
                  void store.selectLibraries(
                    value
                      ? [...selected.filter((id) => id !== library.id), library.id]
                      : selected.filter((id) => id !== library.id),
                  );
                }}
              />
            ))}
            <SettingsFeedback
              loading={libraries.isPending}
              error={libraries.isError ? libraries.error.message : null}
              onRetry={() => {
                void libraries.refetch();
              }}
            />
          </SettingsSection>
        </Group>
      )}
    </SettingsPage>
  );
}
