import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { useLocalMusicStore } from '@/stores/local-music';
import { useColors } from '@/theme/tokens';

export function DriveDocumentSettings({ blocked }: { blocked: boolean }) {
  const documents = useDriveDocumentsStore();
  const colors = useColors();
  const { height } = useWindowDimensions();
  const [listOpen, setListOpen] = useState(false);
  if (Platform.OS !== 'android') {
    return null;
  }
  const busy = blocked || documents.busy;
  async function add() {
    if (busy) {
      return;
    }
    const revision = useDriveDocumentsStore.getState().revision;
    await documents.add();
    const current = useDriveDocumentsStore.getState();
    if (!current.error && current.revision !== revision && current.songs.length) {
      useLocalMusicStore.getState().setSource('drive');
    }
  }
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
      <View style={styles.row}>
        <Ionicons name="folder-open-outline" size={24} color={colors.tint} />
        <Text style={[styles.heading, { color: colors.text }]}>파일 앱에서 음원 선택</Text>
      </View>
      <Text style={[styles.note, { color: colors.muted }]}>
        기본 파일 앱의 위치 목록에서 Google Drive를 선택하세요. Google Drive 앱이 설치되어 있고
        로그인되어 있어야 합니다.
      </Text>
      <Text style={[styles.note, { color: colors.muted }]}>
        선택한 파일의 읽기 권한을 유지해 직접 재생합니다. 앱에 음원을 별도 보관하지 않으며, Drive
        제공자가 재생용 캐시를 만들 수 있습니다. 앱을 다시 열어도 ‘Google Drive’ 보관함에서 사용할
        수 있습니다.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="파일 앱에서 Google Drive 음원 선택"
        disabled={busy}
        onPress={() => void add()}
        style={[styles.primary, { backgroundColor: colors.tint, opacity: busy ? 0.5 : 1 }]}
      >
        {documents.busy ? (
          <ActivityIndicator color="white" />
        ) : (
          <Ionicons name="add" size={22} color="white" />
        )}
        <Text style={styles.primaryText}>
          {documents.busy ? '파일 선택·권한 저장 중…' : 'Google Drive 음원 선택'}
        </Text>
      </Pressable>
      {documents.error && (
        <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>
          {documents.error}
        </Text>
      )}
      {documents.message && (
        <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.muted }]}>
          {documents.message}
        </Text>
      )}
      {documents.documents.length > 0 && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setListOpen(true)}
          style={styles.row}
        >
          <Text style={[styles.note, { flex: 1, color: colors.tint }]}>
            선택한 음원 관리 · {documents.documents.length}곡
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.tint} />
        </Pressable>
      )}
      <Text style={[styles.note, { color: colors.muted }]}>
        목록에서 파일을 빼면 이 앱의 읽기 권한만 해제합니다. Drive 원본은 유지됩니다. 위치 목록에
        Drive가 없으면 Google Drive 앱을 먼저 열어 로그인해 주세요.
      </Text>
      {listOpen && (
        <PlaylistSheet
          title="선택한 Drive 음원"
          onClose={() => {
            if (!documents.busy) {
              setListOpen(false);
            }
          }}
        >
          <View style={[styles.listBody, { height: Math.min(560, height * 0.6) }]}>
            <FlatList
              style={styles.list}
              data={documents.documents}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.muted }]}>선택한 음원이 없습니다.</Text>
              }
              renderItem={({ item }) => (
                <View style={[styles.fileRow, { borderBottomColor: colors.separator }]}>
                  <Ionicons name="musical-note-outline" size={23} color={colors.tint} />
                  <Text numberOfLines={2} style={[styles.fileName, { color: colors.text }]}>
                    {item.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name} 선택 해제`}
                    disabled={documents.busy}
                    onPress={() => void documents.remove(item.id)}
                    style={styles.remove}
                  >
                    <Ionicons name="remove-circle-outline" size={24} color={colors.tint} />
                  </Pressable>
                </View>
              )}
            />
            {documents.error && (
              <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>
                {documents.error}
              </Text>
            )}
          </View>
        </PlaylistSheet>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 18, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  heading: { flex: 1, fontSize: 17, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 20 },
  primary: {
    minHeight: 50,
    paddingHorizontal: 12,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { color: 'white', fontSize: 15, fontWeight: '700' },
  listBody: { paddingHorizontal: 22, paddingBottom: 12, gap: 12, flexShrink: 1, minHeight: 0 },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingVertical: 12 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileName: { flex: 1, fontSize: 14, lineHeight: 21 },
  remove: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 28, textAlign: 'center' },
});
