import { TabScrollEdgeFade } from '@/components/tab-scroll-edge-fade';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { TextInput } from '@/components/text-input';
import { Text } from '@/components/text';
import { useKeyboardState } from 'react-native-keyboard-controller';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AsyncState } from '@/components/async-state';
import { ScreenHeader } from '@/components/screen-header';
import { ListLoading } from '@/components/list-loading';
import { SettingsButton } from '@/components/settings-button';
import { NativeSettingsToolbar } from '@/components/native-settings-toolbar';
import { SongRow } from '@/components/song-row';
import { useSearch } from '@/features/library/queries';
import { playAndOpenPlayer } from '@/features/playback/play-and-open-player';
import { useColors } from '@/theme/tokens';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { Stack } from 'expo-router';
import { workspaceLayout } from '@/theme/layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SearchScreen() {
  const colors = useColors();
  const glass = useLiquidGlass();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const nativeSearch = Platform.OS === 'ios' && !workspaceLayout(width, height, fontScale).expanded;
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(input), 350);
    return () => clearTimeout(timer);
  }, [input]);
  const query = useSearch(term);
  const songs = query.data?.items ?? [];
  const hasSongs = songs.length > 0;
  const debouncing = input.trim() !== term.trim();
  const loading = !!input.trim() && (debouncing || query.isPending);
  const hasResultsList = !!input.trim() && !loading && hasSongs;
  const refresh = () => {
    void query.refetch();
  };
  const resultSummary = (
    <View>
      <Text style={[styles.results, { color: colors.muted }]}>
        {query.data?.total ?? 0}곡
      </Text>
      {query.data?.stale && (
        <Text style={[styles.notice, { color: colors.muted }]}>
          오프라인 보관함 · 마지막으로 저장된 목록
        </Text>
      )}
      {query.isRefetchError && (
        <Pressable accessibilityRole="button" onPress={refresh} style={styles.notice}>
          <Text style={{ color: colors.text }}>{query.error.message}</Text>
          <Text style={{ color: colors.tint }}>다시 시도</Text>
        </Pressable>
      )}
    </View>
  );
  let searchContent: React.ReactNode;
  if (!input.trim()) {
    searchContent = (
      <View style={styles.prompt}>
        <Ionicons name="musical-notes-outline" size={50} color={colors.muted} />
        <Text style={[styles.promptText, { color: colors.muted }]}>
          듣고 싶은 음악을 찾아보세요.
        </Text>
      </View>
    );
  } else if (loading) {
    searchContent = <ListLoading />;
  } else if (!hasResultsList) {
    searchContent = (
      <AsyncState error={query.isError && !query.data ? query.error.message : null} retry={refresh}>
        <View style={styles.list}>
          {resultSummary}
          <Text style={[styles.empty, { color: colors.muted }]}>
            “{term.trim()}”에 대한 검색 결과가 없습니다.
          </Text>
        </View>
      </AsyncState>
    );
  } else {
    searchContent = (
      <TabScrollEdgeFade topEnabled={!nativeSearch}>
        <FlatList
          key={term.trim()}
          data={songs}
          keyExtractor={(song) => song.id}
          contentContainerStyle={[
            styles.list,
            keyboardVisible ? styles.listWithKeyboard : styles.listWithSongs,
          ]}
          contentInsetAdjustmentBehavior={nativeSearch ? 'automatic' : undefined}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          alwaysBounceVertical
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              colors={[colors.tint]}
              tintColor={colors.tint}
              progressBackgroundColor={colors.surface}
            />
          }
          ListHeaderComponent={resultSummary}
          renderItem={({ item, index }) => (
            <SongRow
              song={item}
              onPress={() => {
                Keyboard.dismiss();
                void playAndOpenPlayer(songs, index);
              }}
            />
          )}
        />
      </TabScrollEdgeFade>
    );
  }
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background },
        glass.supported && { paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      {nativeSearch ? (
        <NativeSettingsToolbar />
      ) : (
        <ScreenHeader title="검색" action={<SettingsButton />} />
      )}
      {nativeSearch ? (
        <Stack.SearchBar
          placeholder="노래, 아티스트, 앨범"
          cancelButtonText="취소"
          placement="stacked"
          hideWhenScrolling={false}
          hideNavigationBar
          obscureBackground={false}
          allowToolbarIntegration={false}
          tintColor={colors.tint}
          textColor={colors.text}
          autoCapitalize="none"
          onChangeText={(event) => {
            const text = event.nativeEvent.text;
            setInput(text);
            if (!text.trim()) {
              setTerm('');
            }
          }}
          onSearchButtonPress={(event) => {
            setTerm(event.nativeEvent.text);
            Keyboard.dismiss();
          }}
          onCancelButtonPress={() => {
            setInput('');
            setTerm('');
            Keyboard.dismiss();
          }}
        />
      ) : (
        <View
          style={[
            styles.search,
            { backgroundColor: colors.surface, borderColor: colors.separator },
            glass.supported && {
              minHeight: 44,
              borderRadius: 10,
              borderWidth: 0,
              paddingHorizontal: 16,
            },
          ]}
        >
          <Ionicons name="search" color={colors.muted} size={20} />
          <TextInput
            accessibilityLabel="음악 검색"
            style={[styles.input, { color: colors.text }]}
            value={input}
            onChangeText={(text) => {
              setInput(text);
              if (!text.trim()) {
                setTerm('');
              }
            }}
            placeholder="노래, 아티스트, 앨범"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            onSubmitEditing={({ nativeEvent }) => {
              setTerm(nativeEvent.text);
              Keyboard.dismiss();
            }}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      )}
      {nativeSearch && !hasResultsList ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.status}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={false}
          bounces={false}
        >
          {searchContent}
        </ScrollView>
      ) : (
        searchContent
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  status: { flexGrow: 1 },
  search: {
    marginHorizontal: 22,
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
  },
  input: { flex: 1, fontSize: 16 },
  prompt: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingBottom: 130 },
  promptText: { fontSize: 15 },
  list: { flexGrow: 1, paddingHorizontal: 22 },
  listWithSongs: { paddingBottom: 180 },
  listWithKeyboard: { paddingBottom: 24 },
  results: { fontSize: 13, fontWeight: '700', paddingTop: 28, paddingBottom: 9 },
  notice: { marginBottom: 14, gap: 6, fontSize: 12 },
  empty: { textAlign: 'center', paddingVertical: 40 },
});
