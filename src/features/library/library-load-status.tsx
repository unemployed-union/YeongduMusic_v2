import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useIsFetching } from '@tanstack/react-query';
import { Text } from '@/components/text';
import { ProgressBar } from '@/components/progress-bar';
import { useColors } from '@/theme/tokens';
import { useAuthStore } from '@/stores/auth';
import { useLocalMusicStore } from '@/stores/local-music';
import { musicProviders } from '@/services/music-providers/registry';
import { libraryIdentity } from './repository';
import { libraryLoadSnapshot, subscribeLibraryLoads } from './load-progress';
import { useProviderStates } from './use-source-libraries';

type Props = {
  active?: boolean;
  refreshing: boolean;
  error: string | null;
  message: string | null;
  onRetry: () => Promise<void>;
};

export function LibraryLoadStatus({ active = true, refreshing, error, message, onRetry }: Props) {
  const colors = useColors();
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const source = useLocalMusicStore((state) => state.source);
  const states = useProviderStates();
  const tasks = useSyncExternalStore(subscribeLibraryLoads, libraryLoadSnapshot, libraryLoadSnapshot);
  const identity = libraryIdentity(mode, session);
  const includeNas = source === 'nas' || source === 'all';
  const task = includeNas ? tasks.find((item) => item.key === identity) : undefined;
  const nasFetching = useIsFetching({
    predicate: (query) => includeNas && query.queryKey[0] === 'song-library' && query.queryKey[1] === identity,
  }) > 0;
  const waiting = musicProviders
    .filter((provider, index) =>
      states[index].loading && (source === 'all' || source === provider.id || provider.id === 'local'),
    )
    .map((provider) => provider.name);
  if (nasFetching && !task) {
    waiting.unshift('NAS 음악');
  }
  const busy = refreshing || !!task || waiting.length > 0;
  if (!active || (!busy && !error && !message)) {
    return null;
  }
  let nasLabel = 'NAS 음악 · 전체 곡 수 확인 중…';
  let percent: number | null = null;
  if (task && task.total !== null) {
    percent = task.total > 0 ? Math.min(100, Math.round(100 * task.loaded / task.total)) : 100;
    nasLabel = `NAS 음악 · ${task.loaded.toLocaleString()} / ${task.total.toLocaleString()}곡 · ${percent}%`;
  }
  const waitingLabel = waiting.length ? waiting.join(' · ') + ' 불러오는 중…' : '음악 목록 확인 중…';
  return (
    <View style={styles.status}>
      {task && (
        <View style={styles.progress}>
          <Text style={[styles.label, { color: colors.muted }]}>{nasLabel}</Text>
          <ProgressBar percent={percent} label={nasLabel} />
        </View>
      )}
      {(waiting.length > 0 || (refreshing && !task)) && (
        <View style={styles.progress}>
          <Text numberOfLines={2} style={[styles.label, { color: colors.muted }]}>{waitingLabel}</Text>
          <ProgressBar percent={null} label={waitingLabel} />
        </View>
      )}
      {(error || (!busy && message)) && (
        <Pressable
          accessibilityRole="button"
          disabled={!error || busy}
          onPress={() => void onRetry()}
          style={styles.notice}
        >
          <Text style={{ color: error ? colors.tint : colors.muted }}>
            {error ? error + ' · 다시 시도' : message}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  status: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 8, gap: 10 },
  progress: { gap: 6 },
  label: { fontSize: 12 },
  notice: { paddingVertical: 4 },
});
