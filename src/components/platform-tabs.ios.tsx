import { useState } from 'react';
import { Redirect, useIsFocused, useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useWindowDimensions } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useMenuPreferences } from '@/stores/menu-preferences';
import {
  BOTTOM_MENU_HREFS,
  BOTTOM_MENU_ROUTES,
  MENU_LABELS,
  visibleMenuIds,
} from '@/features/settings/menu-layout';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { useColors } from '@/theme/tokens';
import { workspaceLayout } from '@/theme/layout';
import { playHaptic } from '@/services/haptics';
import { NativeTabsEnabledContext } from './native-tabs-context';
import { MiniPlayerContent, type MiniPlayerContentProps } from './mini-player-content';
import { usePlaybackStore } from '@/stores/playback';
import { useMiniPlayerColors } from '@/theme/use-player-colors';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';
import type { PlatformTabsProps } from './platform-tabs';

const icons = {
  library: { default: 'square.stack', selected: 'square.stack.fill' },
  playlists: { default: 'music.note.list', selected: 'music.note.list' },
  search: { default: 'magnifyingglass', selected: 'magnifyingglass' },
} as const;

export function PlatformTabs({ fallback: Fallback }: PlatformTabsProps) {
  const glass = useLiquidGlass('tabBar');
  return glass.supported ? <SystemTabs /> : <Fallback />;
}

/** UIKit mounts both placements. They receive one snapshot and own no playback effects. */
export function NativeMiniPlayer(props: MiniPlayerContentProps) {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <MiniPlayerContent {...props} embedded compact={placement === 'inline'} />;
}

/** UIKit owns the floating, deforming selection lens and its pan gesture. */
export function SystemTabs() {
  const colors = useColors();
  const miniColors = useMiniPlayerColors();
  const miniGlass = useLiquidGlass('miniPlayer');
  const playbackVisible = usePlaybackVisibility();
  const savedBottom = useMenuPreferences((state) => state.layout.bottom);
  const focused = useIsFocused();
  const [displayedBottom, setDisplayedBottom] = useState(savedBottom);
  // Defer native menu changes while Settings covers the navigator. Otherwise hiding
  // the selected tab would give UIKit an invalid selection before we can redirect.
  if (focused && displayedBottom !== savedBottom) {
    setDisplayedBottom(savedBottom);
  }
  const bottom = focused ? savedBottom : displayedBottom;
  const segments = useSegments();
  const { width, height, fontScale } = useWindowDimensions();
  const tablet = workspaceLayout(width, height, fontScale).expanded;
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const song = usePlaybackStore((state) => state.queue[state.index]);
  const playing = usePlaybackStore((state) => state.playing);
  const buffering = usePlaybackStore((state) => state.buffering);
  const visible = visibleMenuIds(bottom);
  const current = segments.at(1);
  // Hidden native tabs cannot be selected, including after changing the menu in Settings.
  if (current && bottom.some((item) => BOTTOM_MENU_ROUTES[item.id] === current && !item.visible)) {
    return <Redirect href={BOTTOM_MENU_HREFS[visible[0]]} />;
  }
  const ordered = [
    ...bottom.filter((item) => item.visible),
    ...bottom.filter((item) => !item.visible),
  ];
  return (
    <NativeTabsEnabledContext.Provider value>
      <NativeTabs
        hidden={keyboardVisible || tablet}
        sidebarAdaptable={false}
        // FlatList cannot drive UIKit's minimize-on-scroll in this Router version.
        // Keep virtualization and a persistent accessory rather than guess scroll offsets.
        minimizeBehavior="never"
        tintColor={colors.tint}
        iconColor={{ default: colors.muted, selected: colors.tint }}
        labelStyle={{ default: { color: colors.muted }, selected: { color: colors.tint } }}
        disableTransparentOnScrollEdge
        screenListeners={{ tabPress: () => playHaptic('selection') }}
      >
        {song && !keyboardVisible && !tablet && (
          <NativeTabs.BottomAccessory>
            <NativeMiniPlayer
              song={song}
              playing={playing}
              buffering={buffering}
              active={playbackVisible}
              colors={miniColors}
              glassSupported={miniGlass.supported}
              glassEnabled={miniGlass.enabled}
              largeText={fontScale >= 1.3}
            />
          </NativeTabs.BottomAccessory>
        )}
        {ordered.map((item) => (
          <NativeTabs.Trigger
            key={item.id}
            name={BOTTOM_MENU_ROUTES[item.id]}
            hidden={!item.visible}
            disableAutomaticContentInsets
            testID={'native-tab-' + item.id}
            accessibilityLabel={MENU_LABELS[item.id]}
            contentStyle={{ backgroundColor: colors.background }}
          >
            <NativeTabs.Trigger.Icon sf={icons[item.id]} />
            <NativeTabs.Trigger.Label>{MENU_LABELS[item.id]}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    </NativeTabsEnabledContext.Provider>
  );
}
