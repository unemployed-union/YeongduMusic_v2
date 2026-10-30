import { createSerialQueue } from '@/services/async/serial-queue';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import {
  defaultMenuLayout,
  parseMenuLayout,
  type MenuGroup,
  type MenuId,
  type MenuLayout,
} from '@/features/settings/menu-layout';

const KEY = 'yeongdumusic-menu-layout-v1';
type MenuPreferences = {
  layout: MenuLayout;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  setVisible: (group: MenuGroup, id: MenuId, visible: boolean) => Promise<void>;
  move: (group: MenuGroup, id: MenuId, direction: -1 | 1) => Promise<void>;
  restore: (layout: MenuLayout) => Promise<void>;
};

export const useMenuPreferences = create<MenuPreferences>((set, get) => {
  const persistenceQueue = createSerialQueue();
  let loading: Promise<void> | null = null;
  let writes = 0;
  async function update(change: (layout: MenuLayout) => MenuLayout) {
    await get().load();
    writes++;
    set({ saving: true });
    const write = persistenceQueue.run(async () => {
      // Resolve against the last successful write, including rapid queued toggles.
      const layout = parseMenuLayout(change(get().layout));
      const value = JSON.stringify(layout);
      try {
        if (Platform.OS === 'web') {
          localStorage.setItem(KEY, value);
        } else {
          await SecureStore.setItemAsync(KEY, value);
        }
      } catch {
        throw new Error('메뉴 설정을 저장하지 못했습니다. 다시 시도해 주세요.');
      }
      set({ layout, ready: true, error: null });
    });

    try {
      await write;
    } catch (cause) {
      set({
        error:
          cause instanceof Error
            ? cause.message
            : '메뉴 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
      });
    } finally {
      writes--;
      set({ saving: writes > 0 });
    }
  }
  return {
    layout: defaultMenuLayout(),
    ready: false,
    loading: false,
    saving: false,
    error: null,
    load: (force = false) => {
      if (loading) {
        return loading;
      }
      if (get().ready && !force) {
        return Promise.resolve();
      }
      set({ loading: true, error: null });
      loading = persistenceQueue
        .settled()
        .then(async () => {
          let value: string | null;
          if (Platform.OS === 'web') {
            if (typeof localStorage === 'undefined') {
              value = null;
            } else {
              value = localStorage.getItem(KEY);
            }
          } else {
            value = await SecureStore.getItemAsync(KEY);
          }

          set({
            layout: value === null ? defaultMenuLayout() : parseMenuLayout(JSON.parse(value)),
            ready: true,
          });
        })
        .catch(() => {
          set({
            ready: true,
            error: '메뉴 설정을 불러오지 못했습니다. 다시 불러오거나 메뉴 설정을 변경해 주세요.',
          });
        })
        .finally(() => {
          loading = null;
          set({ loading: false });
        });
      return loading;
    },
    setVisible: (group, id, visible) =>
      update((layout) => ({
        ...layout,
        [group]: layout[group].map((item) => (item.id === id ? { ...item, visible } : item)),
      })),
    move: (group, id, direction) =>
      update((layout) => {
        const items = [...layout[group]];
        const index = items.findIndex((item) => item.id === id);
        const next = index + direction;
        if (index >= 0 && next >= 0 && next < items.length) {
          [items[index], items[next]] = [items[next], items[index]];
        }
        return { ...layout, [group]: items };
      }),
    restore: (layout) => {
      const copy = parseMenuLayout(layout);
      return update(() => copy);
    },
  };
});
