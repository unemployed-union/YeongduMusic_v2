import { useRef, useState } from 'react';
import { Redirect, useIsFocused, useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { View, useWindowDimensions } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { BOTTOM_MENU_HREFS, BOTTOM_MENU_ROUTES, MENU_LABELS, visibleMenuIds } from '@/features/settings/menu-layout';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { useColors } from '@/theme/tokens';
import { workspaceLayout } from '@/theme/layout';
import { playHaptic } from '@/services/haptics';
import { NativeTabsEnabledContext } from './native-tabs-context';
import { MiniPlayer } from './mini-player';
import { usePlaybackStore } from '@/stores/playback';
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

/** UIKit owns the floating, deforming selection lens and its pan gesture. */
export function SystemTabs() {
  const colors = useColors(), glass = useLiquidGlass('tabBar');
  const savedBottom = useMenuPreferences(state => state.layout.bottom);
  const focused = useIsFocused();
  const [displayedBottom, setDisplayedBottom] = useState(savedBottom);
  // Defer native menu changes while Settings covers the navigator. Otherwise hiding
  // the selected tab would give UIKit an invalid selection before we can redirect.
  if (focused && displayedBottom !== savedBottom) setDisplayedBottom(savedBottom);
  const bottom = focused ? savedBottom : displayedBottom;
  const segments = useSegments();
  const { width, height, fontScale } = useWindowDimensions();
  const tablet = workspaceLayout(width, height, fontScale).expanded;
  const keyboardVisible = useKeyboardState(state => state.isVisible);
  const hasSong = usePlaybackStore(state => !!state.queue[state.index]);
  const accessoryTarget = useRef<View | null>(null);
  const visible = visibleMenuIds(bottom);
  const current = segments[1];
  // Hidden native tabs cannot be selected, including after changing the menu in Settings.
  if (current && bottom.some(item => BOTTOM_MENU_ROUTES[item.id] === current && !item.visible)) {
    return <Redirect href={BOTTOM_MENU_HREFS[visible[0]]} />;
  }
  const ordered = [...bottom.filter(item => item.visible), ...bottom.filter(item => !item.visible)];
  return <NativeTabsEnabledContext.Provider value>
    <NativeTabs hidden={keyboardVisible || tablet} sidebarAdaptable={false} minimizeBehavior="never"
      tintColor={colors.tint} iconColor={{ default: colors.muted, selected: colors.tint }}
      labelStyle={{ default: { color: colors.muted }, selected: { color: colors.tint } }}
      disableTransparentOnScrollEdge backgroundColor={glass.enabled ? undefined : colors.surface}
      blurEffect={glass.enabled ? undefined : 'none'}
      screenListeners={{ tabPress: () => playHaptic('selection') }}>
      {hasSong && !keyboardVisible && !tablet && <NativeTabs.BottomAccessory>
        <MiniPlayer embedded blurTarget={accessoryTarget} />
      </NativeTabs.BottomAccessory>}
      {ordered.map(item => <NativeTabs.Trigger key={item.id} name={BOTTOM_MENU_ROUTES[item.id]}
        hidden={!item.visible} disableAutomaticContentInsets testID={'native-tab-' + item.id} accessibilityLabel={MENU_LABELS[item.id]}
        contentStyle={{ backgroundColor: colors.background }}>
        <NativeTabs.Trigger.Icon sf={icons[item.id]} />
        <NativeTabs.Trigger.Label>{MENU_LABELS[item.id]}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>)}
    </NativeTabs>
  </NativeTabsEnabledContext.Provider>;
}
