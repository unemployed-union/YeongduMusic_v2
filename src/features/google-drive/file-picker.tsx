import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useColors } from '@/theme/tokens';

/** Edit app membership; granting access happens only in Google's native Picker. */
export function DriveFilePicker({ onClose }: { onClose: () => void }) {
  const colors = useColors(), files = useGoogleDriveStore(state => state.files), saving = useGoogleDriveStore(state => state.fileSaving);
  const [ids, setIds] = useState(() => new Set(files.map(file => file.id))), [error, setError] = useState<string | null>(null);
  const pending = useRef(false), changed = files.some(file => !ids.has(file.id));
  const close = () => { if (!pending.current) onClose(); };
  async function save() {
    if (pending.current || saving || !changed) return;
    pending.current = true; setError(null);
    try { await useGoogleDriveStore.getState().selectFiles(files.filter(file => ids.has(file.id))); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '선택 목록을 저장하지 못했습니다.'); }
    finally { pending.current = false; }
  }
  return <PlaylistSheet title="Google Drive 음악 선택 목록" onClose={close}>
    <View style={{ padding: 22, gap: 14, flexShrink: 1 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>표시할 음악을 선택하세요. 목록에서 빼도 Drive 원본 파일은 유지됩니다.</Text>
      <FlatList data={files} keyExtractor={file => file.id} style={{ maxHeight: 420 }} renderItem={({ item }) => <Pressable accessibilityRole="checkbox" accessibilityLabel={item.name} accessibilityState={{ checked: ids.has(item.id), disabled: saving }} disabled={saving} onPress={() => { setError(null); setIds(previous => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); }} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name={ids.has(item.id) ? 'checkbox' : 'square-outline'} size={24} color={colors.tint} /><Text numberOfLines={2} style={{ flex: 1, color: colors.text }}>{item.name}</Text>
      </Pressable>} />
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={!changed || saving} onPress={() => void save()} style={{ minHeight: 48, borderRadius: 12, backgroundColor: colors.tint, opacity: !changed || saving ? 0.5 : 1, alignItems: 'center', justifyContent: 'center' }}>{saving ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: '700' }}>선택 목록 저장</Text>}</Pressable>
    </View>
  </PlaylistSheet>;
}
