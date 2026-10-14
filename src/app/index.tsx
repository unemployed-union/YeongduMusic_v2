import { Redirect } from 'expo-router';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { BOTTOM_MENU_HREFS, visibleMenuIds } from '@/features/settings/menu-layout';

export default function Index() {
  const bottom = useMenuPreferences(state => state.layout.bottom);
  return <Redirect href={BOTTOM_MENU_HREFS[visibleMenuIds(bottom)[0]]} />;
}
