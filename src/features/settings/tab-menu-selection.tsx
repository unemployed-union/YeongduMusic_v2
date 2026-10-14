import { useEffect, type ComponentProps } from 'react';
import type { Tabs } from 'expo-router';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { BOTTOM_MENU_ROUTES, visibleMenuIds } from './menu-layout';

type TabLayoutProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['layout']>>[0];

export function TabMenuSelection({ navigation }: Pick<TabLayoutProps, 'navigation'>) {
  const bottom = useMenuPreferences(state => state.layout.bottom);
  useEffect(() => {
    const state = navigation.getState();
    const visible = visibleMenuIds(bottom).map(id => BOTTOM_MENU_ROUTES[id]);
    if (!visible.some(name => name === state.routes[state.index].name)) navigation.navigate(visible[0]);
  }, [bottom, navigation]);
  return null;
}
