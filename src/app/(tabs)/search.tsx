import { useEffect, useState } from 'react';
import { Keyboard, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AsyncState } from '@/components/async-state';
import { ScreenHeader } from '@/components/screen-header';
import { SongRow } from '@/components/song-row';
import { useSearch } from '@/features/library/queries';
import { playAndOpenPlayer } from '@/features/playback/play-and-open-player';
import { useColors } from '@/theme/tokens';

export default function SearchScreen() {
  const colors = useColors();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const timer = setTimeout(() => setTerm(input), 350); return () => clearTimeout(timer); }, [input]);
  const query = useSearch(term);
  const songs = query.data?.items ?? [];
  const debouncing = input.trim() !== term.trim();
  const refresh = () => { void query.refetch(); };
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ScreenHeader title="검색" />
    <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
      <Ionicons name="search" color={colors.muted} size={20} />
      <TextInput style={[styles.input, { color: colors.text }]} value={input} onChangeText={(text) => { setInput(text); if (!text.trim()) setTerm(''); }} placeholder="노래, 아티스트, 앨범" placeholderTextColor={colors.muted} returnKeyType="search" onSubmitEditing={({ nativeEvent }) => { setTerm(nativeEvent.text); Keyboard.dismiss(); }} autoCorrect={false} autoCapitalize="none" />
    </View>
    {!input.trim() ? <View style={styles.prompt}><Ionicons name="musical-notes-outline" size={50} color={colors.muted} /><Text style={[styles.promptText, { color: colors.muted }]}>듣고 싶은 음악을 찾아보세요.</Text></View> : <AsyncState loading={debouncing || query.isPending} error={query.isError && !query.data ? query.error.message : null} retry={refresh}>
      <FlatList key={term.trim()} data={songs} keyExtractor={(song) => song.id} contentContainerStyle={[styles.list, keyboardVisible && styles.listWithKeyboard]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" alwaysBounceVertical
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} colors={[colors.tint]} tintColor={colors.tint} progressBackgroundColor={colors.surface} />}
        ListHeaderComponent={<View><Text style={[styles.results, { color: colors.muted }]}>{query.data?.total ?? 0}곡</Text>
          {query.data?.stale && <Text style={[styles.notice, { color: colors.muted }]}>오프라인 보관함 · 마지막으로 저장된 목록</Text>}
          {query.isRefetchError && <Pressable accessibilityRole="button" onPress={refresh} style={styles.notice}><Text style={{ color: colors.text }}>{query.error.message}</Text><Text style={{ color: colors.tint }}>다시 시도</Text></Pressable>}
        </View>}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>“{term.trim()}”에 대한 검색 결과가 없습니다.</Text>}
        renderItem={({ item, index }) => <SongRow song={item} onPress={() => void playAndOpenPlayer(songs, index)} />} />
    </AsyncState>}
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, search: { marginHorizontal: 22, borderWidth: 1, borderRadius: 12, height: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 }, input: { flex: 1, fontSize: 16 }, prompt: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingBottom: 130 }, promptText: { fontSize: 15 }, list: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 180 }, listWithKeyboard: { paddingBottom: 24 }, results: { fontSize: 13, fontWeight: '700', paddingTop: 22, paddingBottom: 9 }, notice: { marginBottom: 14, gap: 6, fontSize: 12 }, empty: { textAlign: 'center', paddingVertical: 40 } });
