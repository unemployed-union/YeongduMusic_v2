import { useContext, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { NativeTabsEnabledContext } from './native-tabs-context';
import { ScreenBlurTargetContext } from './screen-blur-target';
import { TabBarInsetContext } from './tab-bar-inset';
import { MINI_PLAYER_INSET, MiniPlayer } from './mini-player';
import { ContentTitleBar } from './content-title-bar';
import { ContentTransition } from './content-transition';
import { TabletSidebar } from './tablet-sidebar';
import { BOTTOM_MENU_ROUTES } from '@/features/settings/menu-layout';
import { tabletTabInfo } from '@/features/settings/tablet-tab-navigation';
import { workspaceLayout } from '@/theme/layout';
import type { NativeTabFrameProps } from './native-tab-frame';

export function NativeTabFrame(props: NativeTabFrameProps) {
  const native = useContext(NativeTabsEnabledContext);
  return native ? <Frame {...props} /> : props.children;
}

function Frame({ children, active, detail }: NativeTabFrameProps) {
  const target = useRef<View | null>(null);
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const workspace = workspaceLayout(width, height, fontScale);
  const keyboardVisible = useKeyboardState(state => state.isVisible);
  const info = tabletTabInfo({ name: BOTTOM_MENU_ROUTES[active], ...(detail && { state: { routes: [detail] } }) });
  const sidebar = workspace.expanded && !info.libraryHome;
  const miniWidth = Math.min(760, workspace.contentWidth);
  // Reserve UIKit's measured safe area for system tabs and their accessory.
  const bottom = keyboardVisible ? 0 : insets.bottom;
  return <View style={styles.row}>
    {sidebar && <TabletSidebar active={active} width={workspace.sidebarWidth} />}
    <ContentTransition enabled={sidebar} transitionKey={info.transitionKey}>
      {sidebar && <ContentTitleBar title={info.title} />}
      <BlurTargetView ref={target} style={styles.content}>
        <ScreenBlurTargetContext.Provider value={target}>
          <TabBarInsetContext.Provider value={bottom}>{children}</TabBarInsetContext.Provider>
        </ScreenBlurTargetContext.Provider>
      </BlurTargetView>
      {/* On phones UIKit positions the shared BottomAccessory, even during queue restoration. */}
      {workspace.expanded && !keyboardVisible && <View pointerEvents="box-none" style={[styles.mini, { bottom: bottom + MINI_PLAYER_INSET }, workspace.expanded && {
        width: miniWidth, left: (sidebar ? 0 : workspace.sidebarWidth) + (workspace.contentWidth - miniWidth) / 2, alignSelf: 'auto',
      }]}><MiniPlayer blurTarget={target} /></View>}
    </ContentTransition>
  </View>;
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' }, content: { flex: 1 },
  mini: { position: 'absolute', width: '100%', maxWidth: 760, alignSelf: 'center', height: 64 },
});
