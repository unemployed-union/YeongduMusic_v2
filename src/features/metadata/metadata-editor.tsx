import { useCallback, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { SongArtworkEditor } from '@/features/artwork/song-artwork-editor';
import { MetadataEditorForm } from './metadata-editor-form';
import type { Song } from '@/types/music';
import { playHaptic } from '@/services/haptics';

export function MetadataEditor({ song, onClose, initialTab = 'metadata' }: { song: Song; onClose: () => void; initialTab?: 'metadata' | 'artwork' }) {
  const colors = useColors();
  const [tab, setTab] = useState(initialTab), [visited, setVisited] = useState({ metadata: initialTab === 'metadata', artwork: initialTab === 'artwork' });
  const [metadataBusy, setMetadataBusy] = useState(false), [artworkBusy, setArtworkBusy] = useState(false);
  const artworkWorking = useRef(false);
  const changeArtworkBusy = useCallback((value: boolean) => { artworkWorking.current = value; setArtworkBusy(value); }, []);
  const close = () => { if (!artworkWorking.current) onClose(); };
  return <PlaylistSheet title={tab === 'metadata' ? '메타데이터 수정' : '앨범아트 수정'} onClose={close}>
    <View style={styles.tabs} accessibilityRole="tablist">
      {([{ id: 'metadata', label: '곡 정보' }, { id: 'artwork', label: '앨범아트' }] as const).map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id, disabled: metadataBusy || artworkBusy }} disabled={metadataBusy || artworkBusy}
        onPress={() => { if (tab !== item.id) playHaptic('selection'); Keyboard.dismiss(); setVisited(value => ({ ...value, [item.id]: true })); setTab(item.id); }} style={[styles.tab, { backgroundColor: tab === item.id ? colors.separator : colors.background }]}>
        <Text style={{ color: tab === item.id ? colors.text : colors.muted, fontWeight: '700' }}>{item.label}</Text>
      </Pressable>)}
    </View>
    {/* Keep visited forms mounted so switching tabs preserves drafts and search results. */}
    {visited.metadata && <View style={[styles.form, tab !== 'metadata' && styles.hidden]} accessibilityElementsHidden={tab !== 'metadata'} importantForAccessibility={tab === 'metadata' ? 'auto' : 'no-hide-descendants'}>
      <MetadataEditorForm song={song} onSaved={onClose} onCancel={close} onBusyChange={setMetadataBusy} />
    </View>}
    {visited.artwork && <View style={[styles.form, tab !== 'artwork' && styles.hidden]} accessibilityElementsHidden={tab !== 'artwork'} importantForAccessibility={tab === 'artwork' ? 'auto' : 'no-hide-descendants'}>
      <SongArtworkEditor song={song} onBusyChange={changeArtworkBusy} />
    </View>}
  </PlaylistSheet>;
}
const styles = StyleSheet.create({ tabs: { flexDirection: 'row', gap: 6, marginHorizontal: 22, marginTop: 12, marginBottom: 4 }, tab: { flex: 1, minHeight: 36, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }, form: { flexShrink: 1, minHeight: 0 }, hidden: { display: 'none' } });
