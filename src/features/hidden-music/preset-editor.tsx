import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { foldersForSongs, normalizeFolder } from './rules';
import { buildFolderTree, visibleFolderRows, type FolderTreeRow } from './folder-tree';
import { useColors } from '@/theme/tokens';
import type { HiddenPreset } from '@/types/hidden-music';
import type { Song } from '@/types/music';

type Choice = ({ kind: 'folder' } & FolderTreeRow) | { kind: 'song'; song: Song };
type Props = { preset: HiddenPreset; songs: Song[]; busy: boolean; error: string | null; onCancel: () => void; onSave: (preset: HiddenPreset) => void };

export function PresetEditor({ preset, songs, busy, error, onCancel, onSave }: Props) {
  const colors = useColors();
  const [name, setName] = useState(preset.name);
  const [songIds, setSongIds] = useState(preset.songIds);
  const [folders, setFolders] = useState(() => preset.folders.map(normalizeFolder));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [tab, setTab] = useState<'folder' | 'song'>('folder');
  const [term, setTerm] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const selectedSongs = useMemo(() => new Set(songIds), [songIds]);
  const selectedFolders = useMemo(() => new Set(folders), [folders]);
  const folderList = useMemo(() => foldersForSongs(songs), [songs]);
  const tree = useMemo(() => buildFolderTree(folderList, folders), [folderList, folders]);
  const filtering = !!term.trim() || selectedOnly;
  const choices = useMemo<Choice[]>(() => {
    if (tab === 'folder') return visibleFolderRows(tree, expanded, selectedFolders, term, selectedOnly).map(folder => ({ kind: 'folder', ...folder }));
    const match = term.trim().normalize('NFKC').toLocaleLowerCase();
    return songs.filter(song => (!selectedOnly || selectedSongs.has(song.id)) && [song.title, song.artist, song.album, song.path ?? ''].join(' ').normalize('NFKC').toLocaleLowerCase().includes(match)).map(song => ({ kind: 'song', song }));
  }, [tree, expanded, songs, tab, term, selectedOnly, selectedFolders, selectedSongs]);
  function toggle(choice: Choice) {
    if (choice.kind === 'folder') setFolders(current => current.includes(choice.path) ? current.filter(item => item !== choice.path) : [...current, choice.path]);
    else setSongIds(current => current.includes(choice.song.id) ? current.filter(item => item !== choice.song.id) : [...current, choice.song.id]);
  }
  function toggleExpanded(path: string) {
    setExpanded(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  }
  return <View style={styles.screen}>
    <View style={styles.headingRow}><Text style={[styles.heading, { color: colors.text }]}>프리셋 편집</Text><Pressable disabled={busy} onPress={onCancel} style={styles.smallButton}><Text style={{ color: colors.tint }}>취소</Text></Pressable></View>
    <TextInput accessibilityLabel="프리셋 이름" value={name} onChangeText={setName} editable={!busy} maxLength={60} placeholder="프리셋 이름" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.separator }]} />
    <View style={styles.tabs}>{(['folder', 'song'] as const).map(option => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: tab === option }} onPress={() => { setTab(option); setTerm(''); }} style={[styles.tab, { backgroundColor: tab === option ? colors.tint : colors.surface }]}><Text style={{ color: tab === option ? 'white' : colors.text, fontWeight: '700' }}>{option === 'folder' ? '폴더 선택' : '곡 선택'}</Text></Pressable>)}</View>
    <TextInput accessibilityLabel="선택 목록 검색" value={term} onChangeText={setTerm} placeholder={tab === 'folder' ? '폴더 경로 검색' : '제목·아티스트·앨범 검색'} placeholderTextColor={colors.muted} autoCorrect={false} style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.separator }]} />
    <Text style={[styles.note, { color: colors.muted }]}>{tab === 'folder' ? '화살표로 하위 폴더를 펼치고, 체크박스로 숨길 폴더를 선택하세요. 선택한 폴더의 하위 폴더와 새 곡도 숨깁니다.' : '선택한 곡만 숨깁니다. 폴더 선택과 함께 사용할 수 있습니다.'}</Text>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selectedOnly }} onPress={() => setSelectedOnly(!selectedOnly)} style={styles.selectionToggle}><Ionicons name={selectedOnly ? 'checkbox' : 'square-outline'} size={21} color={colors.tint} /><Text style={{ color: colors.text, fontSize: 13 }}>선택한 항목만 보기</Text></Pressable>
    <ScrollEdgeFade><FlatList data={choices} extraData={selectedFolders} keyExtractor={item => item.kind === 'folder' ? item.path : item.song.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>표시할 {tab === 'folder' ? '폴더' : '곡'}가 없습니다.</Text>}
      renderItem={({ item }) => {
        const selected = item.kind === 'folder' ? selectedFolders.has(item.path) : selectedSongs.has(item.song.id);
        return <View style={[styles.row, { borderBottomColor: colors.separator }, item.kind === 'folder' && { paddingLeft: Math.min(item.depth, 8) * 16 }]}>
          {item.kind === 'folder' && (item.hasChildren ? <Pressable disabled={busy || filtering} accessibilityRole="button" accessibilityState={{ expanded: item.expanded, disabled: busy || filtering }} accessibilityLabel={item.path + (item.expanded ? ' 접기' : ' 펼치기')} onPress={() => toggleExpanded(item.path)} style={styles.expand}><Ionicons name={item.expanded ? 'chevron-down' : 'chevron-forward'} size={19} color={colors.muted} /></Pressable> : <View style={styles.expand} />)}
          <Pressable disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: busy }} accessibilityLabel={item.kind === 'folder' ? item.path : item.song.title} onPress={() => toggle(item)} style={styles.choice}>
            {item.kind === 'folder' ? <Ionicons name={item.expanded ? 'folder-open-outline' : 'folder-outline'} size={25} color={colors.tint} /> : <Artwork item={item.song} size={42} radius={6} />}
            <View style={styles.identity}><Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>{item.kind === 'folder' ? item.name : item.song.title}</Text><Text numberOfLines={1} style={[styles.detail, { color: colors.muted }]}>{item.kind === 'folder' ? item.count + '곡 · ' + (item.coveredByParent ? '상위 폴더로 숨김' : '하위 폴더 포함') : item.song.artist + ' · ' + item.song.album}</Text></View>
            <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={25} color={selected ? colors.tint : colors.muted} />
          </Pressable>
        </View>;
      }} /></ScrollEdgeFade>
    <View style={[styles.footer, { borderTopColor: colors.separator }]}>
      <Text style={[styles.note, { color: colors.muted }]}>폴더 {folders.length}개 · 곡 {songIds.length}개 선택{preset.enabled ? ' · 저장하면 바로 적용' : ' · 현재 적용 안 함'}</Text>
      {error && <Text style={[styles.note, { color: colors.tint }]}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => onSave({ ...preset, name, songIds, folders })} style={[styles.save, { backgroundColor: colors.tint, opacity: busy ? 0.5 : 1 }]}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>프리셋 저장</Text>}</Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 22 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10 },
  heading: { fontSize: 23, fontWeight: '800' }, smallButton: { padding: 10 },
  input: { height: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, fontSize: 15, marginBottom: 10 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 13 }, tab: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18 },
  note: { fontSize: 12, lineHeight: 18, marginBottom: 10 }, list: { flexGrow: 1, paddingTop: 28, paddingBottom: 28 }, row: { minHeight: 70, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  expand: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }, choice: { flex: 1, minHeight: 70, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectionToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12 },
  identity: { flex: 1, gap: 4 }, title: { fontSize: 14, fontWeight: '600' }, detail: { fontSize: 12 }, empty: { textAlign: 'center', paddingVertical: 35 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingBottom: 10 }, save: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, saveText: { color: 'white', fontSize: 15, fontWeight: '700' },
});
