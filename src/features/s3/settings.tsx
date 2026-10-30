import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { TextInput } from '@/components/text-input';
import { Text } from '@/components/text';
import { AnimatedSwitch } from '@/components/animated-switch';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useS3Store } from '@/stores/s3';
import { useColors } from '@/theme/tokens';

export function S3Settings() {
  const colors = useColors();
  const s3 = useS3Store();
  const [endpoint, setEndpoint] = useState(s3.connection?.endpoint ?? '');
  const [region, setRegion] = useState(s3.connection?.region ?? 'us-east-1');
  const [bucket, setBucket] = useState(s3.connection?.bucket ?? '');
  const [prefix, setPrefix] = useState(s3.connection?.prefix ?? '');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [pathStyle, setPathStyle] = useState(s3.connection?.pathStyle ?? true);
  const [allowHttp, setAllowHttp] = useState(s3.connection?.allowHttp ?? false);
  const disabled = s3.busy || s3.loading || !s3.ready || Platform.OS === 'web';
  const field = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder = '',
    secure = false,
  ) => (
    <View style={styles.field}>
      <Text style={{ color: colors.muted }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        editable={!disabled}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        underlineColorAndroid="transparent"
        style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
      />
    </View>
  );
  async function connect() {
    if (disabled) {
      return;
    }
    Keyboard.dismiss();
    await s3.connect({
      endpoint,
      region,
      bucket,
      prefix,
      accessKeyId,
      secretAccessKey,
      sessionToken,
      pathStyle,
      allowHttp,
    });
    setSecretAccessKey('');
    setSessionToken('');
  }
  return (
    <SettingsPage>
      <Text style={[styles.note, { color: colors.muted }]}>
        AWS S3와 S3 호환 저장소의 음악을 읽고 재생합니다. 버킷 목록 조회(ListBucket)와 음악
        읽기(GetObject) 권한이 필요합니다. 파일 업로드·수정·삭제는 요청하지 않습니다.
      </Text>
      {Platform.OS === 'web' && (
        <Text style={{ color: colors.tint }}>S3 연결은 Android·iOS 앱에서 사용할 수 있습니다.</Text>
      )}
      {s3.connection && (
        <SettingsSection title="현재 연결">
          <View style={styles.field}>
            <Text style={{ color: colors.text }}>{s3.connection.bucket}</Text>
            <Text style={{ color: colors.muted }}>
              {s3.connection.endpoint}
              {'\n'}접두사: {s3.connection.prefix || '(버킷 전체)'}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void s3.refresh().catch(() => {})}
              style={styles.button}
            >
              <Text style={{ color: colors.tint }}>음악 목록 다시 불러오기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() =>
                Alert.alert(
                  'S3 연결 해제',
                  '이 기기의 인증 정보와 S3 음악 목록을 제거합니다. 서버 원본과 내려받은 음악 복사본은 유지됩니다.',
                  [
                    { text: '취소', style: 'cancel' },
                    { text: '해제', style: 'destructive', onPress: () => void s3.disconnect() },
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
      <SettingsSection title={s3.connection ? '연결 변경' : '연결 설정'}>
        {field('엔드포인트 (AWS S3는 비워도 됨)', endpoint, setEndpoint, 'https://s3.example.com')}
        {field('리전', region, setRegion, 'us-east-1')}
        {field('버킷', bucket, setBucket)}
        {field('음악 접두사 (선택)', prefix, setPrefix, 'music/')}
        {field('Access Key ID', accessKeyId, setAccessKeyId, '', true)}
        {field('Secret Access Key', secretAccessKey, setSecretAccessKey, '', true)}
        {field('Session Token (임시 자격 증명일 때)', sessionToken, setSessionToken, '', true)}
        <View style={styles.toggle}>
          <Text style={{ flex: 1, color: colors.text }}>Path-style 주소 사용</Text>
          <AnimatedSwitch
            value={pathStyle}
            onValueChange={setPathStyle}
            disabled={disabled}
            accessibilityLabel="S3 Path-style 주소 사용"
            trackColor={{ false: colors.separator, true: colors.tint }}
          />
        </View>
        <View style={styles.toggle}>
          <Text style={{ flex: 1, color: colors.text }}>HTTP 연결 허용</Text>
          <AnimatedSwitch
            value={allowHttp}
            onValueChange={setAllowHttp}
            disabled={disabled}
            accessibilityLabel="S3 HTTP 연결 허용"
            trackColor={{ false: colors.separator, true: colors.tint }}
          />
        </View>
      </SettingsSection>
      <Text style={[styles.note, { color: colors.muted }]}>
        호환 서비스는 해당 서비스의 엔드포인트와 리전을 입력하세요. 접두사는 문자 그대로 적용하며
        하위 경로를 포함합니다. HTTP는 통신을 암호화하지 않습니다. 연결 정보는 기기의 SecureStore에
        보관합니다. 임시 토큰 만료 시 새 토큰으로 다시 연결해야 합니다.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => void connect()}
        style={[styles.connect, { backgroundColor: disabled ? colors.separator : colors.tint }]}
      >
        <Text style={{ color: disabled ? colors.muted : 'white', fontWeight: '700' }}>
          연결하고 음악 불러오기
        </Text>
      </Pressable>
      {(s3.busy || s3.loading) && (
        <View style={styles.field}>
          <ActivityIndicator color={colors.tint} />
          <Text style={{ color: colors.muted }}>음악 목록 확인 중 · {s3.scanned}개 확인</Text>
          <Pressable accessibilityRole="button" onPress={s3.cancel} style={styles.button}>
            <Text style={{ color: colors.tint }}>취소</Text>
          </Pressable>
        </View>
      )}
      {!!s3.error && (
        <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>
          {s3.error}
        </Text>
      )}
      {s3.ready && s3.connection && !s3.busy && !s3.loading && !s3.songs.length && (
        <Text style={[styles.note, { color: colors.muted }]}>
          이 접두사에서 지원되는 음악 파일을 찾지 못했습니다. 접두사와 파일 형식을 확인해 주세요.
        </Text>
      )}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  field: { padding: 14, gap: 8 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  toggle: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  note: { fontSize: 13, lineHeight: 20, marginVertical: 14 },
  button: { minHeight: 44, justifyContent: 'center' },
  connect: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
