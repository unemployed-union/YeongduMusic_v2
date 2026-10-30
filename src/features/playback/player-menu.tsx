import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { usePlaybackVisibility } from './use-playback-visibility';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
} from 'react-native-reanimated';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlaybackStore } from '@/stores/playback';
import { useOfflineMusicStore } from '@/stores/offline-music';
import { SleepTimerOptions } from './sleep-timer-options';
import { SectionRepeatOptions } from './section-repeat-options';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { visibleMenuIds } from '@/features/settings/menu-layout';
import { sectionClock } from '@/services/playback/section-repeat';
import { PlaybackSpeedOptions } from './playback-speed-options';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import { playHaptic } from '@/services/haptics';
import { useBlurIntensity } from '@/stores/blur-preferences';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { GlassBackdrop } from '@/components/glass-backdrop';

export type PlayerMenuAction =
  | 'lyrics'
  | 'add-song'
  | 'save-queue'
  | 'equalizer'
  | 'album'
  | 'artist'
  | 'download'
  | 'delete-local'
  | 'edit-metadata';
interface Props {
  kind?: 'playback' | 'details';
  canDownload?: boolean;
  localSong?: boolean;
  blurTarget: RefObject<View | null>;
  panel: 'artwork' | 'queue' | 'lyrics';
  bottom: number;
  maxHeight: number;
  left?: number;
  onClose: () => void;
  onSelect: (action: PlayerMenuAction) => void;
}

const ENTER_OVERLAY = FadeIn.duration(200);
const EXIT_OVERLAY = FadeOut.duration(160);
const ENTER_CARD = FadeInDown.duration(200)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ translateY: 8 });
const EXIT_CARD = FadeOutDown.duration(160)
  .easing(Easing.in(Easing.cubic))
  .withTargetValues({ translateY: 8 });

