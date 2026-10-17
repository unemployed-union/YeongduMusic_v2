import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { useLocalMusicStore } from '@/stores/local-music';
import { useOfflineMusicStore } from '@/stores/offline-music';
import { useColors } from '@/theme/tokens';
import type { Song } from '@/types/music';

export function DeleteLocalSongDialog({ song, onClose }: { song: Song & { source: 'local' }; onClose: () => void }) {
  const colors = useColors();
  const storing = useOfflineMusicStore(state => state.busy);
  const importing = useLocalMusicStore(state => state.busy);
  const pending = useRef(false);
  const [deleting, setDeleting] = useState(false), [error, setError] = useState<string | null>(null);
  const blocked = storing || importing || deleting;
  const close = () => { if (!pending.current) onClose(); };
  async function remove() {
    if (pending.current || blocked) return;
    pending.current = true; setDeleting(true); setError(null);
    try {
      if (await useOfflineMusicStore.getState().remove(song)) onClose();
      else setError(useOfflineMusicStore.getState().error ?? '음악을 삭제하지 못했습니다. 다시 시도해 주세요.');
    } finally { pending.current = false; setDeleting(false); }
  }
  return <PlaylistSheet title={song.local.downloadedFrom ? '다운로드 삭제' : '기기 음악 삭제'} onClose={close}>
    <View style={styles.body}>
      <View style={styles.identity}><Text numberOfLines={3} style={[styles.title, { color: colors.text }]}>{song.title}</Text><Text numberOfLines={2} style={{ color: colors.muted }}>{song.artist}</Text></View>
      <Text style={[styles.description, { color: colors.muted }]}>앱에 저장된 이 곡의 파일을 삭제하고 기기 음악 목록에서 제거합니다. NAS·클라우드·휴대전화의 원본 파일은 유지됩니다.</Text>
      {blocked && !deleting && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>다른 음악 저장 작업이 끝나면 삭제할 수 있습니다.</Text>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{error}</Text>}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={deleting} onPress={close} style={[styles.button, { backgroundColor: colors.separator, opacity: deleting ? 0.5 : 1 }]}><Text style={[styles.buttonText, { color: colors.text }]}>취소</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={deleting ? '음악 삭제 중' : '음악 삭제'} accessibilityState={{ disabled: blocked, busy: deleting }} disabled={blocked} onPress={() => void remove()} style={[styles.button, { backgroundColor: colors.tint, opacity: blocked ? 0.5 : 1 }]}>
          {deleting && <ActivityIndicator color="white" />}<Text style={[styles.buttonText, { color: 'white' }]}>{deleting ? '삭제 중…' : '삭제'}</Text>
        </Pressable>
      </View>
    </View>
  </PlaylistSheet>;
}

const styles = StyleSheet.create({
  body: { padding: 22, gap: 20 }, identity: { gap: 6 }, title: { fontSize: 18, fontWeight: '700' }, description: { fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 12 }, button: { flex: 1, minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, buttonText: { fontSize: 15, fontWeight: '700' },
});
