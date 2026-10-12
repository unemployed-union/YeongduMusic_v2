import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Directory } from 'expo-file-system';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { buildFolderTree, visibleFolderRows } from '@/features/hidden-music/folder-tree';
import { availableLocalFolders, localFolderKey } from '@/services/local-music/folders';
import { useFolderExclusionStore } from '@/stores/folder-exclusions';
import { useLocalMusicStore } from '@/stores/local-music';
import { useColors } from '@/theme/tokens';

export function FolderExclusionSettings() {
  const colors = useColors();
  const exclusions = useFolderExclusionStore();
  const local = useLocalMusicStore();
  const [open, setOpen] = useState(false), [picking, setPicking] = useState(false), [pendingPick, setPendingPick] = useState(false);
  const [message, setMessage] = useState<string | null>(null), [term, setTerm] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const folders = useMemo(() => availableLocalFolders(local.allSongs), [local.allSongs]);
  const tree = useMemo(() => buildFolderTree(folders, exclusions.folders), [folders, exclusions.folders]);
  const selected = useMemo(() => new Set(exclusions.folders), [exclusions.folders]);
  const rows = useMemo(() => visibleFolderRows(tree, expanded, selected, term), [tree, expanded, selected, term]);
  const busy = exclusions.loading || exclusions.saving || local.busy || picking;
  const unknown = useMemo(() => local.allSongs.filter(song => song.source === 'local' && !song.local.originalFolders?.length).length, [local.allSongs]);
  async function save(next: string[]) {
    setMessage(null);
    try { await exclusions.setFolders(next); }
    catch (error) { setMessage(error instanceof Error ? error.message : '제외 폴더를 저장하지 못했습니다.'); }
  }
  async function pickFolder() {
    setPicking(true); setMessage(null);
    try {
      const directory = await Directory.pickDirectoryAsync();
      if (directory) await save([...useFolderExclusionStore.getState().folders, localFolderKey(directory.uri)]);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code ?? '';
      if (!/^ERR_(FILE_PICKING|PICKER)_CANCELLED$/.test(code)) setMessage(error instanceof Error ? error.message : '폴더를 선택하지 못했습니다.');
    } finally { setPicking(false); setOpen(true); }
  }
  function startPick() {
    setOpen(false);
    if (Platform.OS === 'ios') setPendingPick(true);
    else void pickFolder();
  }
  return <>
    <Pressable accessibilityRole="button" onPress={() => { setOpen(true); void exclusions.load(); }} style={styles.settingsRow}>
      <View style={styles.settingsIcon}><Ionicons name="folder-open-outline" size={23} color={colors.tint} /></View>
      <View style={styles.settingsCopy}><Text style={[styles.settingsTitle, { color: colors.text }]}>기기 음악 제외 폴더</Text>
        <Text style={[styles.note, { color: colors.muted, marginTop: 5 }]}>통화녹음 등 가져오지 않을 폴더를 지정합니다. 하위 폴더도 제외합니다.</Text>
      </View><Text style={{ color: colors.muted, fontSize: 12 }}>{exclusions.folders.length}개</Text><Ionicons name="chevron-forward" size={19} color={colors.muted} />
    </Pressable>
    <PlaylistSheet title="기기 음악 제외 폴더" visible={open} onClose={() => setOpen(false)} onDismiss={() => { if (pendingPick) { setPendingPick(false); void pickFolder(); } }}>
      <View style={styles.body}>
        <Text style={[styles.note, { color: colors.muted }]}>체크한 폴더는 앞으로 가져오지 않고, 폴더 정보가 있는 기존 곡도 보관함·검색에서 제외합니다. 해제하면 앱에 저장된 곡은 다시 나타납니다. 원본 파일은 유지합니다.</Text>
        {Platform.OS !== 'web' && <Pressable accessibilityRole="button" disabled={busy || !exclusions.ready} onPress={startPick} style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.separator }]}><Ionicons name="add" size={20} color={colors.tint} /><Text style={{ color: colors.tint, fontWeight: '700' }}>제외할 폴더 직접 선택</Text></Pressable>}
        {unknown > 0 && <Text style={[styles.note, { color: colors.muted }]}>원본 폴더 정보가 없는 기존 파일 {unknown}개가 있습니다. 기기 전체를 다시 조회하거나 원래 폴더를 다시 가져오면 정확한 파일 내용으로 폴더를 연결합니다. 개별 파일 선택의 캐시에서는 폴더를 알 수 없습니다.</Text>}
        {Platform.OS === 'android' && <Pressable accessibilityRole="button" disabled={busy || !exclusions.ready} onPress={() => void local.importFiles('device')} style={styles.refresh}><Ionicons name="refresh-outline" size={18} color={colors.tint} /><Text style={{ color: colors.tint, fontWeight: '600' }}>폴더 정보 갱신 · 기기 전체 다시 가져오기</Text></Pressable>}
        {(busy || picking) && <View style={styles.progress}><ActivityIndicator color={colors.tint} /><Text style={{ color: colors.muted }}>{local.busy ? '폴더 확인 및 가져오는 중 · ' + local.processed + '개' : '설정 적용 중'}</Text></View>}
        {(message || exclusions.error || local.error) && <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>{message ?? exclusions.error ?? local.error}</Text>}
        {exclusions.error && <Pressable disabled={busy} onPress={() => void exclusions.load(true)} style={styles.refresh}><Text style={{ color: colors.tint }}>제외 설정 다시 불러오기</Text></Pressable>}
        <TextInput accessibilityLabel="제외 폴더 검색" value={term} onChangeText={setTerm} placeholder="통화녹음 폴더 경로 검색" placeholderTextColor={colors.muted} autoCorrect={false} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.separator }]} />
        <ScrollEdgeFade fill={false} backgroundColor={colors.surface}><FlatList data={rows} extraData={selected} keyExtractor={item => item.path} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          ListEmptyComponent={<Text style={[styles.note, { color: colors.muted, paddingVertical: 18 }]}>폴더 정보가 없습니다. 폴더를 직접 선택하거나 기기 음악을 다시 가져와 주세요.</Text>}
          renderItem={({ item }) => <View style={[styles.row, { borderBottomColor: colors.separator, paddingLeft: Math.min(item.depth, 6) * 14 }]}>
            {item.hasChildren ? <Pressable accessibilityRole="button" accessibilityLabel={item.path + (item.expanded ? ' 접기' : ' 펼치기')} disabled={!!term.trim()} onPress={() => setExpanded(current => { const next = new Set(current); if (next.has(item.path)) next.delete(item.path); else next.add(item.path); return next; })} style={styles.expand}><Ionicons name={item.expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} /></Pressable> : <View style={styles.expand} />}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(item.path), disabled: busy || !exclusions.ready }} accessibilityLabel={item.path} disabled={busy || !exclusions.ready} onPress={() => void save(selected.has(item.path) ? exclusions.folders.filter(folder => folder !== item.path) : [...exclusions.folders, item.path])} style={styles.choice}>
              <Ionicons name="folder-outline" size={22} color={colors.tint} /><View style={{ flex: 1 }}><Text numberOfLines={2} style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{item.coveredByParent ? '상위 폴더로 제외됨' : item.count + '곡 · 하위 폴더 포함'}</Text></View><Ionicons name={selected.has(item.path) ? 'checkbox' : 'square-outline'} size={24} color={selected.has(item.path) ? colors.tint : colors.muted} />
            </Pressable>
          </View>}
        /></ScrollEdgeFade>
        <Text style={[styles.note, { color: colors.muted }]}>기기에만 적용하며 NAS 숨김 프리셋과 독립적입니다. 이미 저장된 곡과 대기열에도 적용합니다. 폴더 정보를 갱신하면 제외되지 않은 새 음악도 함께 가져옵니다.</Text>
      </View>
    </PlaylistSheet>
  </>;
}
const styles = StyleSheet.create({ settingsRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 15 }, settingsIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }, settingsCopy: { flex: 1 }, settingsTitle: { fontSize: 16, fontWeight: '600' }, body: { paddingHorizontal: 22, paddingVertical: 14, gap: 12, flexShrink: 1 }, note: { fontSize: 12, lineHeight: 18 }, button: { minHeight: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, refresh: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }, progress: { flexDirection: 'row', alignItems: 'center', gap: 8 }, input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 }, list: { maxHeight: 280 }, listContent: { flexGrow: 1, paddingVertical: 28 }, row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, expand: { width: 28, height: 44, alignItems: 'center', justifyContent: 'center' }, choice: { minHeight: 56, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 } });
