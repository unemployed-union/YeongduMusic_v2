import { Pressable, Text, View } from 'react-native';
import { useOfflineMusicStore } from '@/stores/offline-music';
import { useColors } from '@/theme/tokens';

export function DownloadStatus({ dark = false }: { dark?: boolean }) {
  const state = useOfflineMusicStore();
  const colors = useColors();
  const text = dark ? '#FFFFFFCC' : colors.muted, tint = dark ? '#FFD3DE' : colors.tint;
  if (!state.busy && !state.error && !state.message) return null;
  const percent = state.progress.total > 0 ? Math.min(100, Math.round(100 * state.progress.written / state.progress.total)) + '%' : (state.progress.written / 1024 / 1024).toFixed(1) + ' MB';
  return <View style={{ gap: 5, paddingVertical: 6 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: state.error ? tint : text, fontSize: 12 }}>{state.busy ? state.title + ' · ' + (state.saving ? '저장 중' : '내려받는 중 ' + percent) : state.error ?? state.message}</Text>
    <View style={{ flexDirection: 'row', gap: 18 }}>
      {state.busy && !state.saving && <Pressable accessibilityRole="button" onPress={state.cancel} hitSlop={6}><Text style={{ color: tint, fontSize: 12 }}>취소</Text></Pressable>}
      {!state.busy && state.error && state.retrySong && <Pressable accessibilityRole="button" onPress={() => { if (state.retrySong) void state.download(state.retrySong); }} hitSlop={6}><Text style={{ color: tint, fontSize: 12 }}>다시 시도</Text></Pressable>}
      {!state.busy && <Pressable accessibilityRole="button" onPress={state.clearNotice} hitSlop={6}><Text style={{ color: tint, fontSize: 12 }}>닫기</Text></Pressable>}
    </View>
  </View>;
}
