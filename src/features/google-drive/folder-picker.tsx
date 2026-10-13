import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { useInfiniteQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { loadDriveFolderPage, type DriveFolder } from '@/services/google-drive/api';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useColors } from '@/theme/tokens';

function useDriveFolders(parentId: string) {
  const account = useGoogleDriveStore(state => state.account);
  const generation = useGoogleDriveStore(state => state.generation);
  return useInfiniteQuery({
    queryKey: ['drive-folders', account?.id, generation, parentId],
    enabled: !!account,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) => loadDriveFolderPage(parentId, rejected => {
      if (!account) throw new Error('Google Drive를 먼저 연결해 주세요.');
      return useGoogleDriveStore.getState().accessToken(account.id, rejected);
    }, signal, pageParam),
    getNextPageParam: (last, _pages, _param, params) => params.includes(last.nextPageToken) ? undefined : last.nextPageToken,
    retry: 1,
  });
}

export function DriveFolderPicker({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const [path, setPath] = useState<DriveFolder[]>([{ id: 'root', name: '내 드라이브' }]);
  const current = path[path.length - 1];
  const query = useDriveFolders(current.id);
  const saving = useGoogleDriveStore(state => state.folderSaving);
  const savedFolders = useGoogleDriveStore(state => state.folders);
  const selectFolders = useGoogleDriveStore(state => state.selectFolders);
  const [selected, setSelected] = useState<DriveFolder[]>(() => savedFolders);
  const selectedIds = new Set(selected.map(folder => folder.id));
  const canSave = selected.length > 0 || savedFolders.length > 0;
  const [error, setError] = useState<string | null>(null);
  const folders = [...new Map(query.data?.pages.flatMap(page => page.folders).map(folder => [folder.id, folder]) ?? []).values()];
  const last = query.data?.pages.at(-1);
  const repeated = !!last?.nextPageToken && !!query.data?.pageParams.includes(last.nextPageToken);
  const notice = error ?? (repeated ? 'Google 폴더 페이지 정보가 반복됩니다. 다시 시도해 주세요.' : query.error?.message);
  function move(next: DriveFolder[]) { setError(null); setPath(next); }
  function toggle(folder: DriveFolder) {
    if (saving) return;
    setError(null);
    setSelected(previous => previous.some(item => item.id === folder.id) ? previous.filter(item => item.id !== folder.id) : [...previous, folder]);
  }
  async function select() {
    if (saving || !canSave) return;
    setError(null);
    try { await selectFolders(selected); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Google 폴더를 선택하지 못했습니다.'); }
  }
  return <PlaylistSheet title="Google Drive 음악 폴더" onClose={onClose}>
    <View style={{ paddingHorizontal: 22, paddingBottom: 16, gap: 12, flexShrink: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {path.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="상위 폴더" disabled={saving} onPress={() => move(path.slice(0, -1))} style={{ padding: 10 }}><Ionicons name="arrow-back" size={22} color={colors.tint} /></Pressable>}
        <Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{path.map(folder => folder.name).join(' / ')}</Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>체크해서 여러 폴더를 선택하세요. 폴더 이름을 누르면 하위 폴더를 열 수 있습니다. 하위 폴더의 음악도 포함하며 중복된 곡은 한 번만 가져옵니다.</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 13 }}>선택한 폴더 {selected.length}개</Text>
      {!!selected.length && <FlatList horizontal style={{ height: 48, flexGrow: 0 }} data={selected} keyExtractor={folder => folder.id}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 선택 해제`} disabled={saving} onPress={() => toggle(item)} style={{ minHeight: 44, maxWidth: 220, paddingHorizontal: 12, marginRight: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.separator, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={1} style={{ flexShrink: 1, color: saving ? colors.muted : colors.text }}>{item.name}</Text><Ionicons name="close" size={18} color={colors.muted} /></Pressable>}
      />}
      <FlatList key={current.id} style={{ height: 240, flexShrink: 1 }} data={folders} extraData={selected} keyExtractor={folder => folder.id}
        ListHeaderComponent={path.length > 1 ? <Pressable accessibilityRole="checkbox" accessibilityLabel={`${current.name} 폴더 전체 선택`} accessibilityState={{ checked: selectedIds.has(current.id), disabled: saving }} disabled={saving} onPress={() => toggle(current)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name={selectedIds.has(current.id) ? 'checkbox' : 'square-outline'} size={24} color={saving ? colors.muted : colors.tint} /><Text style={{ flex: 1, color: saving ? colors.muted : colors.text }}>현재 폴더 전체 선택</Text></Pressable> : null}
        renderItem={({ item }) => <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`${item.name} 폴더 선택`} accessibilityState={{ checked: selectedIds.has(item.id), disabled: saving }} disabled={saving} onPress={() => toggle(item)} style={{ width: 48, minHeight: 52, justifyContent: 'center' }}><Ionicons name={selectedIds.has(item.id) ? 'checkbox' : 'square-outline'} size={24} color={saving ? colors.muted : colors.tint} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 폴더 열기`} disabled={saving} onPress={() => move([...path, item])} style={{ flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name="folder-outline" size={24} color={saving ? colors.muted : colors.tint} /><Text numberOfLines={1} style={{ flex: 1, color: saving ? colors.muted : colors.text }}>{item.name}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
        </View>}
        ListEmptyComponent={query.isPending ? <ActivityIndicator color={colors.tint} /> : !notice ? <Text style={{ paddingVertical: 20, color: colors.muted }}>하위 폴더가 없습니다.</Text> : null}
        ListFooterComponent={query.hasNextPage ? <Pressable accessibilityRole="button" disabled={query.isFetchingNextPage || saving} onPress={() => void query.fetchNextPage()} style={{ paddingVertical: 14 }}>{query.isFetchingNextPage ? <ActivityIndicator color={colors.tint} /> : <Text style={{ color: colors.tint }}>폴더 더 불러오기</Text>}</Pressable> : null}
      />
      {notice && <><Text accessibilityRole="alert" style={{ color: colors.tint }}>{notice}</Text><Pressable accessibilityRole="button" disabled={saving || query.isFetching} onPress={() => { setError(null); void query.refetch(); }} style={{ paddingVertical: 8 }}><Text style={{ color: colors.tint }}>다시 시도</Text></Pressable></>}
      <Pressable accessibilityRole="button" disabled={!canSave || saving} onPress={() => void select()} style={{ padding: 14, borderRadius: 12, backgroundColor: colors.tint, opacity: !canSave || saving ? 0.5 : 1 }}>
        {saving ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: '700', textAlign: 'center' }}>{selected.length ? `선택한 ${selected.length}개 폴더 가져오기` : '폴더 선택 해제'}</Text>}
      </Pressable>
    </View>
  </PlaylistSheet>;
}
