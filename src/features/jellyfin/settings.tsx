import { Text } from '@/components/text';
import { TextInput } from '@/components/text-input';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useColors } from '@/theme/tokens';
import { Pressable, Switch, View } from 'react-native';
import { useJellyfinSettings } from './use-jellyfin-settings';

export function JellyfinSettings() {
  const colors = useColors();
  const {
    store,
    address,
    setAddress,
    username,
    setUsername,
    password,
    setPassword,
    allowHttp,
    setAllowHttp,
    checking,
    notice,
    libraries,
    connect,
    check,
  } = useJellyfinSettings();
  const inputStyle = {
    color: colors.text,
    borderColor: colors.separator,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 48,
  };
  return (
    <SettingsPage>
      <SettingsSection title="Jellyfin 서버">
        <View style={{ padding: 16, gap: 14 }}>
          <Text style={{ color: colors.muted }}>
            서버 주소에 Base URL 경로까지 입력해 주세요. 일반 HTTPS·Cloudflare Tunnel을 지원합니다.
            Cloudflare Access의 웹 로그인은 지원하지 않습니다.
          </Text>
          <TextInput
            accessibilityLabel="Jellyfin 서버 주소"
            placeholder="https://music.example.com/jellyfin"
            placeholderTextColor={colors.muted}
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!store.busy}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Jellyfin 사용자 이름"
            placeholder="사용자 이름"
            placeholderTextColor={colors.muted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!store.busy}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Jellyfin 비밀번호"
            placeholder="비밀번호"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!store.busy}
            style={inputStyle}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ flex: 1, color: colors.text }}>암호화되지 않은 HTTP 연결 허용</Text>
            <Switch
              accessibilityLabel="Jellyfin HTTP 연결 허용"
              value={allowHttp}
              onValueChange={setAllowHttp}
              disabled={store.busy}
            />
          </View>
          {allowHttp && (
            <Text style={{ color: colors.muted }}>
              HTTP에서는 로그인 정보와 음악 데이터가 암호화되지 않습니다.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={store.busy || !address.trim() || !username.trim()}
            onPress={() => void connect()}
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: colors.tint,
              opacity: store.busy ? 0.5 : 1,
            }}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>
              {store.busy ? '연결 확인 중…' : '로그인'}
            </Text>
          </Pressable>
          {store.busy && (
            <Pressable accessibilityRole="button" onPress={store.cancel} style={{ padding: 12 }}>
              <Text style={{ color: colors.tint }}>연결 취소</Text>
            </Pressable>
          )}
          {store.connection && (
            <>
              <Text style={{ color: colors.muted }}>
                {store.connection.username} · 서버 {store.connection.version}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={checking || store.busy}
                onPress={() => void check()}
                style={{ padding: 12 }}
              >
                <Text style={{ color: colors.tint }}>
                  {checking ? '연결 확인 중…' : '연결 상태 확인'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={store.busy}
                onPress={() => void store.disconnect()}
                style={{ padding: 12 }}
              >
                <Text style={{ color: colors.tint }}>로그아웃</Text>
              </Pressable>
            </>
          )}
          {(store.error || notice) && (
            <Text accessibilityRole="alert" style={{ color: colors.tint }}>
              {store.error || notice}
            </Text>
          )}
        </View>
      </SettingsSection>
      {store.connection && (
        <SettingsSection title="음악 라이브러리">
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={{ color: colors.muted }}>
              선택한 라이브러리를 전체 음악과 Jellyfin 보관함에 표시합니다.
            </Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: store.selectedLibraries === null }}
              disabled={store.busy}
              onPress={() => void store.selectLibraries(null)}
              style={{ paddingVertical: 12 }}
            >
              <Text style={{ color: colors.text }}>
                {store.selectedLibraries === null ? '✓ ' : ''}모든 음악 라이브러리
              </Text>
            </Pressable>
            {libraries.data?.map((library) => {
              const checked =
                store.selectedLibraries === null || store.selectedLibraries.includes(library.id);
              return (
                <Pressable
                  key={library.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  disabled={store.busy}
                  onPress={() => {
                    const selected =
                      store.selectedLibraries ?? libraries.data!.map((item) => item.id);
                    void store.selectLibraries(
                      checked
                        ? selected.filter((id) => id !== library.id)
                        : [...selected, library.id],
                    );
                  }}
                  style={{ paddingVertical: 12 }}
                >
                  <Text style={{ color: colors.text }}>
                    {checked ? '✓ ' : ''}
                    {library.name}
                  </Text>
                </Pressable>
              );
            })}
            {libraries.isPending && (
              <Text style={{ color: colors.muted }}>라이브러리를 확인하는 중…</Text>
            )}
            {libraries.isError && (
              <Pressable accessibilityRole="button" onPress={() => void libraries.refetch()}>
                <Text style={{ color: colors.tint }}>{libraries.error.message} · 다시 시도</Text>
              </Pressable>
            )}
            {libraries.isSuccess && !libraries.data.length && (
              <Text style={{ color: colors.muted }}>
                접근 가능한 음악 라이브러리가 없습니다. 서버의 라이브러리와 사용자 권한을 확인해
                주세요.
              </Text>
            )}
          </View>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
