import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { TextInput } from '@/components/text-input';
import { AnimatedSwitch } from '@/components/animated-switch';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { useWebMetadataStore } from '@/stores/web-metadata';
import { useAuthStore } from '@/stores/auth';
import { useSongs } from '@/features/library/queries';
import { privacyScope } from '@/features/hidden-music/rules';
import { metadataKey } from './rules';
import { normalizeMetadataText } from './web-rules';

export function WebMetadataSettings() {
  const colors = useColors();
  const preferences = useWebMetadataStore();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const scope = privacyScope(mode, session);
  const { data, isPending, error } = useSongs(expanded);
  const load = preferences.load;
  useEffect(() => {
    void load();
  }, [load]);
  const matching = useMemo(() => {
    const term = normalizeMetadataText(search);
    return (data?.items ?? []).filter(
      (song) =>
        !term || normalizeMetadataText(`${song.title} ${song.artist} ${song.album}`).includes(term),
    );
  }, [data?.items, search]);
  const disabled = !preferences.ready || preferences.loading || preferences.loadError;
  return (
    <View style={styles.body}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>웹 곡 정보 자동 적용</Text>
          <Text style={[styles.note, { color: colors.muted }]}>
            기본값은 꺼짐입니다. 켜면 앱을 사용하는 동안 현재 보관함의 곡을 MusicBrainz에서 검색하여
            빈 정보를 채웁니다. 제목·아티스트·길이가 일치하고 후보들이 같은 값을 제공하는 항목만
            적용합니다.
          </Text>
        </View>
        <AnimatedSwitch
          accessibilityLabel="웹 곡 정보 자동 적용"
          value={preferences.enabled}
          disabled={disabled}
          busy={preferences.saving}
          onValueChange={(value) => void preferences.setEnabled(value).catch(() => {})}
        />
      </View>
      <Text style={[styles.note, { color: colors.muted }]}>
        검색 시 곡 제목과 아티스트가 MusicBrainz로 전송됩니다. 앱 표시 정보만 저장하고 원본 파일은
        변경하지 않습니다. 직접 수정한 곡과 제외한 곡은 건너뜁니다. 자동 적용된 정보는 곡의
        메타데이터 수정 화면에서 지울 수 있습니다.
      </Text>
      {preferences.status && (
        <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.tint }]}>
          {preferences.status}
        </Text>
      )}
      {(preferences.error || preferences.automaticError) && (
        <Text accessibilityRole="alert" style={{ color: colors.tint }}>
          {preferences.error || preferences.automaticError}
        </Text>
      )}
      {preferences.loadError && (
        <Pressable
          accessibilityRole="button"
          disabled={preferences.loading}
          onPress={() => void load(true)}
          style={styles.button}
        >
          <Text style={{ color: colors.tint }}>설정 다시 불러오기</Text>
        </Pressable>
      )}
      {!preferences.loadError && (
        <Pressable
          accessibilityRole="button"
          disabled={disabled || preferences.saving}
          onPress={() => void preferences.retry().catch(() => {})}
          style={styles.button}
        >
          <Text style={{ color: colors.tint }}>자동 검색 다시 확인</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.button}
      >
        <Text style={{ color: colors.tint, fontWeight: '600' }}>
          곡별 자동 적용 제외 {expanded ? '접기' : '선택'}
        </Text>
      </Pressable>
      <Text style={[styles.note, { color: colors.muted }]}>
        자동 적용을 켜기 전에 제외할 곡을 선택할 수 있습니다. 곡의 메타데이터 수정 화면에서도 선택할
        수 있습니다. 제외를 켜도 이미 저장된 정보는 유지됩니다.
      </Text>
      {expanded && (
        <>
          <TextInput
            accessibilityLabel="자동 적용 제외할 곡 검색"
            value={search}
            onChangeText={setSearch}
            placeholder="제목·아티스트·앨범 검색"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
          />
          {isPending && <ActivityIndicator color={colors.tint} />}
          {error && (
            <Text accessibilityRole="alert" style={{ color: colors.tint }}>
              곡 목록을 불러오지 못했습니다. 보관함을 새로고침해 주세요.
            </Text>
          )}
          {matching.slice(0, 30).map((song) => {
            const key = metadataKey(song, scope);
            return (
              <View key={key ?? song.id} style={styles.row}>
                <View style={styles.copy}>
                  <Text numberOfLines={2} style={{ color: colors.text }}>
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.note, { color: colors.muted }]}>
                    {song.artist} · {song.album}
                  </Text>
                </View>
                <AnimatedSwitch
                  accessibilityLabel={`${song.title} 자동 적용 제외`}
                  value={!!key && !!preferences.excluded[key]}
                  disabled={disabled || !key}
                  busy={preferences.saving}
                  onValueChange={(value) => {
                    if (key) {
                      void preferences.setExcluded(key, value).catch(() => {});
                    }
                  }}
                />
              </View>
            );
          })}
          {!isPending && !matching.length && !error && (
            <Text style={[styles.note, { color: colors.muted }]}>해당하는 곡이 없습니다.</Text>
          )}
          {matching.length > 30 && (
            <Text style={[styles.note, { color: colors.muted }]}>
              전체 {matching.length}곡 중 30곡 표시 · 검색으로 곡을 찾아 주세요.
            </Text>
          )}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  body: { padding: 15, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 5 },
  copy: { flex: 1, gap: 6 },
  title: { fontSize: 16, fontWeight: '600' },
  note: { fontSize: 12, lineHeight: 19 },
  button: { minHeight: 44, justifyContent: 'center' },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
});
