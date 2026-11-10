import { useEffect, useMemo } from 'react';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { useSongArtworkStore } from '@/stores/song-artwork';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { applyLibraryEdits } from '@/features/library/song-library';
import { FlatList, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { musicProviders } from '@/services/music-providers/registry';
import { useProviderStates } from '@/features/library/use-source-libraries';
import { Text } from '@/components/text';
import { SongRow } from '@/components/song-row';
import { ListLoading } from '@/components/list-loading';
import { playAndOpenPlayer } from '@/features/playback/play-and-open-player';
import { useColors } from '@/theme/tokens';
import type { ServerPlaylist } from '@/types/music';
import { useLibraryActivity } from '@/features/library/use-library-activity';
import { LIBRARY_GC_MS } from '@/services/music-providers/library-policy';
import { acquireLibraryQuery } from '@/services/music-providers/query-library-task';

export function ServerPlaylists() {
  const active = useLibraryActivity();
  const queryClient = useQueryClient();
  const colors = useColors();
  const states = useProviderStates();
  const providers = musicProviders.filter((provider) => !!provider.playlists);
  const resourceKeys = JSON.stringify(providers.filter((provider) => provider.getState().ready && provider.getState().connected)
    .map((provider) => ['provider-playlists', provider.id, provider.getState().scope, provider.getState().generation]));
  useEffect(() => {
    if (active) {
      const keys: unknown[][] = JSON.parse(resourceKeys);
      const releases = keys.map((key) => acquireLibraryQuery(queryClient, key));
      return () => releases.forEach((release) => release());
    }
  }, [active, queryClient, resourceKeys]);
  const queries = useQueries({
    queries: providers.map((provider) => {
      const state = states[musicProviders.indexOf(provider)];
      return {
        queryKey: ['provider-playlists', provider.id, state.scope, state.generation],
        enabled: active && state.ready && state.connected,
        staleTime: Infinity,
        gcTime: LIBRARY_GC_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: ({ signal }: { signal: AbortSignal }) => provider.playlists!.list(signal),
        retry: false,
      };
    }),
  });
  return (
    <View style={{ gap: 12, marginTop: 16 }}>
      {providers.map((provider, index) => {
        if (!provider.getState().connected) {
          return null;
        }
        const query = queries[index];
        return (
          <View key={provider.id} style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: colors.muted, fontWeight: '700' }}>
              {provider.name} · 서버 플레이리스트
            </Text>
            {query.isPending && <Text style={{ color: colors.muted }}>목록을 불러오는 중…</Text>}
            {query.isError && (
              <Pressable
                accessibilityRole="button"
                onPress={() => void query.refetch()}
                style={{ paddingVertical: 12 }}
              >
                <Text style={{ color: colors.tint }}>{query.error.message} · 다시 시도</Text>
              </Pressable>
            )}
            {query.data?.map((playlist) => (
              <Pressable
                key={playlist.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/server-playlist',
                    params: {
                      provider: provider.id,
                      scope: playlist.ref.accountScope,
                      id: playlist.ref.remoteId,
                      name: playlist.name,
                    },
                  })
                }
                style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 18 }}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>{playlist.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 4 }}>서버 목록 · 읽기 전용</Text>
              </Pressable>
            ))}
            {query.isSuccess && !query.data.length && (
              <Text style={{ color: colors.muted }}>
                서버에 표시할 음악 플레이리스트가 없습니다.
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function ServerPlaylistScreen() {
  const active = useLibraryActivity();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    provider?: string;
    scope?: string;
    id?: string;
    name?: string;
  }>();
  const colors = useColors();
  useProviderStates();
  const provider = musicProviders.find((item) => item.id === params.provider);
  const state = provider?.getState();
  const available =
    !!provider?.playlists &&
    !!params.id &&
    !!params.scope &&
    !!state?.connected &&
    state.scope === params.scope;
  const playlist: ServerPlaylist = {
    id: params.id ?? '',
    name: params.name || '서버 플레이리스트',
    ref: {
      providerId: provider?.id ?? 'jellyfin',
      accountScope: params.scope ?? '',
      remoteId: params.id ?? '',
    },
  };
  const resourceKey = JSON.stringify(['provider-playlist-songs', provider?.id, params.scope, params.id, state?.generation]);
  useEffect(() => {
    if (active && available) {
      return acquireLibraryQuery(queryClient, JSON.parse(resourceKey));
    }
  }, [active, available, queryClient, resourceKey]);
  const query = useQuery({
    queryKey: ['provider-playlist-songs', provider?.id, params.scope, params.id, state?.generation],
    enabled: available && active,
    staleTime: Infinity,
    gcTime: LIBRARY_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => provider!.playlists!.songs(playlist, signal),
    retry: false,
  });
  const metadata = useSongMetadataStore((value) => value.patches);
  const artwork = useSongArtworkStore((value) => value.patches);
  const artworkBaseUri = useSongArtworkStore((value) => value.baseUri);
  const scope = useHiddenMusicStore((value) => value.scope);
  const songs = useMemo(
    () =>
      applyLibraryEdits(
        { items: query.data ?? [], total: query.data?.length ?? 0 },
        { metadata, artwork, artworkBaseUri, scope },
      ).items,
    [query.data, metadata, artwork, artworkBaseUri, scope],
  );
  let content;
  if (!available) {
    content = (
      <Text style={{ color: colors.muted, padding: 20 }}>
        이 플레이리스트의 서비스 계정을 다시 연결해 주세요.
      </Text>
    );
  } else if (query.isPending) {
    content = <ListLoading />;
  } else if (query.isError && !query.data) {
    content = (
      <Pressable
        accessibilityRole="button"
        onPress={() => void query.refetch()}
        style={{ padding: 20 }}
      >
        <Text style={{ color: colors.tint }}>{query.error.message} · 다시 시도</Text>
      </Pressable>
    );
  } else {
    content = (
      <FlatList
        data={songs}
        keyExtractor={(song, index) => song.id + ':' + index}
        contentContainerStyle={{ paddingBottom: 180 }}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, padding: 20 }}>플레이리스트에 음악이 없습니다.</Text>
        }
        renderItem={({ item, index }) => (
          <SongRow song={item} index={index} onPress={() => void playAndOpenPlayer(songs, index)} />
        )}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 20, gap: 12 }}>
        <Text
          accessibilityRole="header"
          style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}
        >
          {playlist.name}
        </Text>
        <Text style={{ color: colors.muted }}>서버 목록 · 읽기 전용</Text>
        {query.isError && query.data && (
          <Pressable disabled={query.isFetching} onPress={() => void query.refetch()}>
            <Text style={{ color: colors.tint }}>{query.error.message} · 다시 시도</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={!songs.length}
          onPress={() => void playAndOpenPlayer(songs, 0)}
          style={{
            padding: 14,
            backgroundColor: colors.tint,
            borderRadius: 12,
            opacity: songs.length ? 1 : 0.4,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center' }}>전체 재생</Text>
        </Pressable>
      </View>
      {content}
    </View>
  );
}
