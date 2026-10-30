import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/text';
import { TextInput } from '@/components/text-input';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useMyboxStore } from '@/stores/mybox';
import { useColors } from '@/theme/tokens';

export function MyboxSettings() {
  const colors = useColors();
  const store = useMyboxStore();
  const [token, setToken] = useState('');
  const [folder, setFolder] = useState(store.connection?.folder ?? '/');
  const disabled = !store.ready || store.busy || store.loading || Platform.OS === 'web';
  async function connect() {
    if (disabled || !token.trim()) {
      return;
    }
    Keyboard.dismiss();
    const input = { token, folder };
    setToken('');
    await store.connect(input);
  }
  return (
    <SettingsPage>
      <Text style={[styles.note, { color: colors.muted }]}>
        네이버 MYBOX의 음악을 불러와 재생하고 기기에 보관할 수 있습니다.
      </Text>
      <SettingsSection title="연결 방법">
        <View style={styles.field}>
          <Text style={[styles.description, { color: colors.text }]}>
            MYBOX 웹의 설정 → 계정 및 개인 액세스 토큰 관리에서 토큰을 생성한 뒤 아래에 붙여
            넣으세요.
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              void Linking.openURL('https://developers.mybox.naver.com/getting-started').catch(
                () => {},
              )
            }
            style={styles.button}
          >
            <Text style={{ color: colors.tint }}>토큰 발급 안내 열기</Text>
          </Pressable>
        </View>
      </SettingsSection>
      {Platform.OS === 'web' && (
        <Text style={[styles.note, { color: colors.tint }]}>
          MYBOX 연결은 Android·iOS 앱에서 사용할 수 있습니다.
        </Text>
      )}
      {store.connection && (
        <SettingsSection title="현재 연결">
          <View style={styles.field}>
            <Text style={{ color: colors.text }}>음악 폴더: {store.connection.folder}</Text>
            <Text style={{ color: colors.muted }}>{store.songs.length}곡</Text>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void store.refresh().catch(() => {})}
              style={styles.button}
            >
              <Text style={{ color: colors.tint }}>음악 목록 다시 불러오기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() =>
                Alert.alert(
                  'MYBOX 연결 해제',
                  '기기에 저장한 연결 정보와 MYBOX 음악 목록을 제거합니다. MYBOX 원본과 보관한 음악은 유지됩니다.',
                  [
                    { text: '취소', style: 'cancel' },
                    { text: '해제', style: 'destructive', onPress: () => void store.disconnect() },
                  ],
                )
              }
              style={styles.button}
            >
              <Text style={{ color: colors.tint }}>연결 해제</Text>
            </Pressable>
          </View>
        </SettingsSection>
      )}
      <SettingsSection title={store.connection ? '연결 변경' : '연결 설정'}>
        <View style={styles.field}>
          <Text style={{ color: colors.muted }}>개인 액세스 토큰</Text>
          <TextInput
            accessibilityLabel="MYBOX 개인 액세스 토큰"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="none"
            autoComplete="off"
            value={token}
            onChangeText={setToken}
            maxLength={1024}
            editable={!disabled}
            placeholder="mbx_pat_…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
          />
        </View>
        <View style={styles.field}>
          <Text style={{ color: colors.muted }}>음악 폴더 경로</Text>
          <TextInput
            accessibilityLabel="MYBOX 음악 폴더 경로"
            autoCapitalize="none"
            autoCorrect={false}
            value={folder}
            onChangeText={setFolder}
            maxLength={1024}
            editable={!disabled}
            placeholder="/음악/"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
          />
          <Text style={[styles.description, { color: colors.muted }]}>
            /는 전체 음악을 불러옵니다. 특정 폴더를 입력하면 하위 폴더의 음악도 포함합니다.
          </Text>
        </View>
      </SettingsSection>
      <Text style={[styles.note, { color: colors.muted }]}>
        토큰은 기기의 보안 저장소에 보관합니다. 만료되면 새 토큰으로 다시 연결해 주세요. 암호 폴더와
        공유받은 폴더는 MYBOX Open API에서 지원하지 않습니다.
      </Text>
      <Text style={[styles.note, { color: colors.muted }]}>
        처음 재생할 때 곡을 임시로 내려받아 준비 시간이 필요합니다. 임시 파일은 자동 정리되며,
        오프라인으로 계속 듣고 싶은 곡은 재생 메뉴에서 기기에 보관하세요.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || !token.trim()}
        onPress={() => void connect()}
        style={[
          styles.connect,
          { backgroundColor: disabled || !token.trim() ? colors.separator : colors.tint },
        ]}
      >
        <Text
          style={{ color: disabled || !token.trim() ? colors.muted : 'white', fontWeight: '700' }}
        >
          연결하고 음악 불러오기
        </Text>
      </Pressable>
      {(store.busy || store.loading) && (
        <View style={styles.field}>
          <ActivityIndicator color={colors.tint} />
          <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>
            음악 목록 확인 중 · {store.scanned}개 확인
          </Text>
          <Pressable accessibilityRole="button" onPress={store.cancel} style={styles.button}>
            <Text style={{ color: colors.tint }}>취소</Text>
          </Pressable>
        </View>
      )}
      {!!store.error && (
        <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>
          {store.error}
        </Text>
      )}
      {store.connection && !store.busy && !store.loading && !store.error && !store.songs.length && (
        <Text style={[styles.note, { color: colors.muted }]}>
          이 폴더에서 지원되는 음악을 찾지 못했습니다. 폴더 경로와 파일 형식을 확인해 주세요.
        </Text>
      )}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  field: { padding: 14, gap: 8 },
  note: { fontSize: 13, lineHeight: 20, marginVertical: 14 },
  description: { fontSize: 14, lineHeight: 22 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  button: { minHeight: 44, justifyContent: 'center' },
  connect: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