/** Stay mounted so a retained exiting backdrop immediately loses hit testing. */
export function PlayerMenuLayer({ active, children }: { active: boolean; children: ReactNode }) {
  const interactive = active && !!children;
  return (
    <View
      collapsable={false}
      style={StyleSheet.absoluteFill}
      pointerEvents={interactive ? 'box-none' : 'none'}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}

/** An inline popover lets playlist dialogs open without stacking native modals. */
export function PlayerMenu({
  kind = 'playback',
  canDownload = false,
  localSong = false,
  blurTarget,
  panel,
  bottom,
  maxHeight,
  left,
  onClose,
  onSelect,
}: Props) {
  const colors = useColors();
  const light = useAppColorScheme() === 'light';
  const glass = useLiquidGlass('playerMenu');
  const blurIntensity = useBlurIntensity('playerMenu');
  const opaque = !glass.enabled && (light || blurIntensity === 0 || glass.reduceTransparency);
  const [options, setOptions] = useState<
    'sleep-timer' | 'section-repeat' | 'playback-speed' | null
  >(null);
  const preferences = useMenuPreferences((state) => state.layout.player);
  const storageBusy = useOfflineMusicStore((state) => state.busy);
  const canCancelDownload = useOfflineMusicStore(
    (state) => state.busy && !state.saving && !!state.retrySong,
  );
  const cancellingDownload = useOfflineMusicStore((state) => state.cancelling);
  const cancelDownload = useOfflineMusicStore((state) => state.cancel);
  const timer = usePlaybackStore((state) => state.sleepTimer);
  const section = usePlaybackStore((state) => state.sectionRepeat);
  const playbackRate = usePlaybackStore((state) => state.playbackRate);
  const [now, setNow] = useState(Date.now);
  const visible = usePlaybackVisibility();
  useEffect(() => {
    if (!visible || kind !== 'playback' || timer?.mode !== 'time') {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer, kind, visible]);
  let timerLabel: string;
  if (!timer) {
    timerLabel = '수면 타이머';
  } else if (timer.mode === 'track') {
    timerLabel = '수면 타이머 · 현재 곡 끝나면';
  } else {
    timerLabel =
      '수면 타이머 · ' + Math.max(0, Math.ceil((timer.endsAt - now) / 60_000)) + '분 남음';
  }

  const items: {
    action: PlayerMenuAction | 'sleep-timer' | 'section-repeat' | 'playback-speed';
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    selected?: boolean;
  }[] =
    kind === 'details'
      ? [
          { action: 'album', label: '앨범으로 이동', icon: 'disc-outline' },
          { action: 'artist', label: '가수로 이동', icon: 'person-outline' },
        ]
      : [
          {
            action: 'lyrics',
            label: panel === 'lyrics' ? '가사 닫기' : '가사 보기',
            icon: 'chatbox-ellipses-outline',
            selected: panel === 'lyrics',
          },
          { action: 'add-song', label: '플레이리스트에 추가', icon: 'add-circle-outline' },
          { action: 'edit-metadata', label: '메타데이터 수정', icon: 'create-outline' },
          { action: 'save-queue', label: '대기열을 플레이리스트로 저장', icon: 'save-outline' },
          { action: 'equalizer', label: '시스템 이퀄라이저', icon: 'options-outline' },
          { action: 'sleep-timer', label: timerLabel, icon: 'moon-outline', selected: !!timer },
          {
            action: 'section-repeat',
            label:
              section?.enabled && section.end !== null
                ? `구간 반복 · ${sectionClock(section.start)}–${sectionClock(section.end)}`
                : '구간 반복',
            icon: 'repeat-outline',
            selected: !!section?.enabled,
          },
          {
            action: 'playback-speed',
            label: `배속 · ${playbackRate}배`,
            icon: 'speedometer-outline',
            selected: playbackRate !== 1,
          },
        ];
  if (kind === 'playback' && (canDownload || canCancelDownload)) {
    let downloadActionLabel: string;
    if (cancellingDownload) {
      downloadActionLabel = '보관 다운로드 취소 중…';
    } else if (canCancelDownload) {
      downloadActionLabel = '보관 다운로드 취소';
    } else if (storageBusy) {
      downloadActionLabel = '음악 보관 작업 중';
    } else {
      downloadActionLabel = '이 기기에 보관';
    }
    items.splice(1, 0, {
      action: 'download',
      label: downloadActionLabel,
      icon: canCancelDownload ? 'stop-circle-outline' : 'download-outline',
    });
  }
  if (kind === 'playback' && localSong) {
    items.push({ action: 'delete-local', label: '기기의 음악 복사본 삭제', icon: 'trash-outline' });
  }
  const visibleItems =
    kind === 'details'
      ? items
      : visibleMenuIds(preferences).flatMap((action) =>
          items.filter((item) => item.action === action),
        );
  const activeOptions =
    options && preferences.some((item) => item.id === options && item.visible) ? options : null;
  let optionsPanel: React.ReactNode;
  if (kind === 'playback' && activeOptions === 'sleep-timer') {
    optionsPanel = <SleepTimerOptions onBack={() => setOptions(null)} onClose={onClose} />;
  } else if (kind === 'playback' && activeOptions === 'section-repeat') {
    optionsPanel = <SectionRepeatOptions onBack={() => setOptions(null)} />;
  } else if (kind === 'playback' && activeOptions === 'playback-speed') {
    optionsPanel = <PlaybackSpeedOptions onBack={() => setOptions(null)} />;
  } else {
    optionsPanel = visibleItems.map(({ action, label, icon, selected }) => (
      <Pressable
        key={action}
        disabled={
          action === 'download'
            ? !!cancellingDownload || (storageBusy && !canCancelDownload)
            : storageBusy && action === 'delete-local'
        }
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected }}
        onPress={() => {
          playHaptic('selection');
          if (action === 'download' && canCancelDownload) {
            cancelDownload();
            onClose();
          } else if (
            action === 'sleep-timer' ||
            action === 'section-repeat' ||
            action === 'playback-speed'
          ) {
            setOptions(action);
          } else {
            onSelect(action);
          }
        }}
        style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.separator }]}
      >
        <Ionicons name={icon} size={23} color={selected ? colors.tint : colors.text} />
        <Text style={[styles.label, { color: selected ? colors.tint : colors.text }]}>{label}</Text>
      </Pressable>
    ));
  }
  return (
    <Animated.View
      collapsable={false}
      entering={glass.enabled ? undefined : ENTER_OVERLAY}
      exiting={glass.enabled ? undefined : EXIT_OVERLAY}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessibilityViewIsModal
    >
      <Pressable
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        accessibilityRole="button"
        accessibilityLabel={kind === 'details' ? '가수 메뉴 닫기' : '재생 메뉴 닫기'}
        onPress={onClose}
      />
      <Animated.View
        collapsable={false}
        entering={glass.enabled ? undefined : ENTER_CARD}
        exiting={glass.enabled ? undefined : EXIT_CARD}
        layout={glass.enabled ? LinearTransition.duration(180) : undefined}
        style={[
          styles.card,
          { bottom, maxHeight, borderColor: colors.separator },
          opaque && { backgroundColor: colors.surface },
          glass.supported && { borderRadius: 26 },
          glass.enabled && { backgroundColor: 'transparent', borderWidth: 0 },
          kind === 'details' && { left: 29, right: undefined },
          left !== undefined && { left, right: undefined },
        ]}
      >
        <View
          style={[
            styles.surface,
            opaque && { backgroundColor: colors.surface },
            glass.supported && { borderRadius: 26 },
            glass.enabled && { backgroundColor: 'transparent' },
          ]}
        >
          {glass.enabled ? (
            <GlassBackdrop style={{ borderRadius: 26 }} />
          ) : (
            <>
              {!opaque && (
                <BlurView
                  pointerEvents="none"
                  blurTarget={blurTarget}
                  blurMethod="dimezisBlurView"
                  intensity={blurIntensity}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
              )}
              {!opaque && (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint]} />
              )}
            </>
          )}
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {optionsPanel}
            {kind === 'playback' && !activeOptions && visibleItems.length === 0 && (
              <View>
                <Text style={[styles.empty, { color: colors.muted }]}>
                  선택한 메뉴는 현재 곡에서 사용할 수 없습니다.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    router.push('/settings/player-menu');
                  }}
                  style={styles.item}
                >
                  <Ionicons name="settings-outline" size={23} color={colors.text} />
                  <Text style={[styles.label, { color: colors.text }]}>재생 화면 메뉴 설정</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#00000030' },
  card: {
    position: 'absolute',
    right: 29,
    width: 300,
    maxWidth: '85%',
    borderRadius: 18,
    backgroundColor: '#00000030',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF30',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 12,
  },
  surface: {
    flexShrink: 1,
    minHeight: 0,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#00000040',
  },
  tint: { backgroundColor: '#000000A6' },
  content: { padding: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  pressed: { backgroundColor: '#FFFFFF16' },
  label: { flex: 1, color: 'white', fontSize: 15, fontWeight: '600' },
  selected: { color: '#FF9BAE' },
  empty: { color: '#FFFFFFA6', fontSize: 13, lineHeight: 20, padding: 14 },
});
